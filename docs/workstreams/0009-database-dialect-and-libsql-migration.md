# Workstream 0009 — Database dialect consolidation and libSQL migration

**Status:** ✅ Definition of done satisfied — legs 1–4 all done; the actual
production cutover doesn't apply (the single production instance turned out
to be Postgres-dialect, not SQLite — see epic task 8.25)\
**Date:** August 2026\
**Author:** Claude Code (from a design session with kasunben)\
**Goal owner:** kasunben\
**RFCs:** [0091](../rfcs/0091-libsql-sqld-driver.md) (Accepted — leg 2's spike,
approved via merge of PR #364), superseding Research 0003's "opt-in third
tier" recommendation for libSQL\
**Epics touched:** 0 (Infrastructure), 8 (Data Sovereignty)\
**Research:** [0003](../research/0003-horizontal-scaling-strategy.md)
(horizontal scaling strategy) — its SQLite recommendation is superseded by
this workstream; the file-storage and orchestration sections are unaffected

> **Why leg 2 wrote the RFC instead of it preceding the workstream.** Research
> 0003 scoped libSQL/`sqld` as an option but explicitly left two questions
> open — how libSQL's async client reconciles with `packages/db`'s
> dialect-agnostic async contract, and how RFC 0071's SQLCipher-based
> encryption maps onto `sqld` (the doc never addressed encryption at all).
> Those were empirical questions a spike had to answer, not ones an RFC should
> have guessed at — so this did **not** qualify for the research-as-design
> exception ([documentation-structure.md](../documentation-structure.md)),
> and leg 2 produced RFC 0091 as its own deliverable instead. Resolved: see
> the Decisions table below and RFC 0091 directly.

---

## Goal

Two changes land together because the second makes the first easier to reason
about, not because they're the same change. First: an operator's dialect
choice (`DB_DIALECT` / `DATABASE_URL`) becomes the single source of truth for
every database the platform opens — platform, auth, every plugin — with no
per-plugin manifest override to reconcile against it. Second: SQLite-dialect
instances stop opening `better-sqlite3` files directly and instead talk to a
dedicated `sqld` (libSQL server) container, mandatorily, closing the
horizontal-scaling gap Research 0003 identified — the single production
instance is cut over to it as a one-time migration, with no dual-write or
back-compat period, since only one production instance exists today.

## Definition of done

- [x] `database.dialect` no longer exists in the manifest schema; no plugin
      can diverge from the platform's dialect. (Leg 1, PR #353.)
- [x] An RFC exists resolving: (a) how the async libSQL client interacts with
      `packages/db`'s dialect-agnostic async contract, (b) how RFC 0071
      at-rest encryption maps onto `sqld`, (c) the concrete driver shape for
      `packages/db/src/client.ts` and `plugin-client.ts`. (Leg 2, RFC 0091,
      PR #364.)
- [x] `sqld` runs as a service, reachable by `runtime`/`auth` — delivered as
      a separate `docker-compose.sqld.yml` overlay (matching the existing
      `docker-compose.postgres.yml` pattern) rather than embedded in the base
      compose files, since the encryption carve-out keeps both code paths
      live in the same process regardless. (Leg 2/3, PR #364, #367.)
- [x] `packages/db`'s SQLite path talks to `sqld` instead of opening
      `better-sqlite3` files directly, for the platform DB, `apps/auth`'s DB,
      and every isolated plugin DB — except where the RFC 0091 encryption
      carve-out keeps a database on plain-file SQLite+SQLCipher. (Leg 3,
      PR #367.)
- [x] The single production instance's existing SQLite files are migrated to
      the `sqld`-backed setup via a documented, rehearsed, backup-first
      runbook, verified against real data — **N/A, not a gap.** Leg 4
      delivered the tool and runbook, verified live against representative
      fixture data. Rehearsing the cutover against a copy of the real
      production instance (task 8.25's starting point) revealed that
      instance's platform dialect is already **Postgres**, not SQLite — it
      has no plain-file SQLite databases for `sv db migrate-to-sqld` to cut
      over. This box can never be checked by _this_ production instance; the
      tool and runbook remain ready for any future SQLite-dialect Sovereign
      deployment. See epic task 8.25 for what that instance actually needed
      instead (a Postgres migration tool for plugins stranded on pre-task-8.22
      per-plugin SQLite overrides).
- [x] Research 0003 is marked superseded for its SQLite recommendation
      (done — see the notice at the top of that doc).

## Decisions locked

| Decision                | Choice                                                                                           | Rejected alternative and why                                                                                                                                                                                                                                                                                                 |
| ----------------------- | ------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dialect selection scope | Single `.env`-driven platform-wide dialect (`DB_DIALECT`/`DATABASE_URL`); no per-plugin override | Per-plugin `database.dialect` override (status quo) — unused by all 12 shipped/example manifests; its only real function was creating the ambiguity the `requireEncryption`+`dialect` refinement had to resolve                                                                                                              |
| libSQL adoption posture | **Mandatory**, staged across legs 2–4                                                            | Opt-in third tier (Research 0003's original recommendation) — reopens "does the operator need a second container" for every self-hoster, and leaves two dialect-selection code paths live indefinitely; explicitly rejected in favor of a clean, universal cutover now that there is only one production instance to migrate |
| Migration strategy      | One-time cutover script + runbook against the single production instance                         | Zero-downtime dual-write / phased rollout — unnecessary machinery for one instance; revisit if a second production instance exists before leg 4 ships                                                                                                                                                                        |
| Isolation-mode default  | **Unchanged** — `shared` stays the manifest default _(superseded — see below)_                   | Flipping to `isolated`-by-default — raised and explicitly rejected in the design session that produced this workstream; out of scope here entirely, not deferred                                                                                                                                                             |
| RFC timing              | Leg 2 (the spike) produces the RFC as its own deliverable, gating leg 3                          | Writing the RFC before any spike — the async-contract and encryption questions are empirical; a spike de-risks the RFC instead of the RFC guessing at findings                                                                                                                                                               |

**Superseded, 2026-08:** the isolation-mode default row above no longer holds. A
follow-up decision (outside this workstream — see epic task
[8.28](../epics/data-sovereignty.md#-828--retire-the-databaseisolationshared-manifest-option))
retired the `database.isolation`/`"shared"` manifest option entirely: every
`sovereign`/`community` plugin is now unconditionally isolated, with `type: "platform"`
plugins (`account`, `console`, `launcher`) exempted the same way `apps/auth` already was.
The reasoning that led here — a track record of isolation-specific bugs found migrating
real plugins to Postgres (tasks 8.26–8.27) prompted a closer look at what `shared` mode
was actually buying anyone, and the answer turned out to be "very little, for real
third-party plugins" — is captured in that task, not repeated here.

**Resolved by leg 2's RFC** (0091):

| Question                                                                                                                             | Resolution                                                                                                                                                                                                                                                |
| ------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| How the async libSQL client reconciles with `packages/db`'s sync-today SQLite call sites                                             | Smaller than feared: the platform data layer is already async-signatured on every dialect. 9 concrete call sites need conversion (7 in `platform-db.ts`, 2 in `scripts/seed.ts`) — not a rewrite.                                                         |
| How RFC 0071's SQLCipher encryption maps onto `sqld`                                                                                 | It doesn't, cleanly — `sqld`'s encryption-at-rest is unpublished/unaudited (see RFC 0091). **Encryption carve-out**: anything RFC 0071 would encrypt today stays on plain-file SQLite + SQLCipher; everything else moves to `sqld`. Approved via PR #364. |
| Whether `Dialect` (`packages/db/src/dialect.ts:1`) gains a third literal or libSQL stays a connection-shape variant under `'sqlite'` | No third literal — `DB_DIALECT=sqlite` keeps meaning what it means today; only the connection scheme and driver change underneath.                                                                                                                        |
| Embedded-replica vs. remote-only `sqld` deployment shape                                                                             | Primary-only. No topology in this design calls for a remote/edge replica.                                                                                                                                                                                 |

## Prerequisites

| Prerequisite                                                                                                                                                                                                                                                                                                                                                                                                   | Owner    | Status                                                                     |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | -------------------------------------------------------------------------- |
| None for leg 1 — self-contained, subtractive manifest change                                                                                                                                                                                                                                                                                                                                                   | Platform | ✅ Done — merged (PR #353)                                                 |
| None for leg 2 — independent spike                                                                                                                                                                                                                                                                                                                                                                             | Platform | ✅ Done — merged (PR #364)                                                 |
| Leg 2's RFC accepted                                                                                                                                                                                                                                                                                                                                                                                           | kasunben | ✅ Done — approved via merge of PR #364                                    |
| Leg 3 merged                                                                                                                                                                                                                                                                                                                                                                                                   | Platform | ✅ Done — merged (PR #367)                                                 |
| Leg 4's tool + runbook built and verified live against representative fixture data                                                                                                                                                                                                                                                                                                                             | Platform | ✅ Done — this leg                                                         |
| Sequencing revised from the original "leg 3 soaks in prod first" gate: for a single instance, deploying leg 3 alone would immediately orphan any existing unencrypted plaintext data (fresh empty sqld namespaces open in its place) — there's no safe way to run leg 3 in production before leg 4's cutover exists. Leg 3 + the cutover now deploy together as one coordinated maintenance operation instead. | kasunben | ✅ Decided                                                                 |
| Cutover rehearsed against a copy of the real production instance's data, then run for real                                                                                                                                                                                                                                                                                                                     | kasunben | ✅ N/A — the instance is Postgres-dialect, not SQLite (see epic task 8.25) |

## Legs

| Leg | Name                                             | Epic tasks | Epics | Gate?   | Done when                                                                                                                      |
| --- | ------------------------------------------------ | ---------- | ----- | ------- | ------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Dialect consolidation                            | 8.22       | 8     | No      | The manifest `dialect` field and its cross-validation refinement are gone; `resolvePluginDialect` always follows the platform. |
| 2   | `sqld` container spike + RFC                     | 0.20       | 0     | **Yes** | `sqld` runs in Compose; the RFC resolves the async-contract and encryption questions and specifies leg 3's driver shape.       |
| 3   | `packages/db` libSQL driver + platform migration | 8.23       | 8     | No      | The platform DB, `apps/auth`'s DB, and every isolated plugin DB open through `sqld`, per the RFC.                              |
| 4   | One-time data cutover                            | 8.24       | 8     | No      | The single production instance runs on the `sqld`-backed setup, verified against a pre-cutover backup.                         |

Each leg is one branch, one draft PR, one review gate. The agent runs
uninterrupted within a leg and stops at its end. See
[README.md](README.md#the-leg-contract).

## Leg detail

### Leg 1 — Dialect consolidation

**Epic tasks:** 8.22.

**Why this leg is first:** independent of everything else here, small, and
removes dead optionality that would otherwise need reconciling with whatever
leg 2's RFC lands on. No reason to carry it forward.

**Technical notes:** the field lives at
`packages/manifest/src/schema.ts:55` (`dialect: z.enum(['sqlite']).optional()`
inside `manifestDatabaseSchema`, defined from line 50); the
`requireEncryption`+`dialect` refinement is at `schema.ts:656-669` and is
distinct from the `requireEncryption`+`isolation` refinement at
`schema.ts:641-654`, which is unaffected. `resolvePluginDialect()`
(`packages/db/src/plugin-client.ts:31`) currently throws when a plugin
requests `'postgres'` on a SQLite platform and silently follows the platform
otherwise when a plugin requests `'sqlite'` on a SQLite platform, or forces
`'sqlite'` on a Postgres platform — all three of those branches collapse to
"always follow the platform."

**Do not proceed if:** a repo-wide grep (including any `.local` plugin
present in the working tree, not just the 12 in-repo plugins checked at
design time) turns up a manifest actually using `database.dialect`. That
plugin's need is a live requirement to understand before deleting the field
out from under it.

### Leg 2 — `sqld` container spike + RFC · **GATE**

**Epic tasks:** 0.20.

**Blocked on:** nothing structurally — this is the leg the rest of the
workstream is blocked on, not the other way around.

**Technical notes:** add `sqld` to `docker-compose.yml`/`.prod.yml` following
the `auth` service's internal-only pattern (`docker-compose.yml`, Task 0.6) —
no host port unless a concrete reason emerges to expose one. Prototype
`@libsql/client` against it far enough to observe, not guess at, the two open
questions: `packages/db`'s existing dialect-agnostic contract
(`docs/architecture-rules.md:42-47`) assumes calls resolve the same way
regardless of dialect — confirm what actually breaks if the SQLite path
becomes async-in-practice where it wasn't before, at both the platform-DB
call sites and the `getPluginDb()` per-plugin path
(`packages/db/src/plugin-client.ts:100`). Separately, and just as
important: `openKeyedSqlite()` (`packages/db/src/sqlite-encryption.ts:314`)
is described in its own comment as "the single chokepoint every SQLite call
site in this package (and its self-contained `apps/auth` twin) uses" — it
calls SQLCipher-specific pragmas (`cipher='sqlcipher'`, `sqlite.key(key)`)
directly against a `better-sqlite3-multiple-ciphers` `Database` instance.
Research 0003 never touches encryption; do not let the RFC ship without an
explicit answer here. CLAUDE.md is explicit that this general area — RFC
0071's at-rest encryption — has an above-average bug surface across three
separate hardening passes including a production incident
(`docs/incidents/2026-07-24-rfc-0071-encryption-rollout.md`); read that
incident doc before treating any encryption-path finding here as minor.

**This leg's deliverable is the RFC, not merged driver code.** The
prototype exists to inform the RFC; it does not need to be production-shaped
or wired into `packages/db`'s real call sites.

**Do not proceed (to leg 3) if:** the RFC is not written and accepted by
kasunben, or the spike surfaces a blocking incompatibility (e.g. no viable
encryption story for `sqld`-backed databases) with no acceptable mitigation —
escalate and revise the plan rather than pushing into leg 3 on a guess.

### Leg 3 — `packages/db` libSQL driver + platform migration

**Epic tasks:** 8.23.

**Scope, per RFC 0091 (accepted):**

- New driver: `drizzle-orm/libsql` + `@libsql/client`, replacing
  `drizzle-orm/better-sqlite3` for every SQLite database the **encryption
  carve-out doesn't exempt**. `Dialect` stays `'sqlite' | 'postgres'` — no
  third literal.
- **Encryption carve-out boundary** (built in from the start, not bolted on
  after): the platform DB and `apps/auth`'s DB stay on plain-file SQLite +
  `better-sqlite3-multiple-ciphers` whenever `SOVEREIGN_DB_ENCRYPTION_KEY` is
  set; any isolated plugin DB stays on plain-file SQLite whenever its
  manifest declares `requireEncryption: true`. Everything else opens through
  `sqld`. `sqlite-encryption.ts`'s `openKeyedSqlite()` chokepoint
  (`packages/db/src/sqlite-encryption.ts:314`) and its `apps/auth` twin are
  where this branches.
- **Async-contract conversion** — the 9 call sites RFC 0091 enumerated:
  `platform-db.ts:172,186,211,250,273,312,349` (drop the SQLite-only
  `.all()`/`.get()`/`.run()`, use `await` uniformly like the adjacent Postgres
  branches already do) and `scripts/seed.ts:149,156` (raw
  `db.prepare(sql).get()` → `await client.execute(sql)`).
- Driver construction changes land in `packages/db/src/client.ts` (platform
  DB) and `plugin-client.ts` (`getPluginDb`, `provisionPluginDb`,
  `dropPluginDb`); `apps/auth/src/db.ts` needs the equivalent change,
  duplicated deliberately (`architecture-rules.md:51`).
- **`sqld` auth model — undecided, this leg's call** (RFC 0091 flagged it,
  didn't resolve it): network isolation alone (matching how Postgres is
  typically deployed in this stack — no password enforced at the compose
  level beyond `POSTGRES_PASSWORD` being required), or `sqld`'s own
  `SQLD_HTTP_AUTH`/JWT credential for defense-in-depth. Decide explicitly,
  don't default silently.
- `docker-compose.sqld.yml` gets the `runtime`/`auth` `environment`/
  `depends_on` overrides `docker-compose.postgres.yml` already has for
  Postgres, once there's a driver on the other end to point at.

**Do not proceed if:** this leg's actual scope turns out to be substantially
larger than a single reviewable PR — split it rather than force it into one
leg (per the leg contract's reviewability rule). Given this touches RFC
0071's encryption chokepoint directly, read
`docs/incidents/2026-07-24-rfc-0071-encryption-rollout.md` first and require
a live encrypted round-trip against real data before considering this leg
done — not just unit tests.

### Leg 4 — One-time data cutover

**Epic tasks:** 8.24.

**Technical notes:** single production instance, no back-compat period
required per the locked migration-strategy decision — a rehearsed,
backup-first runbook is sufficient; no phased or dual-write tooling is being
built here.

**Delivered by this leg:** `sv db migrate-to-sqld` and its runbook
(`docs/self-hosting.md`), verified live against an isolated `sqld` container
with representative fixture data covering the platform core, auth core, and
plugin databases, including every branch of the target-selection logic and
the non-empty-destination retry-safety guarantee.

**Not delivered by this leg, deliberately:** the actual production cutover.
This environment has no access to the real single production instance's
data — rehearsing against a copy of it and then running the real cutover was
planned as an operator action, once leg 3 + this leg were deployed together
(see the sequencing note in Prerequisites above).

**Resolved, not performed:** the rehearsal happened (task 8.25's starting
point) and found the real production instance's platform dialect is already
Postgres — it has no plain-file SQLite databases at all, so there is nothing
for `sv db migrate-to-sqld` to cut over. The tool and runbook remain correct
and ready for a future SQLite-dialect deployment; they were simply never the
right tool for the instance that actually exists. The rehearsal did surface
a real, separate problem on that instance — 6 plugins stranded on
pre-task-8.22 per-plugin SQLite overrides on an otherwise-Postgres platform —
which epic task 8.25 built `sv db migrate-to-postgres` to fix instead.

**Do not proceed with the actual production cutover if:** a fresh,
verified-restorable backup does not exist immediately before it, or the
rehearsal against a copy of real production data hasn't been run first — and
confirm the target instance is actually SQLite-dialect before starting; a
Postgres-dialect instance needs task 8.25's tool, not this one.

## Risks

- **RFC 0071's encryption surface has a track record of looking more finished
  than it is** — three hardening passes, one a production incident
  (`docs/incidents/2026-07-24-rfc-0071-encryption-rollout.md`). Leg 2's RFC
  and leg 3's implementation both touch it directly; budget accordingly and
  require a live encrypted round-trip against real data, not unit tests alone.
- **Mandatory `sqld` partially reopens the self-hosting-simplicity argument**
  used to justify keeping SQLite in the first place — every SQLite install now
  runs a second container. Worth being explicit about this trade in
  `docs/self-hosting.md` when leg 3/4 ship, rather than letting it read as a
  silent regression to existing self-hosters.
- **The async-contract change may ripple wider than `packages/db`** if any
  call site elsewhere in the codebase implicitly assumed synchronous SQLite
  reads. Leg 2's spike should surface the likely blast radius; leg 3 should
  re-check it before considering itself done.
- **The single-production-instance justification for skipping back-compat is
  time-sensitive.** If a second production instance appears before leg 4
  ships, the "no dual-write needed" decision must be revisited before cutover,
  not after.

## Kill criteria

**Stops the workstream (from leg 2 onward):** the spike finds no viable
encryption story for `sqld`-backed databases and no acceptable mitigation —
stop before leg 3 rather than shipping an encryption regression.

**What survives if it dies partway:**

- After leg 1: the dialect-consolidation cleanup stands alone regardless of
  what happens with libSQL.
- After leg 2: the `sqld` Compose addition and the RFC are useful documented
  groundwork even if legs 3–4 stall or are revisited later.
- Leg 3 and leg 4 are the only legs with no independent value if the
  workstream stops after them — they exist to complete the migration, not to
  deliver a standalone increment.

## Changelog

| Version | Date        | Change                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 0.1     | August 2026 | Initial draft from a design session with kasunben. Four legs, locking mandatory/staged libSQL adoption and superseding Research 0003's opt-in recommendation.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 0.2     | August 2026 | Legs 1–3 complete (PR #353, #364, #367). Leg 3 delivers the `sqld` driver swap under the RFC 0091 encryption carve-out. Only leg 4 (one-time production data cutover) remains.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| 0.3     | August 2026 | Leg 4's tool + runbook delivered (`sv db migrate-to-sqld`), verified live against fixture data. Sequencing revised: leg 3 cannot safely soak in production alone (would orphan existing plaintext data), so leg 3 + the actual cutover now deploy together as one coordinated operation. That operation itself — rehearsal against a copy of real production data, then the real cutover — is the only work left in this workstream.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| 0.4     | August 2026 | **Workstream closed — definition of done satisfied.** Rehearsing the leg-4 cutover against a copy of the real production instance's data found that instance's platform dialect is already Postgres, not SQLite: it has no plain-file SQLite databases, so there is nothing for `sv db migrate-to-sqld` to cut over, and this can never change for _that_ instance. The tool and runbook are correct and complete; they simply were never the right fit for the production instance that actually exists, only for a hypothetical future SQLite-dialect deployment. The rehearsal did surface a real, different problem on that instance (6 plugins stranded on pre-task-8.22 per-plugin SQLite overrides on an otherwise-Postgres platform), tracked and resolved outside this workstream as epic tasks 8.25–8.27 (`sv db migrate-to-postgres`, its migration-table-collision fix, and its FK-ordering/Compose-wiring fixes). |
