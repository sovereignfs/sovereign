# RFC 0091 — libSQL/`sqld` as the SQLite driver

**Status:** Draft\
**Date:** August 2026\
**Author:** Claude Code (workstream 0009 leg 2 spike, for kasunben)\
**Scope:** `packages/db`, `docker-compose.yml`, `docker-compose.prod.yml`; supersedes
[research 0003](../research/0003-horizontal-scaling-strategy.md)'s SQLite
recommendation\
**Incorporated into plan:** No — documentation-first. Blocks
[workstream 0009](../workstreams/0009-database-dialect-and-libsql-migration.md)
leg 3 pending the encryption-guarantee decision in Open Questions; the async-contract
and deployment-shape findings below are otherwise ready to implement.

---

## Summary

Workstream 0009 locked a decision to make `sqld` (libSQL's server) mandatory for
every SQLite-dialect Sovereign instance, replacing direct `better-sqlite3` file
access, staged across legs 2–4. This RFC is leg 2's deliverable: it reports what
a live spike against `sqld` actually found, proposes a driver shape for the parts
that are safe to proceed on, and — unlike a typical RFC — does **not** resolve
everything. One finding is a genuine blocker that needs a decision from kasunben,
not an engineering judgment call, so it's surfaced as an open question rather than
quietly designed around.

**The short version:** the async-contract concern research 0003 raised is real but
narrower than feared — 9 call sites, not a rewrite. The deployment shape is
straightforward and already stood up. But `sqld`'s server-side encryption-at-rest
has been an open, unresolved upstream issue for roughly two years, and where any
encryption-at-rest capability exists in the libSQL ecosystem today it's explicitly
documented as experimental and unsuitable for production data. Adopting `sqld` as
written today would silently remove the guarantee RFC 0071 was built to provide,
for zero currently-installed plugins to `requireEncryption: true` — HealthLog,
per the [RFC 0071 incident doc](../incidents/2026-07-24-rfc-0071-encryption-rollout.md).
That is not a call this RFC makes on its own.

## Motivation

Workstream 0009 leg 2 exists specifically to answer two questions research 0003
left open before any production code depends on the answer:

1. How does libSQL's client — async even for local access — reconcile with
   `packages/db`'s dialect-agnostic async contract?
2. How does RFC 0071's SQLCipher-based at-rest encryption map onto a
   `sqld`-backed database?

Plus two things the workstream doc flagged as needing a concrete decision: the
driver shape itself, and embedded-replica vs. remote-only deployment.

## Current state (what this builds on)

- `packages/db/src/dialect.ts:1` — `Dialect = 'sqlite' | 'postgres'`, resolved from
  `DB_DIALECT`/`DATABASE_URL` (`resolveDialect()`, `dialect.ts:20`).
- `packages/db/src/client.ts` and `packages/db/src/plugin-client.ts` open SQLite via
  `drizzle-orm/better-sqlite3` directly against a local file
  (`resolveSqlitePath()`), synchronously.
- `packages/db/src/sqlite-encryption.ts:314` — `openKeyedSqlite()`, described in its
  own comment as "the single chokepoint every SQLite call site in this package (and
  its self-contained `apps/auth` twin) uses." It calls SQLCipher-specific pragmas
  (`cipher='sqlcipher'`, `sqlite.key(key)`) directly against a
  `better-sqlite3-multiple-ciphers` `Database` instance — raw driver API, not
  something Drizzle's query builder touches.
- `docs/architecture-rules.md:42-47` — "The platform data layer is async... On
  SQLite the underlying better-sqlite3 calls still run synchronously; the async
  signature is the dialect-agnostic contract. Never reintroduce a synchronous
  platform-DB read." Every platform-level caller (`getPlatformDb()`,
  `sdk.platform.getConfig()`, etc.) already `await`s regardless of dialect.
- Despite that rule, `packages/db/src/platform-db.ts` has **7** call sites and
  `scripts/seed.ts` has **2** that use SQLite-specific _synchronous_ driver APIs
  inside dialect branches — Drizzle's sync-only `.all()`/`.get()`/`.run()` (only
  available on the `better-sqlite3` adapter) in `platform-db.ts`, and raw
  `db.prepare(sql).get()` (bypassing Drizzle entirely) in `seed.ts`. Full list:
  `platform-db.ts:172,186,211,250,273,312,349`; `seed.ts:149,156`.
- RFC 0071's own text: Postgres already has a documented, weaker fallback —
  "no SQLCipher equivalent — falls back to disk + `sslmode`," with a startup
  **warning** (not an enforced failure) when a `requireEncryption` plugin resolves
  to Postgres. This is the existing precedent for "this dialect can't give the
  real guarantee."
- CLAUDE.md's own standing note: RFC 0071's encryption surface "has an
  above-average bug surface — treat it as still-settling, not hardened," with
  three separate hardening passes so far including a production incident.

## Proposed design

### Deployment shape — resolved

`sqld` added to `docker-compose.yml` and `docker-compose.prod.yml`, internal-only
(no host port), same pattern as the `auth` service. Gated behind a
`sqld-spike` Compose profile so `docker compose up` is unchanged for every
existing deployment until leg 3 actually wires the platform to it:

```
docker compose --profile sqld-spike up sqld
```

Image: `ghcr.io/tursodatabase/libsql-server:latest`. Config used in the spike:
`SQLD_NODE=primary`, default HTTP (`0.0.0.0:8080`) and gRPC (`0.0.0.0:5001`)
listeners, data at `/var/lib/sqld` (bind-mounted in dev, a dedicated
`sovereign_sqld_data` named volume in prod — deliberately separate from
`sovereign_data`, since `sqld`'s on-disk format isn't a set of `.db` files the
existing backup/restore tooling understands).

**Embedded replica vs. remote-only:** primary-only. Nothing in Sovereign's
design calls for a remote/edge replica — there is exactly one `sqld` instance
per deployment, reached only by that deployment's own `runtime`/`auth`
containers over the internal Docker network. Embedded-replica mode exists to
sync a local read replica from a _remote_ primary (e.g. Turso Cloud); that
doesn't describe this topology. Settled by default; revisit only if leg 3
surfaces a concrete need.

**Auth:** not yet decided. `sqld` supports HTTP basic (`SQLD_HTTP_AUTH`) or JWT
(`SQLD_AUTH_JWT_KEY`/`_FILE`). The spike ran with neither, relying on the
Docker network being unreachable from the host. Leg 3 should decide whether
network isolation alone is sufficient (mirroring how Postgres is typically
deployed in this stack today) or whether `sqld` should also require its own
credential — flagged for leg 3, not blocking this RFC.

### Driver shape — resolved

`Dialect` stays `'sqlite' | 'postgres'` — **no third literal.** Since
workstream 0009 already locked "mandatory, no per-plugin override," there is no
remaining case where the platform needs to distinguish "plain-file SQLite" from
"`sqld`-backed SQLite" at the type level. `DB_DIALECT=sqlite` continues to mean
what it means today from the operator's perspective; only the connection URL
scheme changes (`file:./data/sovereign.db` → an `http://sqld:8080`-style service
URL) and the driver underneath changes (`drizzle-orm/better-sqlite3` →
`drizzle-orm/libsql` + `@libsql/client`). This is a smaller footprint than research
0003 assumed when it treated `sqld` as an "opt-in third dialect path."

Call sites: `packages/db/src/client.ts` (platform DB) and `plugin-client.ts`
(`getPluginDb`, `provisionPluginDb`, `dropPluginDb`) swap their `sqlite` branch's
driver construction. `apps/auth/src/db.ts` needs the equivalent change — it
duplicates the SQLite-opening logic deliberately (`architecture-rules.md:51`, "auth
does not depend on `packages/db`").

### Async-contract migration — resolved, smaller than feared

Confirmed empirically (live spike against the running `sqld` container,
`@libsql/client@0.15`): `.execute()`, `.transaction()`, and `.batch()` all return
Promises unconditionally — there is no synchronous fast path, unlike
`better-sqlite3`.

This is **not** the platform-wide rewrite research 0003 worried about. The
public platform-data-layer contract is already async-signatured on every dialect
(`architecture-rules.md:42-47`) — callers everywhere already `await`. The actual
work is the 9 call sites listed under Current State: convert `platform-db.ts`'s
7 dialect-branched `.all()`/`.get()`/`.run()` calls to `await`-based Drizzle
calls (mirroring the existing Postgres branch immediately next to each one — the
pattern to copy already exists in the same file), and rewrite `seed.ts`'s 2 raw
`db.prepare(sql).get()` calls to `await client.execute(sql)`. Comparable in size
to a single focused PR, not "comparable to the existing per-dialect schema
duplication" as research 0003 estimated.

### Encryption-at-rest — **not resolved, see Open Questions**

## Alternatives considered

- **Keep plain-file SQLite** — already rejected; workstream 0009 locked
  "mandatory, staged" over "opt-in third tier" in the design session that
  produced it. Not re-litigated here.
- **rqlite, a bespoke SQLite server** — already rejected in research 0003 (no
  Drizzle driver / reinventing what libSQL solves). Not re-litigated here.
- **Turso's from-scratch Rust rewrite ("Turso" the database, distinct from
  libSQL)** — rejected for now. Per Turso's own co-founder: "Turso is a new
  SQLite-compatible database, rewritten from scratch in Rust, currently in
  beta... we're actively working towards adding Turso to it [Turso Cloud]."
  libSQL/`sqld` is what actually powers Turso Cloud in production today; the
  newer rewrite is explicitly the vendor's stated long-term direction but is
  earlier-stage than `sqld` itself. Worth tracking as a future migration risk —
  today's adoption target may itself be superseded eventually — but adopting
  the _less_ mature of the two available options to hedge against that would be
  backwards.

## Open questions

### Blocking: no viable RFC 0071 equivalent in `sqld` today

- Upstream issue [tursodatabase/libsql#1756](https://github.com/tursodatabase/libsql/issues/1756),
  "Enable encryption at rest in libsql-server," opened September 2024, **still
  open** as of this spike (~2 years) — "Commit 71a7cfc seems to have disabled
  encryption at rest in the server. Let's investigate why and work towards
  enabling it."
- Independently: where an encryption-at-rest capability exists anywhere in the
  libSQL/Turso client ecosystem, it is explicitly documented as experimental and
  "not production ready... should not be used for critical data."
- The `sqld` container itself prints "This software is in BETA version" on every
  boot — observed directly when this spike brought it up.

Adopting `sqld` as the mandatory SQLite backend, as written today, means every
SQLite-dialect instance loses RFC 0071's actual enforced guarantee — not
degrades it, loses it — with no equivalent available to fall back to. This is
exactly the "blocking incompatibility... with no acceptable mitigation" case
workstream 0009 leg 2 named as a reason to stop and escalate rather than push
into leg 3 on a guess. Options, for kasunben to choose from — this RFC does not
pick one:

1. **Wait for upstream.** Track issue #1756, revisit before leg 3 starts. Risk:
   open-ended timeline; the issue has already been open ~2 years with no visible
   progress.
2. **Accept a guarantee downgrade**, matching Postgres's existing precedent:
   `sqld`-backed SQLite falls back to "disk + operator-managed encryption,
   startup warning" instead of an enforced platform guarantee. Real cost: this
   is a regression for the one plugin that actually depends on the stronger
   guarantee today (HealthLog, `requireEncryption: true`) — from "the platform
   refuses to run without a key" to "the platform warns and proceeds anyway."
   Needs its own product decision and a `docs/upgrade.md` migration note, not
   a quiet fallback.
3. **Encryption carve-out.** Keep `requireEncryption` plugins (and/or the whole
   platform, operator's choice) on plain-file SQLite + SQLCipher even after
   everything else moves to `sqld`. Directly reopens workstream 0009's
   "mandatory, no exceptions" decision — narrowly, for this one case.
4. **Reopen mandatory-vs-opt-in itself**, closer to research 0003's original
   recommendation — plain-file SQLite stays available as an escape hatch until
   `sqld`'s encryption story matures, rather than a hard, dateless cutover.

### Non-blocking

- `sqld` auth model for the internal Docker network (see Deployment shape above)
  — leg 3's call, not this RFC's.

## Adoption path

**Leg 3 is blocked** until the encryption question above is decided. Once it
is: leg 3 implements the driver swap (`client.ts`, `plugin-client.ts`,
`apps/auth/src/db.ts`, the 9 async-contract call sites, per-dialect schema files
under `packages/db/src/schema/`), scoped by whichever encryption option was
chosen. Leg 4 remains the one-time data cutover for the single production
instance.

No published-package semver impact — `packages/db` and `apps/auth` are both
private, unpublished packages.

## Changelog

| Version | Date        | Change                                                                        |
| ------- | ----------- | ----------------------------------------------------------------------------- |
| 0.1     | August 2026 | Initial draft from workstream 0009 leg 2's live spike against `sqld` 0.24.33. |
