# RFC 0019 — Test setup & seeding

**Status:** Accepted\
**Date:** June 2026\
**Author:** kasunben\
**Scope:** `packages/db` (test-DB helpers + seed), `apps/auth` (seed users via better-auth), a seed entrypoint (`scripts/seed.ts` / `sv seed` in `bin/sv`), in-code fixtures/factories, `vitest.config.ts`, `CONTRIBUTING.md` + CLAUDE.md test docs; builds on RFC 0010 (test organization)\
**Incorporated into plan:** Yes — scheduled as roadmap Task 0.5.24; documentation-first. This RFC specifies a test-data foundation (fixtures, an idempotent seed, per-role test users) and the dev/prod mode concept; SRS requirement IDs, scheduling, and task allocation are deferred. **Testing on a production instance is a separate RFC 0020** that builds on the seed defined here.

---

## Summary

Give Sovereign a real test-data foundation so developers stop recreating users and
data by hand every run, and so integration/e2e tests have known principals to act
as. Two pieces:

- **In-code fixtures / factories** for unit and integration tests (build a user,
  tenant, plugin-state, notification — no running instance, no DB).
- **An idempotent seed** (`sv seed`) that populates a **dev/test database** with
  baseline data and **test users per role** (admin, regular user; extensible),
  with known credentials, so you can log in as any role immediately and re-seed
  anytime.

It also names the **dev vs prod mode** distinction that RFC 0020 builds on: dev is
the default locally; seeding is a dev-mode-only capability, **hard-gated so it can
never run against a real production database.**

## Motivation

There is **no test-data infrastructure today** — no fixtures, factories, seeding, or
test users anywhere in the tree. Every developer manually registers a first
(admin) user, then more users, sets roles, and rebuilds data on each fresh
database. Integration and (future) e2e tests have no known accounts to drive. This
is friction for contributors and a blocker for the e2e tier RFC 0010 reserves.

## Current state (what this builds on)

- **Vitest, no fixtures.** `vitest.config.ts` runs co-located `*.test.ts(x)` in the
  `node` environment (jsdom via pragma); `pnpm test` = `vitest run`. There are **no
  fixture factories, no seed scripts, and no test users** — tests build any needed
  data inline.
- **DB in tests.** The default suite uses **in-memory SQLite** (`createClient({ url:
':memory:' })` + `bootstrapPlatformDb`); the Postgres **parity** tests
  (`*.pg.test.ts`) are gated by `TEST_DATABASE_URL` and **drop/recreate** their
  tables in `beforeAll`. CI starts a throwaway Postgres and sets `TEST_DATABASE_URL`.
- **User archetypes already exist as states.** `apps/auth/src/auth.ts` assigns the
  **first user** `platform:admin` (rest `platform:user`), with an `active` flag
  (deactivated) and an `invites` table (invited-pending) — i.e. admin / regular /
  deactivated / invited. The admin-key API (`apps/auth/app/api/admin/*`) can create
  invites and change role/active programmatically.
- **Idempotent bootstrap pattern.** `packages/db/src/platform-db.ts`
  (`bootstrapPlatformDb`) seeds the default tenant + `root_plugin_id` with
  `ON CONFLICT … DO NOTHING` — the proven model for a safe, re-runnable seed.
- **Password hashing.** better-auth uses Argon2id; `better-auth/crypto`'s
  `hashPassword` lets a seed insert a user with a **known** password directly.
- **RFC 0010** reserves the e2e/integration tiers (Task 0.5.17, not yet run); this
  RFC's data foundation feeds them.

## Dev vs prod mode (shared concept)

Sovereign runs in one of two modes:

- **Dev mode** — the default locally (`NODE_ENV !== 'production'`). Seeding and
  relaxed diagnostics are dev-mode features.
- **Prod mode** — the shipped default for a real deployment.

This RFC introduces the distinction and the dev-only seed; **RFC 0020** extends it
with a way to toggle a _prod_ instance into dev-mode against a mock database.

## Proposed design

### Idempotent seed (`sv seed`)

A seed entrypoint — `sv seed` (delegating to `scripts/seed.ts`) — populates a
**dev/test database** with:

- baseline platform data (reusing `bootstrapPlatformDb`);
- **test users per role** — at minimum an **admin** and a **regular user**, with
  documented emails and known dev passwords (e.g. `admin@dev.local` /
  `user@dev.local`). Extensible later to deactivated/invited archetypes.

Properties:

- **Idempotent** — `ON CONFLICT … DO NOTHING` / exists-checks, safe to re-run; a
  developer runs it once and re-runs anytime without duplicates.
- **Known passwords** — inserted via `better-auth/crypto` `hashPassword`, so the
  seeded users can actually log in (faster and more deterministic than driving the
  registration flow).
- **Hard-gated to non-prod** — the seed **refuses to run** against a production
  database / in prod mode unless an explicit override is set. It must be impossible
  to accidentally seed fake users into a real instance. (RFC 0020 is the sanctioned
  way to use seeded mock data _on_ a prod deployment — against a separate mock DB,
  never the real one.)

### Fixtures / factories

In-code builders for **unit and integration** tests — `makeUser()`, `makeTenant()`,
`makePluginStatus()`, `makeNotification()`, etc. — that return plain objects/rows
with sensible defaults and overrides, with **no running instance and no DB**. Placed
per RFC 0010 (per-package `__tests__/` for package-local fixtures; the cross-boundary
root `/__tests__/` for shared ones). These complement the seed: fixtures for fast
in-process tests, the seed for a running instance (dev + e2e).

### Test database story

No new mechanism is needed to _select_ a test DB — `DATABASE_URL` /
`AUTH_DATABASE_URL` already switch databases (and dialect via `DB_DIALECT`),
config-only. This RFC adds:

- the documented, **disposable dev/test DB** the seeder targets;
- continuity with the existing env-gated pg parity pattern (unchanged);
- the note that **this same dev/test DB becomes RFC 0020's mock database** when a
  prod instance is toggled into dev-mode.

### e2e tier alignment (RFC 0010)

The reserved e2e tier (Playwright, Task 0.5.17) consumes a **seeded** instance: it
logs in as the documented test users and drives real flows. This RFC supplies the
users/credentials; the harness itself lands with RFC 0010's task.

## UI / flows

**Local dev** — `sv seed` once → log in as `admin@dev.local` or `user@dev.local`
with the documented password → build features → re-run `sv seed` anytime (idempotent)
to restore baseline data without losing your DB.

**CI / e2e** — a job seeds an ephemeral DB, then runs integration/e2e against it with
the known accounts.

## Alternatives considered

1. **Inline per-test data only (status quo).** Rejected — repetitive, no shared
   archetypes, and nothing for a running instance / e2e to use.
2. **Seed exclusively through the public registration/invite flow.** Slower and
   ordering-sensitive (first-user-admin, invite gating). Kept as an option for tests
   that specifically exercise those flows, but the default seed uses direct hashed
   inserts for speed and determinism.
3. **Ship test users in the bootstrap (always).** Rejected — bootstrap runs in prod;
   test users must be dev-only and explicitly seeded, never present by default.

## Open questions

1. **Seed entrypoint** — `sv seed` vs `pnpm seed` vs a dev-only instrumentation hook
   that seeds on first dev boot.
2. **How many archetypes now** — admin + user is enough for v1; when to add
   deactivated/invited (and per-plugin sample data).
3. **Per-test isolation** — fresh `:memory:` per file (today) vs transaction rollback
   per test for the integration tier.
4. **Requirement IDs** — proposed entries, deferred until accepted.

## Adoption path

1. **Documentation-first (this RFC).**
2. **When accepted & scheduled:** the fixtures/factories, the `sv seed` entrypoint +
   per-role test users (non-prod-gated), the documented dev/test DB, and the
   CONTRIBUTING/CLAUDE.md test docs — aligned with RFC 0010's layout. The e2e harness
   follows with RFC 0010 (Task 0.5.17). RFC 0020 then reuses this seed for prod
   dev-mode.

## Changelog

| Version | Date     | Change                                                                                                                                                                                                   |
| ------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0.1     | Jun 2026 | Initial draft; in-code fixtures/factories + an idempotent `sv seed` with per-role test users (non-prod-gated), the dev/prod mode concept, and the dev/test DB that RFC 0020 reuses; documentation-first. |
| 0.2     | Jun 2026 | Accepted; scheduled in the roadmap as Task 0.5.24.                                                                                                                                                       |
