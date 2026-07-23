# RFC 0071 — SQLite at-rest encryption (opt-in, single-key)

**Status:** Implemented\
**Date:** July 2026\
**Author:** kasunben\
**Scope:** packages/db, apps/auth, packages/manifest, runtime/src, bin/sv (scripts), Docker/Compose, `.env.example`, docs; a scoped implementation of RFC 0008 Tier 2b, amends RFC 0008; relates to RFC 0004 (per-plugin database) and RFC 0060 (client-side encryption)\
**Incorporated into plan:** Yes — epic task 8.14. Carves the SQLite-only, whole-file at-rest slice out of RFC 0008's Tier 2 into a small, shippable, opt-in feature. Postgres at-rest, avatar/blob encryption, and field-level `sdk.crypto` (Tier 3) remain in the broader Task 8.5.

---

## Summary

Add an **opt-in, operator-owned, whole-file encryption** option for Sovereign's
SQLite databases, using SQLCipher (via `better-sqlite3-multiple-ciphers`) keyed
by a single instance-wide key supplied as an environment variable. When the key
is absent — the **default** — nothing changes: databases stay plaintext exactly
as today. When the key is set, every SQLite database the instance owns
(`sovereign.db`, `auth.db`, and every `database: "isolated"` plugin's file) is
encrypted at rest, transparently to all query code above the driver.

A plugin may additionally declare `requireEncryption: true` in its manifest to
**force encryption on for its own isolated database** regardless of the
instance-wide default — a raise-only control (a plugin can demand encryption, it
can never opt out of encryption the operator has enabled).

This is deliberately the **narrow, honest slice** of RFC 0008's Tier 2: it
protects a stolen disk, a leaked volume snapshot, or a copied database file. It
does **not** protect against a live compromised process or an operator who holds
the key — that is Tier 4 / client-side encryption (RFC 0060), which already
ships opt-in per plugin. The two are complementary and independent.

## Motivation

RFC 0008 charted at-rest encryption (Tier 2) but folded it into one large,
crypto-heavy, post-v1 task (8.5) spanning a KEK→DEK envelope hierarchy, both
database engines, avatar/blob encryption, and field-level encryption. That
scope is the reason it keeps being deferred.

The great majority of self-hosted Sovereign instances run the **zero-config
SQLite default** (`docs/self-hosting.md`: "SQLite is the zero-config default and
is fine for personal and small-group use"). For those instances, `docs/security.md`
currently tells operators plainly that their data is **not encrypted at rest**
and to rely on host-level disk encryption. That is a real gap for the exact
deployments Sovereign is most often run as, and it is closable with a small,
well-scoped change rather than the full Tier 2 programme:

- SQLite has a mature, drop-in encrypted driver (`better-sqlite3-multiple-ciphers`)
  that is API-compatible with the `better-sqlite3` we already use.
- The native build toolchain SQLCipher needs is **already present** in both
  Dockerfiles (`apk add python3 make g++`), because `better-sqlite3` has no
  Alpine/musl prebuild and is already compiled from source.
- We already have a proven single-key AES-GCM envelope pattern and a
  no-default, fail-fast key-loading discipline in `runtime/src/secrets.ts`
  (`SOVEREIGN_VAULT_KEY`).

Shipping this as an opt-in feature gives operators a verifiable "stolen disk
yields ciphertext" guarantee without waiting for the full envelope/field-level
machinery, and without changing anything for operators who don't enable it.

## Current state (what this builds on)

Every place the codebase opens a raw SQLite connection (grep for `new Database(`):

| Call site                             | Database                                                                |
| ------------------------------------- | ----------------------------------------------------------------------- |
| `packages/db/src/client.ts:46`        | Platform DB (`sovereign.db`)                                            |
| `apps/auth/src/db.ts:68`              | Auth DB (`auth.db`)                                                     |
| `packages/db/src/plugin-client.ts:98` | Isolated plugin DBs (`database: "isolated"`, one `.db` file per plugin) |
| `scripts/reset-mfa.ts:25`             | Break-glass MFA reset — opens `auth.db` **directly, outside the app**   |
| `scripts/seed.ts:84`                  | Dev seed script                                                         |

Load-bearing facts the design rests on:

- **better-auth does not open its own connection.** `apps/auth/src/auth.ts`
  passes `database: getAuthDatabase()` — the already-opened `better-sqlite3`
  handle from `apps/auth/src/db.ts`. better-auth drives that handle internally
  (Kysely). So if the handle is opened with the cipher key applied **before**
  better-auth receives it, better-auth's own migrations
  (`getMigrations`/`runMigrations` in `apps/auth/src/migrate.ts`) and queries
  ride along transparently. Confirmed empirically (Adoption path, Phase C) —
  better-auth's own migrator and queries work cleanly against an encrypted
  `auth.db`.
- **The Docker toolchain is already there.** Both `Dockerfile` and
  `apps/auth/Dockerfile` install `python3 make g++` specifically for
  `better-sqlite3`'s from-source musl build. `better-sqlite3-multiple-ciphers`
  uses the identical `bindings` + `prebuild-install` shape and the same
  toolchain, tracks the same version line (`12.x`), and is MIT-licensed.
- **`allowBuilds` gates native builds.** `pnpm-workspace.yaml` lists
  `better-sqlite3: true`; the cipher fork needs an equivalent entry.
- **Single-key AES-GCM envelope precedent.** `runtime/src/secrets.ts`
  (`SOVEREIGN_VAULT_KEY`, `vaultKeyFromEnv()`, `sv1:iv:tag:ciphertext`) and its
  self-contained twin `apps/auth/src/crypto-envelope.ts` already establish the
  key encoding (base64 / base64url / 64-char hex → 32 bytes), the no-default
  fail-fast rule, and the "each process reads its own env" pattern. The DB key
  loader mirrors this exactly.
- **The manifest `database` field** (`packages/manifest/src/schema.ts:47-51`)
  is either `'shared' | 'isolated'` or `{ isolation, dialect }`. This is where
  `requireEncryption` attaches.
- **Backups are file copies.** `docs/self-hosting.md`: dev backup is copying
  `./data/`; prod is a named-volume snapshot. Once the files are encrypted,
  those copies are automatically ciphertext.

## Proposed design

### 1. Single instance key, opt-in, off by default

A new environment variable — `SOVEREIGN_DB_ENCRYPTION_KEY` — holds a single
32-byte key (base64 / base64url / 64-char hex, decoded by the same `decodeKey()`
logic as `SOVEREIGN_VAULT_KEY`).

- **Absent (default):** SQLite databases open in plaintext exactly as today. No
  behaviour change, no new dependency cost at runtime.
- **Present:** every SQLite database the instance owns is opened with the cipher
  key applied (SQLCipher `PRAGMA key`), before any query or migration runs.

Presence of the key **is** the toggle — no separate boolean flag, matching the
project's existing "a feature that needs a secret fails closed without it, works
with it" convention. The same key encrypts all SQLite databases (platform, auth,
and every isolated plugin DB), by explicit design choice for operational
simplicity (see Alternatives for the per-DB-key option and its rejection).

### 2. SQLCipher via `better-sqlite3-multiple-ciphers`

Replace the `better-sqlite3` import at the five call sites with a small shared
opener that:

1. imports `better-sqlite3-multiple-ciphers` (API-compatible constructor);
2. if `SOVEREIGN_DB_ENCRYPTION_KEY` is set, explicitly selects the
   SQLCipher-compatible cipher (`PRAGMA cipher='sqlcipher'`) before keying —
   the driver supports several cipher schemes and defaults to its own
   ("sqleet"), not SQLCipher, so this must be set every time rather than
   relying on the default (see Open question 2's resolution) — then applies
   the key via `.key()`, before any other statement;
3. sets the existing pragmas (`journal_mode = WAL`, `foreign_keys = ON`);
4. is the single chokepoint all five sites call, so keying (and the cipher
   selection) can never be accidentally skipped at one site.

The opener lives in `packages/db` (the natural home; `apps/auth` keeps its
self-contained copy for the same reason `crypto-envelope.ts` is duplicated —
`apps/auth` does not depend on `runtime`/`packages/db`).

### 3. State-marker mismatch guard (fail-fast, both directions)

Silent key/state mismatches are the dangerous failure mode: opening an encrypted
file without the key looks like corruption, and opening a plaintext file "with
encryption on" would silently write new plaintext into a file the operator
believes is encrypted.

On first encrypted boot, write a small **marker** recording that the data
directory is encrypted (a sentinel file under the data dir, e.g.
`data/.db-encrypted`, or an equivalent metadata row). On every boot, compare the
marker against the presence of the key:

| Marker says | Key present | Pre-existing SQLite files? | Action                                                                                                                                                                                                                                                                                   |
| ----------- | ----------- | -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| plaintext   | no          | —                          | Normal plaintext boot.                                                                                                                                                                                                                                                                   |
| encrypted   | yes         | —                          | Normal encrypted boot.                                                                                                                                                                                                                                                                   |
| encrypted   | no          | —                          | **Fail-fast:** "databases are encrypted but `SOVEREIGN_DB_ENCRYPTION_KEY` is not set."                                                                                                                                                                                                   |
| plaintext   | yes         | yes                        | **Fail-fast:** existing plaintext data — run the migration tool first (see §6).                                                                                                                                                                                                          |
| plaintext   | yes         | no                         | **Write the marker and proceed** — a fresh instance enabling encryption before its first boot (§6 "Enabling on a fresh instance") has nothing plaintext to protect, so there is nothing to fail _fast about_; every file it creates from here on is opened with the key already applied. |

The last row exists because the first four alone made "fresh instance, key set
from day one" indistinguishable from "existing plaintext instance" — both are
"marker absent, key present" — which blocked the very onboarding path this RFC
documents. `hasExistingSqliteFiles()` (checks for `sovereign.db`, `auth.db`,
or any `plugins/*.db`) is what tells the two apart.

A wrong (but present) key surfaces as SQLCipher failing to read the header; the
opener translates that into a distinct, actionable error rather than a generic
"file is not a database".

### 4. Manifest `requireEncryption` — raise-only

Extend the manifest `database` object with an optional
`requireEncryption?: boolean`:

```jsonc
{
  "database": { "isolation": "isolated", "requireEncryption": true },
}
```

Semantics:

- **Raise-only.** A plugin can force encryption **on** for its own isolated
  database even when the instance-wide key is set but the plugin author wants to
  guarantee it. A plugin can **never** turn encryption off. A malicious or
  careless plugin must not be a downgrade vector.
- **Implies isolation.** Whole-file encryption has no per-table granularity, so
  a `requireEncryption` plugin's data must live in its own file. Manifest
  validation therefore requires `isolation: "isolated"` alongside
  `requireEncryption: true` — a `shared` plugin declaring it is a manifest
  error (a `shared` plugin's tables live inside `sovereign.db` and inherit
  whatever state the platform DB is in; it cannot independently demand more).
- **Forces the operator's hand, loudly.** If a plugin requires encryption and
  `SOVEREIGN_DB_ENCRYPTION_KEY` is not set, plugin provisioning / startup fails
  with a message that **names the plugin**: "Plugin `<id>` requires database
  encryption — set `SOVEREIGN_DB_ENCRYPTION_KEY` to enable it, or remove the
  plugin." Never a generic crash.

This is a new field in `packages/manifest` (a public contract). Per repo
conventions it ships with a `docs/plugin-development.md` update in the same PR
and is covered by the manifest docs-parity test.

### 5. Postgres: explicitly out of scope, never silent

Postgres has no portable app-level equivalent to SQLCipher (same conclusion as
RFC 0008). Under Postgres:

- `SOVEREIGN_DB_ENCRYPTION_KEY` applies only to any SQLite files that still
  exist (none, in a pure-Postgres deployment) and is otherwise a documented
  no-op.
- A plugin declaring `requireEncryption` while resolved to a Postgres dialect
  emits a **startup warning** — not a silent pass — stating that at-rest
  protection falls back to disk/volume encryption + `sslmode`, because the
  SQLCipher mechanism does not exist for Postgres. Silence here would let a
  plugin's security promise evaporate invisibly.

### 6. Migration for existing plaintext instances

Enabling encryption on an instance that already has plaintext `sovereign.db` /
`auth.db` / plugin DBs requires a one-time, offline conversion — a new
`sv` command (e.g. `sv db encrypt`) that:

1. does a best-effort check that no other process holds the file open for
   writing (not a guarantee — see Open question 5's resolution — this is why
   step 2 is required rather than optional);
2. **requires a fresh backup first** (automatic, same archive format as
   `sv backup`, skippable only with an explicit flag);
3. copies each SQLite file to a temp path, opens the copy, sets
   `PRAGMA cipher='sqlcipher'`, and calls `.rekey()` with
   `SOVEREIGN_DB_ENCRYPTION_KEY` — **not** `sqlcipher_export()`, which this
   driver fork doesn't implement (see Open question 2's resolution);
4. covers **all** SQLite files: platform, auth, and every isolated plugin DB
   found under the data dir;
5. is crash-tolerant — writes to the temp file and atomically renames it over
   the original, so a mid-migration failure leaves the plaintext original
   intact;
6. writes the §3 marker only after every file has converted successfully.

A companion `sv db decrypt` (reverse direction, `.rekey()` to an empty key)
is needed for two operational paths: rotating to a new key (decrypt →
re-encrypt) and the SQLite→Postgres migration below.

### 7. Break-glass CLI, seed, and the pgloader path

- **`sv user reset-mfa`** (`scripts/reset-mfa.ts`) opens `auth.db` directly,
  by design, for when the server is down. It must read
  `SOVEREIGN_DB_ENCRYPTION_KEY` from its own environment and key the connection,
  with a distinct "encryption key missing/wrong" error — this tool's entire
  value is working when everything else is broken, so its failure messages must
  not look like data corruption to a panicking locked-out admin.
- **`scripts/seed.ts`** keys its connection the same way for dev parity.
- **SQLite→Postgres migration.** `docs/self-hosting.md` documents pointing
  `pgloader` directly at the SQLite files. `pgloader` has no cipher support, so
  this path breaks under encryption. The remediation is documented: run
  `sv db decrypt` to a temporary plaintext copy, run `pgloader` against that,
  then shred the temporary copy.

### 8. Backups become encrypted for free (with the standing caveat)

Once the files are encrypted, the existing backup mechanisms (copy `./data/`,
snapshot the named volume) produce ciphertext with no additional work — this
delivers the DB portion of RFC 0008 Tier 2c as a side effect. The unchanged,
prominently-documented caveat: **the key must be backed up separately from the
data.** A backup encrypted under a key stored only inside that same backup is
worthless. Lose the key → lose the data — the cost of true ownership (NFR-02).

## Threat model

| Threat                                  | This RFC | Notes                                                             |
| --------------------------------------- | -------- | ----------------------------------------------------------------- |
| Stolen disk / leaked volume snapshot    | **Yes**  | Files are ciphertext without the key.                             |
| Copied/leaked database file             | **Yes**  | Same.                                                             |
| Leaked file-copy backup                 | **Yes**  | Backups inherit encryption (§8), if the key is stored separately. |
| Curious/malicious operator with the key | No       | Server-held key; the operator holds it. Use RFC 0060 for this.    |
| RCE / live compromised process          | No       | The running process has the key in memory. Use RFC 0060 for this. |
| Postgres deployments                    | No       | No SQLCipher equivalent; rely on disk encryption + `sslmode`.     |

The honest framing is unchanged from RFC 0008: server-held-key at-rest
encryption protects data **off** the running host, not from someone who controls
the host or holds the key. This RFC does not overstate that.

## Alternatives considered

1. **Per-database keys instead of one instance key.** Safer in principle (a
   leaked key unlocks one database, not all). Rejected for v1 of this feature per
   the operator's explicit simplification: one key is far easier to configure,
   back up, and rotate, and the marginal safety gain is small given all keys
   would live in the same env on the same host anyway. Can be revisited later
   without changing the on-disk format (each file is independently keyed under
   the hood; today they simply share one key value).

2. **The full RFC 0008 Tier 2 KEK→DEK envelope.** More flexible (rotation
   re-wraps small DEKs instead of re-encrypting files). Deferred — it is the
   reason Tier 2 keeps slipping. This RFC ships the achievable 80% now; the
   envelope hierarchy remains available in Task 8.5 if per-DB keys or
   cheap rotation become requirements.

3. **A separate `SOVEREIGN_DB_ENCRYPTION=on/off` boolean plus a key.** Rejected
   as redundant — presence of the key is a clearer single source of truth and
   matches the existing no-default-secret convention. The §3 marker handles
   mismatch detection that a boolean would otherwise be misused for.

4. **Whole-DB encryption but let a plugin opt _out_ via manifest.** Rejected —
   a plugin must never weaken the operator's instance-wide setting. The manifest
   control is raise-only.

5. **Full-disk / volume encryption only (no app-level).** The current
   documented posture. Necessary but insufficient: it does nothing against a
   leaked logical copy of a single `.db` file, and many operators on managed
   hosting cannot easily configure it. Kept as complementary baseline, not a
   replacement.

6. **Field-level encryption for "sensitive" columns instead.** That is RFC 0008
   Tier 3 — far more engineering (breaks search/sort, needs blind indexes, new
   SDK surface) for a benefit whole-file encryption already covers at the page
   level. Remains separately in Task 8.5.

## Open questions

Resolved during implementation:

1. **Marker mechanism** — implemented as a sentinel file (`data/.db-encrypted`),
   matching the leaning noted here. Lives inside the data directory, so it
   travels with backups automatically (resolves question 7 too).
2. **Keying pragma specifics — resolved, and this mattered more than
   expected.** `better-sqlite3-multiple-ciphers` supports several cipher
   schemes and **defaults to its own ("sqleet"), not SQLCipher.** Early
   implementation work used the default without realizing it; empirical
   testing (attempting the driver's `sqlcipher_export()` — which turned out
   not to exist in this fork at all, unlike upstream SQLCipher) surfaced the
   mismatch. Fixed by explicitly setting `PRAGMA cipher='sqlcipher'` before
   `.key()`/`.rekey()` at every call site, so the on-disk format is genuinely
   SQLCipher-compatible as this RFC's title promises. No `legacy=` pragma
   needed — this driver's default `legacy` value already matches current
   SQLCipher 4.x KDF parameters.
3. **Isolated plugin DB discovery** — implemented via data-dir scanning
   (`data/plugins/*.db`), not the registry. Simpler, and catches orphaned
   plugin databases the registry no longer lists.
4. **Rotation UX — resolved via in-place rekey, not decrypt→re-encrypt.**
   `sv db encrypt`/`decrypt` both use the driver's `.rekey()` method
   internally (copy to temp → rekey the copy → atomic rename over the
   original), so rotation is `sv db decrypt` (old key) followed by
   `sv db encrypt` (new key) — no separate `sv db rekey` command needed.
5. **Performance against NFR-07 — partially measured, not yet on target
   hardware.** A relative micro-benchmark (20k-row write/read) showed
   encrypted writes taking roughly 70-85% longer than plaintext, reads
   effectively unaffected — measured on ordinary dev hardware, not the
   2-core/1GB VPS NFR-07 targets. Worth a real benchmark there before
   recommending this broadly to resource-constrained operators.
6. **better-auth under the cipher driver — confirmed working end to end.**
   Exercised directly: `runAuthMigrations()` (better-auth's own
   `getMigrations`/`runMigrations`) plus insert/read against a
   `sqlcipher`-keyed `auth.db`, verified genuine ciphertext on disk. Full
   HTTP-level sign-in/MFA flow was not exercised (would need a running
   server); the DB-layer compatibility that was the actual risk is confirmed.

## Adoption path

Implemented (epic task 8.14):

1. **Phase A — spike / de-risk.** Swapped `better-sqlite3-multiple-ciphers` in
   for `packages/db/src/client.ts`; ran the full test suite; verified genuine
   ciphertext and correct/wrong/missing-key behavior; measured relative
   overhead. Surfaced the cipher-default issue (open question 2) before it
   spread to every call site.
2. **Phase B — key primitive.** `SOVEREIGN_DB_ENCRYPTION_KEY` loader (mirrors
   `decodeKey`/fail-fast from `secrets.ts`); the shared keyed opener
   (`packages/db/src/sqlite-encryption.ts` + the `apps/auth` self-contained
   twin); the §3 marker + mismatch guard, both directions.
3. **Phase C — wired all five call sites** (`client.ts`, `plugin-client.ts`,
   `apps/auth/src/db.ts`, `reset-mfa.ts`, `seed.ts`), each with clear
   key-mismatch errors. Verified better-auth's own migrator against an
   encrypted `auth.db` (resolves open question 6).
4. **Phase D — manifest `requireEncryption`** (raise-only, implies isolated,
   enforced both at manifest-validation time and at runtime plugin-migration
   time — the latter fails startup naming the plugin for SQLite, warns for
   Postgres) + `docs/plugin-development.md` + docs-parity. Additive manifest
   field → **minor** version bump for `@sovereignfs/manifest`.
5. **Phase E — migration tooling.** `sv db encrypt` / `sv db decrypt`
   (automatic pre-conversion backup, crash-tolerant atomic swap per file,
   best-effort live-server lock probe, covers all SQLite files including
   isolated plugin DBs) — validated end to end via live CLI runs, not just
   unit tests.
6. **Phase F — docs + Docker.** `.env.example`, `docs/self-hosting.md` (new
   env var, full usage section, rotation, the pgloader-replacement note),
   `docs/security.md` (threat-model row and checklist updated to reflect this
   as shipped, not just specified), `docs/plugin-development.md`
   (`requireEncryption`), both Dockerfiles' toolchain comments, both
   `docker-compose*.yml` files (env var pass-through on both services),
   `pnpm-workspace.yaml` `allowBuilds`. `docs-parity` passes.

No published-SDK (`@sovereignfs/sdk`) surface changes; the only public-contract
change is the additive manifest field (Phase D). Per-package version bumps:
`@sovereignfs/db` (new encryption/migration surface), `@sovereignfs/manifest`
(new field), `@sovereignfs/auth` and `runtime` (wired consumers) — all minor;
platform version minor-bumped per the roadmap-milestone convention.

## Changelog

| Version | Date      | Change                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ------- | --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0.1     | July 2026 | Initial draft — opt-in, single-key SQLite whole-file at-rest encryption carved out of RFC 0008 Tier 2b; manifest `requireEncryption` (raise-only); migration tooling; explicit Postgres no-op-with-warning.                                                                                                                                                                                                                                                                                                                                                                                                                   |
| 1.0     | July 2026 | Implemented (epic task 8.14), all six adoption phases. Notably corrected the cipher selection mid-implementation — the driver's default is not SQLCipher, `cipher='sqlcipher'` must be set explicitly (open question 2). Migration tooling uses in-place `.rekey()`, not `sqlcipher_export()` (that function doesn't exist in this driver fork). better-auth migration compatibility confirmed empirically.                                                                                                                                                                                                                   |
| 1.1     | July 2026 | Fixed the §3 marker guard: "marker absent, key present" was treated as always meaning pre-existing plaintext data, with no exception for a genuinely empty data directory — silently breaking the "Enabling on a fresh instance" onboarding path this RFC documents (`sv db encrypt` also found zero files there and skipped writing the marker, so following the guard's own error led to a dead end). Added the fifth table row above; verified via a full local stress test covering fresh-instance boot, existing-instance encrypt/decrypt round-trip, wrong-key rejection, key rotation, and the CLI idempotency guards. |
