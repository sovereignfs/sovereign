# Epic 1: Configuration & Data

> The environment variable convention every app shares, the database layer
> that runs on sqld, PostgreSQL or a SQLite file, encryption of stored
> secrets, and core's base schema.

## Status

📋 Planned

## Overview

These packages are used by core and by every app, so they are written to work
with no core present. `packages/config` turns environment variables into
validated settings; `packages/database` gives one interface over three
databases; the stored-secret part of `packages/crypto` encrypts values such as
the SMTP password.

## Related

- [docs/specs/core-app.md](../specs/core-app.md) — §1.1.3, §1.1.4, §3.15
- `spec/env.md` (written in 1.1)

## Tasks

#### 📋 1.1 — Environment convention and `packages/config`

**Goal:** One way to declare, read and validate environment variables, with a
per-app prefix.

**Deliverables:**

- Delete the `spec/env.md` entry from `PLANNED_TARGETS` in
  `scripts/lib/doc-links.ts` once the file exists
- `spec/env.md`: prefix rule (`SV_` for core, the app's own prefix otherwise),
  shared suffixes, database variables named by engine (`SV_POSTGRES_URL`,
  `SV_SQLD_URL`, `SV_SQLITE_URL`), the `_FILE` rule (every secret accepts a
  `_FILE` form; setting both forms is an error), how a value saved in the
  Console overrides an environment default
- `packages/config`: takes the prefix as an option; typed schema with secrets
  marked as such; reads `_FILE` forms for every secret; validates at start-up
  and fails with a message naming the variable; never logs secret values

**Dependencies:** 0.1

**Spec reference:** §1.1.3, §1.1.4, §3.15

**Review checklist:**

- A missing required secret, a short secret and a malformed URL each fail
  start-up with a named variable
- Setting both `SV_AUTH_SECRET` and `SV_AUTH_SECRET_FILE` fails start-up
- The package has no dependency on `apps/core`

#### 📋 1.2 — `packages/database`

**Goal:** One database interface that behaves the same on sqld, PostgreSQL and
a SQLite file.

**Deliverables:**

- Dialect selection (`SV_DB_DIALECT`), clients for sqld (with namespaces, sending
  `x-namespace` on every request, `default` included), PostgreSQL (pool) and a
  SQLite file
- Real database tests named `*.db.test.ts`, which the CI legs from task 0.3 run
  once per dialect (`pnpm test:db`)
- Paired Drizzle schemas and migrations per dialect; a migration runner with
  its own record of what ran
- A parity test that fails when a column exists in one dialect only
- Helpers for the data-layer rules in `docs/architecture-rules.md`: timestamps as `bigint` milliseconds
  on PostgreSQL, session-scoped primitives on a pinned client, identifiers under
  63 bytes

**Dependencies:** 1.1

**Spec reference:** §3.15

**Review checklist:**

- Migrations apply from empty on all three databases in CI
- The parity test is seen to fail when a column is added to one dialect only

#### 📋 1.3 — Encryption of stored secrets `[parallel]`

**Goal:** Secrets core stores (such as the SMTP password) are encrypted with a
key from the environment.

**Deliverables:**

- The field-encryption part of `packages/crypto`: authenticated encryption, a
  key ring from `SV_FIELD_ENCRYPTION_KEYS` (current key plus older ones, each
  with an id), lazy re-encryption on rotation
- A clear error when a value cannot be decrypted, so callers can degrade per
  value

**Dependencies:** 1.1

**Spec reference:** §3.15

**Review checklist:**

- Round-trip, tamper and wrong-key tests pass
- After a key rotation, values written under the old key still decrypt

#### 📋 1.4 — Core's base schema and settings

**Goal:** Core has its own tables and a settings store where Console values
override environment defaults.

**Deliverables:**

- Core's initial migrations on all three dialects
- An instance settings store: a saved value wins over the environment default;
  unset falls back to the environment; changes apply without a restart
- Secret settings stored through 1.3

**Dependencies:** 1.2, 1.3

**Spec reference:** §1.1.3, §3.12

**Review checklist:**

- A setting resolves environment → saved value → back to environment when the
  saved value is cleared, on all three databases
