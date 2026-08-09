# RFC 0091 — libSQL/`sqld` as the SQLite driver

**Status:** Accepted\
**Date:** August 2026\
**Author:** Claude Code (workstream 0009 leg 2 spike, for kasunben)\
**Scope:** `packages/db`, `docker-compose.yml`, `docker-compose.prod.yml`; supersedes
[research 0003](../research/0003-horizontal-scaling-strategy.md)'s SQLite
recommendation\
**Incorporated into plan:** Yes — the encryption-carve-out recommendation was
approved via merge of [PR #364](https://github.com/sovereignfs/sovereign/pull/364),
which served as its review/sign-off vehicle. Workstream 0009 leg 3
(`packages/db` driver swap) is unblocked.

---

## Summary

Workstream 0009 locked a decision to make `sqld` (libSQL's server) mandatory for
every SQLite-dialect Sovereign instance, replacing direct `better-sqlite3` file
access, staged across legs 2–4. This RFC is leg 2's deliverable: it reports what
a live spike against `sqld` actually found, and proposes a design for all four
of the questions leg 2 was asked to resolve — including the encryption question,
which turned out to be a genuine blocker rather than an engineering judgment
call.

**The short version:** the async-contract concern research 0003 raised is real but
narrower than feared — 9 call sites, not a rewrite. The deployment shape is
straightforward and already stood up. `sqld`'s server-side encryption-at-rest,
however, has been an open, unresolved upstream issue for roughly two years, and
where any encryption-at-rest capability exists in the libSQL ecosystem today
it's explicitly documented as experimental and unsuitable for production data.
Adopting `sqld` unconditionally would silently remove the guarantee RFC 0071 was
built to provide, for the one plugin that actually depends on it — HealthLog,
per the [RFC 0071 incident doc](../incidents/2026-07-24-rfc-0071-encryption-rollout.md).
This RFC's recommendation is a narrow **encryption carve-out**: everything that
RFC 0071 would encrypt today stays on plain-file SQLite + SQLCipher; everything
else moves to `sqld`. It's a security-guarantee tradeoff, so it's flagged for
kasunben's explicit decision rather than treated as settled by this document
alone — see Proposed design and Alternatives considered.

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

`sqld` lives in its own overlay file, `docker-compose.sqld.yml`, mirroring the
existing `docker-compose.postgres.yml` pattern rather than being embedded in
the base compose files — internal-only (no host port), reached by service
name, a `/health`-backed healthcheck matching `postgres`'s `pg_isready` one.
`docker compose up` is unchanged for every existing deployment; the overlay is
opt-in by construction (nobody gets it without the extra `-f`):

```
docker compose -f docker-compose.prod.yml -f docker-compose.sqld.yml up --build -d
```

Image: `ghcr.io/tursodatabase/libsql-server:latest`. Config used in the spike:
`SQLD_NODE=primary`, default HTTP (`0.0.0.0:8080`) and gRPC (`0.0.0.0:5001`)
listeners, data at `/var/lib/sqld` inside the container, backed by a dedicated
`sovereign_sqld_data` named volume — deliberately separate from
`sovereign_data`, since `sqld`'s on-disk format isn't a set of `.db` files the
existing backup/restore tooling understands.

**Unlike `docker-compose.postgres.yml`, this overlay doesn't yet override
`runtime`/`auth`'s connection settings** — there's no driver in `packages/db`
that consumes an `sqld` URL yet (that's leg 3). It only stands the service up
for prototyping directly. Once leg 3 ships, expect this overlay's shape to
change: `sqld` is meant to become mandatory whenever `DB_DIALECT=sqlite`
(workstream 0009's locked decision), not an opt-in alternative the way
Postgres is — so its service definition most likely folds into the base
`docker-compose.yml`/`.prod.yml` directly at that point, rather than staying
behind a separate overlay. `docker-compose.postgres.yml` remains the real
"switch away from the default dialect" file either way.

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

### Encryption-at-rest — recommended: a carve-out scoped to RFC 0071's existing boundary

**Recommendation:** move to `sqld` everywhere RFC 0071 would **not** apply
encryption today; keep plain-file SQLite + SQLCipher everywhere it **would**.
Reuse RFC 0071's own existing boundary rather than inventing a new one:

- The platform DB (`sovereign.db`) and `apps/auth`'s DB (`auth.db`) stay on
  plain-file SQLite whenever the operator has `SOVEREIGN_DB_ENCRYPTION_KEY` set
  at all — that env var is the instance-wide encryption toggle, and moving
  those two databases to `sqld` would silently drop the guarantee for _every_
  operator who turned it on, not only `requireEncryption` plugin authors.
- Any isolated plugin database stays on plain-file SQLite whenever that
  plugin's manifest declares `database.requireEncryption: true` — the
  **raise-only** semantics from task 8.15 are unaffected: a plugin can still
  never be _forced_ onto `sqld` against a real encryption requirement it
  declared, regardless of what the platform's own dialect otherwise is.
- Everything else — the platform/auth DBs when no key is set, and every
  plugin database that never asked for encryption — moves to `sqld`.

This is not the workstream's original "mandatory, no exceptions" as written —
it's `resolvePluginDialect()`'s removed per-plugin override (leg 1) coming back
in a much narrower, principled form: not "any plugin can pick any dialect for
any reason" (arbitrary, ungoverned, unused by any of the 12 shipped manifests —
exactly why leg 1 removed it), but "a database that has a real, already-validated
encryption requirement keeps the one mechanism that satisfies it." The condition
is a single existing boolean this codebase already checks
(`resolvePluginEncryptionKey`/`checkEncryptionMarker`,
`packages/db/src/sqlite-encryption.ts`), not new per-plugin flexibility.

**Follow-up spike: does `sqld`'s encryption actually work?** Built
`libsql-server` locally from source with `--build-arg ENABLE_FEATURES=encryption`
(the Dockerfile already has this arg; no upstream code change needed) and tested
it directly rather than relying on the "experimental" label alone:

- Startup banner correctly reports `encryption at rest: enabled` when
  `SQLD_ENCRYPTION_KEY` is set.
- Wrote a canary string through the client, confirmed round-trip read, then
  restarted the container with the **same** key — data read back correctly.
  Restarted with the **wrong** key — `sqld` refused to start with a clear
  `Error code 26: File opened that is not a database file`, rather than
  serving garbage or corrupting anything. Fails safely.
- Searched every file on disk (binary-safe `grep -a`, since a naive `grep`
  silently skips files it detects as binary — a real methodology bug this
  spike caught by cross-checking against a plaintext baseline, which showed
  the canary present in `data-wal`/`wallog` when unencrypted, and absent from
  every file — including those same `data-wal`/`wallog` — when encrypted).
  The canary and shorter substrings of it were genuinely absent everywhere in
  the encrypted case.

**So the feature is not broken for the basic case** — mechanically, a single
key set once, no rekeying, no `bottomless` S3 replication, works correctly and
fails safely. This softens "no viable equivalent" from the earlier draft: it's
not vaporware. But it doesn't overturn the carve-out recommendation, for three
reasons that don't require the feature to be broken:

1. **No published image ships it.** Using it means building and maintaining
   our own `libsql-server` image from source with a non-default Cargo feature,
   tracking upstream releases ourselves — real, ongoing operational cost,
   not a one-time flip.
2. **No HMAC.** The cipher is `Aes256Cbc` with no message authentication
   (`libsql-sys/src/connection.rs`) — unlike SQLCipher, which authenticates
   by default. This is a permanent design property, not something that
   matures with time.
3. **This spike is not a security audit.** One afternoon of black-box testing
   against the single-key case is not the bar RFC 0071 was held to (three
   hardening passes, a production incident, ongoing scrutiny). Treating a
   quick "it round-trips" as equivalent confidence would undersell exactly
   the caution CLAUDE.md asks for in this area.

**Cost, stated plainly:** `packages/db`'s SQLite path keeps two drivers
(`better-sqlite3-multiple-ciphers` for the encrypted case, `@libsql/client` for
everything else) instead of fully retiring `better-sqlite3`. That's real,
ongoing duplication — some of exactly what this workstream set out to remove —
carried specifically because RFC 0071's guarantee has cost three hardening
passes and a production incident to earn, and this RFC is not willing to spend
that for a `sqld` feature with a ~2-year-open upstream issue and no committed
timeline. The carve-out is explicitly revisitable: once `sqld`'s
encryption-at-rest matures (issue #1756 closes and the fix ships stable, not
just merges), a follow-up leg can retire the `better-sqlite3` path entirely.

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
- **Wait for upstream before starting leg 3 at all.** Track issue #1756, block
  every part of the migration — not just the encrypted case — until it closes.
  Rejected: the issue has been open ~2 years with no visible progress, and this
  would hold the async-contract and driver-shape work (both fully resolved,
  see above) hostage to a dateless external timeline for no reason — those
  parts don't touch encryption at all.
- **Self-build a `sqld` image with `--build-arg ENABLE_FEATURES=encryption`
  instead of a carve-out**, using the confirmed-working feature from the spike
  above for every database, encrypted or not — no `better-sqlite3` path at
  all. Rejected for now: this trades a self-contained, well-tested dependency
  (`better-sqlite3-multiple-ciphers`, already in the Docker image, already
  hardened over three passes) for an unpublished custom build we'd own the
  maintenance of, using a no-HMAC cipher, validated by one afternoon of
  black-box testing rather than a real audit. Worth revisiting once `sqld`
  ships this in a published image and it's had real production exposure
  elsewhere — not something to build our own supply chain around today.
- **Accept a guarantee downgrade instead of a carve-out**, matching Postgres's
  existing "disk + operator-managed encryption, startup warning" precedent for
  every SQLite database, encrypted or not. Rejected: this is a real regression
  for HealthLog specifically — from "the platform refuses to run without a
  key" to "the platform warns and proceeds anyway" — traded away only to avoid
  a driver-duplication cost this RFC considers acceptable given RFC 0071's own
  track record (three hardening passes, one production incident) of being
  worth extra care.
- **Reopen mandatory-vs-opt-in itself**, closer to research 0003's original
  "opt-in third tier" recommendation — plain-file SQLite stays available as a
  general escape hatch, not just for the encrypted case. Rejected as broader
  than the actual gap: the async-contract and deployment-shape questions are
  fully resolved and don't need an opt-out; only the encryption boundary does,
  and the carve-out already covers exactly that boundary without reopening
  workstream 0009's mandatory decision for everything else.

## Open questions

- `sqld` auth model for the internal Docker network (see Deployment shape above)
  — leg 3's call, not this RFC's.
- Timeline for retiring the carve-out once `sqld`'s encryption-at-rest matures —
  not urgent; revisit when issue #1756 actually closes, not on a schedule.
- Whether to post this spike's findings (the working build flag, the round-trip
  and wrong-key results) as a comment on
  [tursodatabase/libsql#1756](https://github.com/tursodatabase/libsql/issues/1756).
  Independent of the carve-out decision — this is "share a reproduction that
  might help an idle upstream issue," not something blocking or blocked by
  leg 3.

## Adoption path

**Approved via merge of PR #364.** Leg 3 implements the driver swap (`client.ts`, `plugin-client.ts`,
`apps/auth/src/db.ts`, the 9 async-contract call sites, per-dialect schema files
under `packages/db/src/schema/`) with the carve-out's boundary condition
(current key/`requireEncryption` state) built in from the start, not bolted on
after. Leg 4 remains the one-time data cutover for the single production
instance, excluding whichever databases the carve-out keeps on plain-file
SQLite.

No published-package semver impact — `packages/db` and `apps/auth` are both
private, unpublished packages.

## Changelog

| Version | Date        | Change                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0.1     | August 2026 | Initial draft from workstream 0009 leg 2's live spike against `sqld` 0.24.33.                                                                                                                                                                                                                                                                                                                                                                                             |
| 0.2     | August 2026 | Added an explicit recommendation for the encryption question: a carve-out scoped to RFC 0071's existing key/`requireEncryption` boundary. Still needs kasunben's sign-off — a security-guarantee tradeoff, not an engineering call this RFC finalizes alone.                                                                                                                                                                                                              |
| 0.3     | August 2026 | Follow-up spike: built `libsql-server` from source with `--build-arg ENABLE_FEATURES=encryption` and tested it directly. The feature works correctly for the basic single-key case (round-trips, fails safely on a wrong key, no plaintext leakage in the main file, WAL, or replication log) — softens "no viable equivalent" to "no published/audited equivalent." Carve-out recommendation unchanged; added self-built-image as a considered-and-rejected alternative. |
