# Workstream 0009 — Database dialect consolidation and libSQL migration

**Status:** 📋 Planned\
**Date:** August 2026\
**Author:** Claude Code (from a design session with kasunben)\
**Goal owner:** kasunben\
**RFCs:** none yet — leg 2 authors one (next available number at time of
writing is 0090; confirm against `docs/rfcs/` before assigning), superseding
Research 0003's "opt-in third tier" recommendation for libSQL\
**Epics touched:** 0 (Infrastructure), 8 (Data Sovereignty)\
**Research:** [0003](../research/0003-horizontal-scaling-strategy.md)
(horizontal scaling strategy) — its SQLite recommendation is superseded by
this workstream; the file-storage and orchestration sections are unaffected

> **Why there is no RFC yet, and why that's not skipped.** Research 0003
> scoped libSQL/`sqld` as an option but explicitly left two questions open —
> how libSQL's async client reconciles with `packages/db`'s dialect-agnostic
> async contract, and how RFC 0071's SQLCipher-based encryption maps onto
> `sqld` (the doc never addresses encryption at all). Those are empirical
> questions a spike answers, not ones an RFC should guess at. Leg 2 is that
> spike; writing the RFC is its own final deliverable, and it gates every leg
> after it. This does **not** qualify for the research-as-design exception
> ([documentation-structure.md](../documentation-structure.md),
> first used by [workstream 0008](0008-offline-first-architecture.md)) —
> that exception requires the design to already be settled including
> rejected alternatives, and this one still has open technical questions by
> its own author's admission.

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

- [ ] `database.dialect` no longer exists in the manifest schema; no plugin
      can diverge from the platform's dialect.
- [ ] An RFC exists resolving: (a) how the async libSQL client interacts with
      `packages/db`'s dialect-agnostic async contract, (b) how RFC 0071
      at-rest encryption maps onto `sqld`, (c) the concrete driver shape for
      `packages/db/src/client.ts` and `plugin-client.ts`.
- [ ] `sqld` runs as a service in `docker-compose.yml` and
      `docker-compose.prod.yml`.
- [ ] `packages/db`'s SQLite path talks to `sqld` instead of opening
      `better-sqlite3` files directly, for the platform DB, `apps/auth`'s DB,
      and every isolated plugin DB.
- [ ] The single production instance's existing SQLite files are migrated to
      the `sqld`-backed setup via a documented, rehearsed, backup-first
      runbook, verified against real data.
- [ ] Research 0003 is marked superseded for its SQLite recommendation
      (done — see the notice at the top of that doc).

## Decisions locked

| Decision                | Choice                                                                                           | Rejected alternative and why                                                                                                                                                                                                                                                                                                 |
| ----------------------- | ------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dialect selection scope | Single `.env`-driven platform-wide dialect (`DB_DIALECT`/`DATABASE_URL`); no per-plugin override | Per-plugin `database.dialect` override (status quo) — unused by all 12 shipped/example manifests; its only real function was creating the ambiguity the `requireEncryption`+`dialect` refinement had to resolve                                                                                                              |
| libSQL adoption posture | **Mandatory**, staged across legs 2–4                                                            | Opt-in third tier (Research 0003's original recommendation) — reopens "does the operator need a second container" for every self-hoster, and leaves two dialect-selection code paths live indefinitely; explicitly rejected in favor of a clean, universal cutover now that there is only one production instance to migrate |
| Migration strategy      | One-time cutover script + runbook against the single production instance                         | Zero-downtime dual-write / phased rollout — unnecessary machinery for one instance; revisit if a second production instance exists before leg 4 ships                                                                                                                                                                        |
| Isolation-mode default  | **Unchanged** — `shared` stays the manifest default                                              | Flipping to `isolated`-by-default — raised and explicitly rejected in the design session that produced this workstream; out of scope here entirely, not deferred                                                                                                                                                             |
| RFC timing              | Leg 2 (the spike) produces the RFC as its own deliverable, gating leg 3                          | Writing the RFC before any spike — the async-contract and encryption questions are empirical; a spike de-risks the RFC instead of the RFC guessing at findings                                                                                                                                                               |

**Deliberately still open**, resolved by leg 2's RFC:

| Open decision                                                                                                                        | Resolved by | Owner    |
| ------------------------------------------------------------------------------------------------------------------------------------ | ----------- | -------- |
| How the async libSQL client reconciles with `packages/db`'s sync-today SQLite call sites                                             | Leg 2 RFC   | Platform |
| How RFC 0071's SQLCipher encryption maps onto `sqld` (native encryption / different mechanism / documented gap)                      | Leg 2 RFC   | Platform |
| Whether `Dialect` (`packages/db/src/dialect.ts:1`) gains a third literal or libSQL stays a connection-shape variant under `'sqlite'` | Leg 2 RFC   | Platform |
| Embedded-replica vs. remote-only `sqld` deployment shape                                                                             | Leg 2 RFC   | Platform |

## Prerequisites

| Prerequisite                                                 | Owner    | Status                                                                   |
| ------------------------------------------------------------ | -------- | ------------------------------------------------------------------------ |
| None for leg 1 — self-contained, subtractive manifest change | Platform | Ready                                                                    |
| None for leg 2 — independent spike                           | Platform | Ready                                                                    |
| Leg 2's RFC accepted                                         | kasunben | ⛔ **Open — gates leg 3.** Not an agent decision to accept unilaterally. |

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

**Deliberately thin — scope is set by leg 2's RFC, not by this document.**
Do not begin detailed task breakdown before that RFC exists and is accepted.
Expected surface, subject to the RFC's actual decisions: `client.ts` and
`plugin-client.ts`'s driver construction; `sqlite-encryption.ts`'s
`openKeyedSqlite()` chokepoint and its `apps/auth` twin; every per-dialect
schema file under `packages/db/src/schema/sqlite/`; and anywhere else in the
codebase that assumed `better-sqlite3`'s synchronous API, to be enumerated
once the RFC's async-contract decision is known.

**Do not proceed if:** leg 2's RFC is not yet accepted, or this leg's actual
scope turns out to be substantially larger than a single reviewable PR — split
it rather than force it into one leg (per the leg contract's reviewability
rule).

### Leg 4 — One-time data cutover

**Epic tasks:** 8.24.

**Technical notes:** single production instance, no back-compat period
required per the locked migration-strategy decision — a rehearsed,
backup-first runbook is sufficient; no phased or dual-write tooling is being
built here. Rehearse against a copy of real production data before running it
against the actual instance.

**Do not proceed if:** leg 3 has not been running stably, or a fresh,
verified-restorable backup does not exist immediately before cutover.

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

| Version | Date        | Change                                                                                                                                                        |
| ------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0.1     | August 2026 | Initial draft from a design session with kasunben. Four legs, locking mandatory/staged libSQL adoption and superseding Research 0003's opt-in recommendation. |
