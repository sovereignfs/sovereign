# Epic 1: Configuration & Data

> The environment variable convention every app shares, the database layer
> that runs on sqld, PostgreSQL or a SQLite file, encryption of stored
> secrets, and core's base schema.

## Status

⏳ In Progress

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

#### ✅ 1.1 — Environment convention and `packages/config`

**Goal:** One way to declare, read and validate environment variables, with a
per-app prefix.

**Deliverables:**

- `spec/env.md`: the prefix rule (`SV` for core, the app's own prefix otherwise),
  the names every app shares, database variables named by engine
  (`SV_POSTGRES_URL`, `SV_SQLD_URL`, `SV_SQLITE_URL`), the `_FILE` rule (every
  secret accepts a `_FILE` form; setting both forms is an error; no secret has a
  default), value syntax, start-up validation, and how a value saved in the
  Console overrides an environment default. The `spec/env.md` entry is gone from
  `PLANNED_TARGETS` in `scripts/lib/doc-links.ts`
- `packages/config` (`@sovereignfs/config`, MPL-2.0, `private` until an app outside
  this repository needs it): `defineConfig({ prefix, variables })` with typed
  builders (`string`, `secret`, `url`, `integer`, `boolean`, `oneOf`, `list`);
  `load()` reports every problem at once in a `ConfigError`, each naming its
  variable and none showing a value; a `Secret` that renders as `[redacted]` in
  logs, JSON and `util.inspect`; `_FILE` forms for every secret; and `describe()`
  for generating docs and `.env.example`. No runtime dependencies and no static
  `node:fs` import
- The types make the rules: `secret()` has no overload that takes a default, and an
  optional variable's type includes `undefined`
- A test that fails if any package declares a dependency on the core app, beside the
  existing lint rule that stops a package importing it

**Dependencies:** 0.1

**Spec reference:** §1.1.3, §1.1.4, §3.15

**Review checklist:**

- A missing required secret, a short secret and a malformed URL each fail
  start-up with a named variable — each seen as a failing test, and run against
  the built package under plain Node
- Setting both `SV_AUTH_SECRET` and `SV_AUTH_SECRET_FILE` fails start-up
- The package has no dependency on `apps/core` — and a test fails if one is added
- Each guarantee was broken on purpose and the matching test failed: the both-forms
  check, the minimum length, redaction, no echo of a value, the one-newline rule,
  an eager file read, blank-as-unset, a leaked read error, and a secret with a default
- Not yet done: apps outside this repository that carry their own copy of this
  logic can switch to the package once it is published

#### ✅ 1.2 — `packages/database`

**Goal:** One database interface that behaves the same on sqld, PostgreSQL and
a SQLite file.

**Deliverables (as built):**

- `@sovereignfs/database` (private, MPL-2.0): `connect(resolveDatabase(settings))` opens
  sqld (a namespace per app, `x-namespace` on every request, `default` included), a
  PostgreSQL pool, or a SQLite file; `databaseVariables` are the variables of
  `spec/env.md`, to spread into an app's `defineConfig`. A URL that does not fit the
  dialect is an error, not a guess. `SV_SQLD_NAMESPACE` is new (the spec's table has it)
- One async interface: `run` with `?` placeholders on every dialect, integers as numbers
  everywhere (node-postgres's `bigint` and `count(*)` included, exact or an error),
  `transaction`, `session` (one pinned connection, where PostgreSQL session primitives
  belong), `ping` with a timeout, and the typed Drizzle handle. Using the database inside
  its own transaction throws the same error on every dialect
- A migration runner with its own record (`sv_migrations`): a folder of `NNNN_name.sql`
  per dialect; exactly once under concurrent starts; atomic per migration; refuses a
  changed, missing or out-of-order migration
- `@sovereignfs/database/testing`: `schemaDifferences` / `assertSchemaParity` compare a
  SQLite and a PostgreSQL schema (tables, columns' logical type, nullability, primary key,
  indexes, unique constraints, foreign keys) and flag identifiers over 63 bytes
- Helpers for the data-layer rules: `sqliteTimestampMs` / `postgresTimestampMs`,
  `assertIdentifier`, `toNumber`
- `*.db.test.ts` tests that run against the CI leg's database: connection, rows, integers,
  transactions, sessions, migrations (from empty, repeated, changed, missing, out of order,
  half-failed, five instances at once), and sqld's namespaces and header
- Core uses it: with `SV_DB_DIALECT` set, `/api/health` reports the database `up` or
  `down` (503), and start-up fails on an incomplete database setting. Core still runs with
  no database, until its base schema arrives. The tests read the workspace packages from
  source, so a test run needs no build

**Not here:** drizzle-kit configuration and `db:generate` arrive with the first real
schema (core's base schema), which will also call `assertSchemaParity` on it.

**Dependencies:** 1.1

**Spec reference:** §3.15

**Review checklist:**

- Migrations apply from empty on all three databases: seen on real sqld 0.24.33, a SQLite
  file and PostgreSQL 18, and run in the CI legs
- The parity test is seen to fail when a column is added to one dialect only
  (`parity.test.ts`), or a table, a type, an index or a long identifier
- Broken on purpose, each caught by a test: the `x-namespace` header for `default`, the
  migration checksum, transaction rollback, the bigint parser, the advisory lock, the
  in-process file serialisation, and the guard against using the database inside a
  transaction
- Core's `/api/health` run against none, a SQLite file, sqld and PostgreSQL (up), and
  against unreachable PostgreSQL and sqld (503); an incomplete setting stops start-up

#### ✅ 1.3 — Encryption of stored secrets `[parallel]`

**Goal:** Secrets core stores (such as the SMTP password) are encrypted with a
key from the environment.

**Deliverables (as built):**

- `@sovereignfs/crypto` (private, MPL-2.0), the field-encryption part: `FieldCipher`
  with AES-256-GCM, a fresh random IV per value, and an envelope
  `sv1:<key id>:<iv>:<ciphertext>:<tag>`. The key id and a caller-given context
  (`settings.smtp_password`, or table, column and row) are authenticated with the value,
  so a ciphertext copied into another field or row does not decrypt there
- A key ring from `SV_FIELD_ENCRYPTION_KEYS` (also `_FILE`): `id:key` entries, newest
  first, each key 32 random bytes in base64 or base64url. New values use the first key,
  any key decrypts. `open` returns the value and, for one written under an older key, the
  upgraded envelope to write back, so a rotation finishes itself as values are read;
  `isCurrent` finds the rest for a sweep. Problems with the ring are reported at start-up
  by entry position, never showing a key
- `DecryptionError` with a `reason` (`malformed`, `unknown-key`, `authentication-failed`),
  never showing a value or a key, so callers degrade per value. A bad context is a
  `TypeError`, a mistake in the caller
- `fieldEncryptionVariables` and `resolveFieldEncryption`, to spread into an app's
  config, as the database package does. Core declares them and validates the ring at
  start-up; a ring that is set but wrong stops it. It is not required until core stores its
  first secret (the next task makes it so)

**Not here:** end-to-end encryption and the recovery kit, which come later to this
package; encryption of the SQLite file or PostgreSQL storage, which is the operator's disk.

**Dependencies:** 1.1

**Spec reference:** §3.15

**Review checklist:**

- Round-trip, tamper (IV, ciphertext, tag, key id, truncation, extension) and wrong-key
  tests pass, and so do wrong-context and malformed-value tests
- After a key rotation, values written under the old key still decrypt, upgrade to the new
  key, and read with the new key alone
- Broken on purpose, each caught by a test: the context left out of the authenticated
  data, a fixed IV, no upgrade, duplicate ids, the oldest key as current, an unknown key
  reported as an authentication failure, mixed base64 alphabets, and an error that repeats
  the value
- Core run with a bad ring (exit 1, the problem named, no key in the output) and with a
  good ring read from a file

#### ⏳ 1.4 — Core's base schema and settings

**Goal:** Core has its own tables and a settings store where Console values
override environment defaults.

**Deliverables (as built):**

- Core's schemas, written as a pair (`apps/core/src/db/schema/sqlite.ts` and
  `postgres.ts`), and drizzle-kit configuration with `db:generate`; the first migration on
  both dialects creates `instance_settings` (key, value, `encrypted`, `updated_at`,
  `updated_by`). A parity test keeps the pair in step, and a database test checks the
  migrated table has the columns the schema describes. The base schema is one table for
  now: accounts, sessions and the rest arrive with the tasks that need them
- Core applies its migrations at start-up (every instance may, at once), and a failure
  stops it; a traced build ships the migration folder
- An instance settings store (`SettingsStore`): a saved value wins over the environment
  variable, which wins over the built-in default; clearing the saved value returns to the
  environment. A change applies without a restart: at once on the instance that made it,
  within a short cache time (5 seconds) on others. Settings: instance name, invite-only
  (on when nothing says otherwise), and the SMTP host, port, user, from address and
  password; their environment variables (`SV_AUTH_INVITE_ONLY`, `SV_SMTP_*`) are declared
- Secret settings stored through the field encryption of the previous task: encrypted,
  bound to their row, never described back (the Console learns that one is saved, not what
  it is). A saved secret that cannot be decrypted is reported unreadable and is not replaced
  by the environment's value; one unreadable secret does not stop the others
- Without a database, reads fall back to the environment and the defaults and saving is
  refused with a clear error

**Not here:** the Console screens that save these values (the Console epic), sending mail
(the mail epic), images (logos, favicon), and making the key ring and a database required,
which comes with the first feature that needs them.

**Dependencies:** 1.2, 1.3

**Spec reference:** §1.1.3, §3.12

**Review checklist:**

- A setting resolves environment, then saved value, then back to the environment when the
  saved value is cleared, on all three databases: the same suite on a SQLite file in
  `pnpm test` and on sqld, a SQLite file and PostgreSQL in the CI legs
- Core started against SQLite (twice), sqld (a new namespace) and PostgreSQL (two
  instances at once) migrates exactly once
- Broken on purpose, each caught by a test: the environment beating a saved value, clear
  keeping the row, describe showing a secret, a secret stored in the clear, an unreadable
  secret falling back to the environment, the cache not invalidated on save, one encryption
  context for every row, and invite-only defaulting to open
