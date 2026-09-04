# Epic: Data Sovereignty

> Users own their data — they can export it, import it, migrate it to another instance, delete it entirely, and trust that it is encrypted at rest.

## Status

⏳ In Progress

## Overview

"Data sovereignty" is a core Sovereign promise: no lock-in, no silent retention. This epic covers the full data lifecycle — Drizzle-kit migrations and backup/restore (upgrade safety), self-service export/import (portability), per-plugin database isolation (plugin data stays with its plugin), self-delete (the right to be forgotten), and encryption at rest (post-v1, opt-in). User data deletion (epic task 1.7) is complete; encryption at rest is scheduled post-v1.

## Tasks

#### ✅ 8.1 — Deployment & upgrade strategy (RFC 0006)

**Goal:** Implement the tiered, low-downtime upgrade model from RFC 0006 / SRS §3.15. Depends on the CI pipeline (Task 0.5.07) for image publishing.

**Deliverables:**

- CI builds + pushes semver-tagged runtime/auth images; `docker-compose.prod.yml` references `image:` tags pinned by `SOVEREIGN_VERSION` (build-from-source kept as a fallback)
- Graceful shutdown (SIGTERM draining + `stop_grace_period`) in both standalone servers; blue-green documented as the advanced path
- drizzle-kit migrations under expand-contract: `drizzle.config`, `packages/db/migrations/`, load-bearing `runMigrations`, `schema_migrations` ledger, single-writer advisory lock, fail-fast
- `sv backup`/`sv restore` (dialect-aware, DB + avatars) + automatic pre-upgrade snapshot; tag-pinned rollback procedure
- Startup version gate (downgrade guard) surfaced in `/api/admin/health`
- Docs: `docs/self-hosting.md` + `docs/upgrade.md` rewrite

**Dependencies:** Task 0.5.07 (CI / image registry)

**SRS reference:** RFC 0006, SRS §3.15, NFR-01/04/10

**Review checklist:**

- An upgrade is `pull` + recreate (no host build); rollback = repin previous tag + `sv restore`
- A failed migration leaves the DB un-served and the pre-upgrade snapshot intact
- Graceful restart drops no in-flight requests behind the reverse proxy

---

#### ✅ 8.2 — User data portability (RFC 0007)

**Goal:** Implement self-service export/import/migration from RFC 0007 / SRS §3.16. The reserved `sdk.portability` surface and `data:export`/`data:import` permissions land as stubs first (sequenced after RFC 0005's stubs).

**Deliverables:**

- SDK: `sdk.portability.provideExport`/`provideImport` (replace stubs), runtime-mediated with injected user/tenant
- Runtime: export assembler + import validator (format/schema-version checks, ID remap), plugin-resolver registry, versioned-ZIP streaming, owner gating
- Account: a **Data** tab — export (download) + import/restore (upload) with a per-section result summary
- Reference plugins implement export/import resolvers
- Export/import events audited via `sdk.activity` (Task 0.5.12)

**Dependencies:** Task 0.5.05 (`sdk.db`), Task 0.5.12 (audit), Task 1.0.01 (optional bundle encryption, post-v1)

**SRS reference:** RFC 0007, SRS §3.16, §5 (`data:export`/`data:import`)

**Review checklist:**

- Export produces a versioned ZIP (`manifest.json` + `platform/` + `plugins/<id>/`); a plugin only ever exports/imports the current user's own data
- Import remaps IDs (no FK breakage), is additive by default, and skips unknown plugins with a warning
- Cross-instance import maps the subject user to the target instance's current user

---

#### ✅ 8.3 — Per-plugin database

> Full entry: **[3.13]** in [plugins-runtime.md](plugins-runtime.md) — Per-plugin database.
> This task provisions the isolated storage layer that keeps plugin data physically separate from the platform DB — a key component of data sovereignty.

---

#### ✅ 8.4 — User data deletion

> Full entry: **[1.7]** in [users-auth.md](users-auth.md) — User data deletion.
> This task gives users the right to permanently delete all their data, with plugin handlers called via `sdk.portability.provideDelete`.

---

#### 📋 8.5 — Encryption at rest & field-level, Tier 2–4 (RFC 0008)

**Goal:** The deferred, crypto-heavy tiers of RFC 0008 / SRS §3.17 — shipped **after v1**. Tier 2 (at-rest encryption + key management), Tier 3 (field-level via `sdk.crypto`), and the handoff to Tier 4 client-side encryption in RFC 0060. The reserved `sdk.crypto` surface + `crypto:use` permission land as `NotImplementedError` stubs first (after RFC 0005's stubs).

> **Scope note:** the SQLite-only, whole-file, opt-in slice of Tier 2b is carved out into **Task 8.14 (RFC 0071)** as a small, independently shippable feature. This task retains the parts 8.14 deliberately drops: the KEK→DEK envelope hierarchy, Postgres at-rest posture, avatar/blob encryption, and field-level Tier 3.
>
> **Scope note (August 2026):** RFC 0071 and its SQLCipher path were later retired entirely (see the v0.77.0 upgrade notes), making this task's Tier 2 SQLCipher deliverables obsolete. The KEK→DEK envelope key management and the Tier 3 field-level scope (`sdk.crypto`, `crypto:use`, blind indexes) are carved out into **[RFC 0092](../rfcs/0092-app-level-field-encryption.md)** (tasks 8.31–8.34, workstream 0011), which redesigns them as platform-wide-by-classification app-level field encryption per [Research 0013](../research/0013-layered-database-encryption-strategy.md). What remains here — encrypted backups/export bundles and avatar/blob encryption — stays post-v1 and unscheduled.

**Deliverables:**

- Tier 2: local-keyfile envelope key management (master KEK → wrapped DEKs; fail-fast when enabled); SQLCipher DB encryption (`better-sqlite3-multiple-ciphers`); encrypted backups (amends Task 0.5.13) + encrypted export bundles (amends Task 0.5.14); avatar/blob encryption
- Tier 3: `sdk.crypto` field-level encrypt/decrypt (per-user DEK) + `crypto:use` enforcement; optional blind indexes
- Tier 4: zero-knowledge/client-side encryption is tracked separately in Task 8.9 / RFC 0060 (per-plugin opt-in, first consumer Sovereign Wallet)
- New env vars (`SOVEREIGN_ENCRYPTION`, key/keyfile, backup passphrase) → `.env.example` + `docs/self-hosting.md` + docs-parity; **Docker/native-dep impact** (SQLCipher in image build + `allowBuilds`)

**Dependencies:** Task 0.5.15 (Tier 0–1), Task 0.5.13 (backups), Task 0.5.14 (exports)

**SRS reference:** RFC 0008 (Tiers 2–4), SRS §3.17, §5 (`crypto:use`), NFR-02/07/08/09

**Review checklist:**

- A stolen disk / leaked backup yields ciphertext; the docs state plainly that server-held keys do not defend against a curious operator or RCE
- Encryption is opt-in and fails fast when enabled without a key; rotation re-wraps DEKs without bulk re-encryption
- Field-level encryption is gated by `crypto:use`; encrypted columns document the search/sort caveat

---

#### ✅ 8.6 — Plugin secret vault (RFC 0043)

**Goal:** Add a platform-managed secret vault for runtime plugin secrets such as OAuth tokens, personal access tokens, API keys, webhook secrets, and user/provider refresh tokens.

**Deliverables:**

- Add `sdk.secrets` for plugin-scoped, user-scoped, and instance-scoped runtime secrets.
- Add encrypted platform storage for secret material and metadata.
- Keep plugin-scoped env vars as the deployment-time secret mechanism; use the vault for runtime-created secrets.
- Add Account/Console management surfaces where appropriate.
- Define export/delete behavior that exports metadata but not plaintext secret values.
- Add audit hooks for secret create/update/delete/read operations where useful.

**Dependencies:** Task 8.5 (encryption architecture) informs the cryptographic model; Task 3.11 (plugin-scoped env vars) remains the deployment-time baseline.

**SRS reference:** [RFC 0043](../rfcs/0043-plugin-secret-vault.md)

**Review checklist:**

- A plugin can store and retrieve a per-user credential without implementing its own encryption.
- Deleted users have plugin vault secrets removed.
- Exports do not leak plaintext secret values.
- Missing vault encryption/key configuration fails safely according to the accepted implementation model.

---

#### ✅ 8.7 — Plugin file storage (RFC 0044)

**Goal:** Implement `sdk.storage` as a plugin-scoped file storage surface for attachments, generated assets, imports, exports, thumbnails, and other plugin-owned binary objects, with a documented content-delivery model that keeps CDN/object storage optional and backend-neutral.

**Deliverables:**

- Add local filesystem-backed storage under the Sovereign data directory.
- Add SDK methods for put/get/delete/list or equivalent object operations.
- Add metadata tables for ownership, plugin ID, user ID, content type, size, and lifecycle state.
- Add signed/authorized serving routes for plugin-owned files.
- Define serving classes for private plugin files, explicit public plugin content, and existing build/static assets.
- Define signed URL cache headers, expiry behavior, and revocation semantics.
- Document the storage backend tiers: local filesystem default, reverse-proxy cache guidance, future S3-compatible backend, and optional CDN-fronted delivery.
- Integrate storage with user data export/import and deletion.
- Define quotas and upload limits.
- Keep the API backend-neutral so object-store support can be added later.
- Keep CDN/object-store details invisible to plugin code.

**Dependencies:** Task 8.2 (portability), Task 8.4/1.7 (deletion), Task 8.5 (future encryption).

**SRS reference:** [RFC 0044](../rfcs/0044-plugin-storage.md)

**Review checklist:**

- A plugin can store and serve a user-owned file without writing ad hoc paths.
- Private files are not public by default and are served through authenticated routes or short-lived signed URLs.
- CDN/reverse-proxy caching cannot extend private-file access beyond signed URL expiry.
- Storage objects are deleted when user data deletion runs.
- Export includes storage metadata and file payloads according to the accepted format.
- Access checks prevent one plugin/user from reading another plugin/user's objects.
- The docs state that CDN and object storage are operator optimizations, not required dependencies.

---

#### ✅ 8.8 — Plugin portability hooks (RFC 0052)

**Goal:** Add plugin-owned export/import/delete hooks so richer plugins can participate in Account-level portability without platform-specific table introspection.

**Deliverables:**

- Add SDK/runtime hook registration for plugin export, import, and user-data deletion.
- Define plugin export result metadata: plugin ID, plugin version, schema version, data payload, files, references, secret metadata, and warnings.
- Support file inclusion through plugin storage and user-selected export options.
- Export secret metadata but never plaintext secret values.
- Preserve cross-plugin references as inert metadata and document remapping behavior.
- Make deletion hooks idempotent and cover plugin rows, user-owned storage, user-scoped secrets/connections, queued jobs, and generated artifacts.
- Add Account orchestration and per-plugin success/failure reporting.

**Dependencies:** RFC 0007 user data portability, RFC 0033 user data deletion, RFC 0044 plugin file storage, RFC 0049 plugin external connections, RFC 0051 cross-plugin references.

**SRS reference:** [RFC 0052](../rfcs/0052-plugin-portability-hooks.md)

**Review checklist:**

- A plugin can export domain data and selected files without custom Account UI.
- Import validates bundle shape/version before writing.
- User deletion calls plugin cleanup idempotently.
- Export bundles never include plaintext secrets.

---

#### ✅ 8.9 — Client-side encryption core (RFC 0060)

**Goal:** Make RFC 0008 Tier 4 concrete by adding a core client-side encryption
capability that lets approved plugins store user data the runtime and operator
cannot decrypt.

**Deliverables:**

- Define and implement a client-side encryption SDK surface distinct from
  server-side `sdk.crypto.encryptField()`.
- Add encrypted profile metadata tables for client master key wrappers, recovery
  wrappers, and enrolled devices.
- Add Account setup/unlock/recovery UX with explicit data-loss warnings.
- Add helpers for browser-side encryption/decryption of binary blobs and JSON
  metadata.
- Integrate encrypted binary payloads with plugin storage.
- Add manifest permission/capability gating for plugins that use client-side
  encryption.
- Document recovery, password reset, device enrollment, export/delete, and
  metadata-minimization rules.

**Dependencies:** RFC 0008, Task 8.7 (plugin file storage), Task 8.8 (plugin
portability hooks).

**SRS reference:** [RFC 0060](../rfcs/0060-client-side-encryption-core.md)

**Review checklist:**

- Runtime and server-side plugin code never receive plaintext for encrypted
  objects.
- Password reset does not silently imply encrypted-data recovery.
- A user can set up encryption, record a recovery secret, and enroll a second
  device.
- Encrypted object metadata separates plaintext routing fields from encrypted
  human-readable fields.
- Export/delete flows preserve ciphertext and remove all encrypted user data
  idempotently.

---

#### 📋 8.10 — Encrypted operator backup bundle (RFC 0064)

**Goal:** Replace the current ad hoc local backup archive shape with a
manifested, encrypted operator backup bundle that can be stored locally or sent
to a remote backend. This is full-instance disaster recovery, distinct from
Account-level user portability.

**Deliverables:**

- Add a versioned `backup-manifest.json` with backup ID, source instance,
  platform/schema version, DB dialect, artifact inventory, checksums, encryption
  metadata, and consistency status.
- Add per-plugin artifact inventory covering shared-table plugins, isolated
  plugin DBs, plugin storage roots, plugin vault ciphertext/metadata, installed
  plugin status, and manifest/version metadata.
- Encrypt the final backup payload before it leaves the host by default.
- Never include plaintext `.env`; capture it only as `config/.env.enc`, plus
  `env.required.json` / `env.public.json` metadata for restore planning.
- Add explicit `sv restore env <backup>` flow that decrypts `.env.enc` to an
  operator-selected output path instead of overwriting the live `.env`.
- Improve SQLite backup consistency with SQLite online backup / `VACUUM INTO`
  and a backup lock or explicit `best-effort` manifest marker when a full
  cross-store lock is not available.
- Preserve existing local archive restore support for manual and air-gapped
  deployments.

**Dependencies:** Task 8.1 (`sv backup`/`restore` baseline), RFC 0008 key-management guidance. This task should not wait for full DB-at-rest encryption from Task 8.5.

**SRS reference:** [RFC 0064](../rfcs/0064-git-backed-operator-backups.md), RFC 0006, RFC 0008

**Review checklist:**

- A remote-ready backup bundle contains no plaintext `.env` and no backup
  key/passphrase.
- The manifest makes it clear which artifacts belong to each installed plugin.
- Corrupt or tampered payloads fail before restore writes any data.
- Local restore still works for operators who do not configure a remote backend.
- Docs clearly distinguish operator backups from user data export/import.

---

#### 📋 8.11 — Git-backed backup remote (RFC 0064)

**Goal:** Add the first remote backup backend: any Git server with an empty
private backup repository, using encrypted backup payloads by default.

**Deliverables:**

- Add Git backend configuration (`SV_BACKUP_BACKEND=git`,
  `SV_BACKUP_GIT_REPOSITORY`, `SV_BACKUP_GIT_BRANCH`,
  `SV_BACKUP_GIT_TOKEN`, backup key/passphrase vars) to `.env.example` and
  operator docs.
- Support HTTPS token auth for generic Git servers without persisting the token
  into `.git/config`; support SSH URLs through the operator's existing SSH setup.
- Implement `sv backup create`, `sv backup push`, `sv backup list`, and
  `sv restore latest | <backup-tag>` for remote-backed backups.
- Store each backup as an orphan commit tagged with a stable
  `sv-backup/<timestamp>/v<platform>` tag, plus non-secret remote metadata for
  listing.
- Enforce encrypted remote backups by default; allow
  `--allow-plaintext-remote` only with a high-friction warning, while still
  requiring `.env.enc`.
- Add size policy warnings and limits: warn above 250 MiB, require explicit
  confirmation above 1 GiB, and allow operators to raise the configured maximum.

**Dependencies:** Task 8.10

**SRS reference:** [RFC 0064](../rfcs/0064-git-backed-operator-backups.md), RFC 0006, RFC 0008

**Review checklist:**

- A leaked Git repository or Git token exposes only ciphertext by default.
- `restore latest` resolves the newest valid remote backup, verifies it, and
  stages it locally before writing data.
- The implementation works with a generic Git remote, not GitHub-specific APIs.
- Multi-GB backups produce clear guidance to use a future object-storage backend
  instead of silently bloating Git history.

---

#### 📋 8.12 — Backup retention, deletion, and scoped restore guards (RFC 0064)

**Goal:** Make remote backup history manageable and make destructive restores
safer by default, including the ability to restore only one plugin's data from a
full-instance backup.

**Deliverables:**

- Add `sv backup delete --older-than <duration>`, `sv backup delete --keep <n>`,
  and `sv backup prune` for Git-backed backups.
- Make deletion dry-run by default unless `--yes` is passed.
- Never delete the newest successful backup; support protected tag patterns for
  operator-pinned restore points.
- Update any remote backup index after deletion and verify that `restore latest`
  still resolves to a valid backup.
- Document that remote storage may not shrink until the Git server performs
  garbage collection.
- Add restore guards for platform-version compatibility, DB dialect/artifact
  compatibility, required key/passphrase presence, checksum/authentication
  validation, and free staging disk space.
- Refuse backups created by a newer platform version by default, with an
  explicit `--force` override and safer-path guidance.
- Add `sv restore plugin <plugin-id> --from <backup-tag>` with dry-run and
  staging support for plugin-scoped recovery.
- Validate plugin manifest/version compatibility before plugin-scoped restore;
  block or force-confirm when cross-plugin references, queued jobs, external
  connection state, or newer schema migrations make isolated restore unsafe.
- Keep platform identity rows out of plugin-scoped restore unless a future task
  defines a safe explicit mapping.

**Dependencies:** Task 8.11

**SRS reference:** [RFC 0064](../rfcs/0064-git-backed-operator-backups.md), RFC 0006, RFC 0008

**Review checklist:**

- `--older-than 30d` / `60d` selects the expected backup tags without deleting
  anything until confirmed.
- Retention cannot leave the remote with zero restorable backups.
- Restore refuses newer-platform backups by default and explains the matching or
  newer binary requirement.
- Plugin-scoped restore can recover one plugin's DB/files without restoring the
  whole instance.
- Unsafe plugin-scoped restores are blocked or require an explicit `--force`
  acknowledgement with repair guidance.
- Docs include tested examples for listing, deleting, pruning, and restoring
  backups.

---

#### ✅ 8.13 — Export completeness hardening (RFC 0068)

**Goal:** Close the silent-non-participation gap in the RFC 0052 portability
system so a user-initiated export reliably reports on every plugin they use,
not only the ones that happen to have registered a hook.

**Deliverables:**

- Add `installedPlugins` (all plugins installed for the tenant, with export/
  import participation flags) to `BundleManifest`, populated independently of
  the permission-filtered eligibility list.
- Add a `notExported` list recording plugins skipped during export because no
  exporter is registered, instead of silently omitting them.
- Surface non-participating installed plugins in the Account Data tab
  (`PortabilityPanel.tsx`) so gaps are visible at export time.
- Audit every shipped plugin's manifest `data:export`/`data:import`
  permission declarations against actual `sdk.portability` hook
  registrations; close each mismatch by implementing the hook or removing the
  unearned permission.
- Decide and document the stance on export size/assembly mode (documented
  ceiling with a clear error vs. background job + download-when-ready), since
  a "complete" multi-plugin export can exceed the current 50 MB import cap.
- Bump `EXPORT_FORMAT_VERSION` to 2 for the additive manifest fields.

**Dependencies:** Task 8.2 (user data portability), Task 8.8 (plugin
portability hooks).

**SRS reference:** [RFC 0068](../rfcs/0068-export-completeness-hardening.md)

**Review checklist:**

- An export's `manifest.json` lists every plugin installed for the user,
  regardless of whether it participated in the export.
- A plugin installed but lacking an export hook appears in `notExported` with
  a reason, not silently absent from the bundle.
- No shipped plugin declares `data:export`/`data:import` in its manifest
  without a corresponding registered hook.
- The documented size/assembly stance is enforced, not merely described.

---

#### ✅ 8.14 — SQLite at-rest encryption (opt-in, single-key) (RFC 0071)

**Goal:** Give the zero-config SQLite deployments — the majority of self-hosted instances — a verifiable "stolen disk yields ciphertext" guarantee, as a small opt-in feature carved out of Task 8.5's Tier 2. Off by default; when the operator sets one instance-wide key, every SQLite database the instance owns (`sovereign.db`, `auth.db`, and every isolated plugin DB) is transparently encrypted with SQLCipher. Deliberately drops the KEK→DEK envelope, Postgres, avatar/blob, and field-level pieces (those stay in Task 8.5).

**Deliverables:**

- `SOVEREIGN_DB_ENCRYPTION_KEY` env var (no default; presence is the toggle; same encoding + fail-fast loader as `SOVEREIGN_VAULT_KEY`); a single shared keyed opener in `packages/db` (plus the self-contained `apps/auth` twin) replacing `better-sqlite3` with `better-sqlite3-multiple-ciphers` at all five `new Database(` call sites (`client.ts`, `apps/auth/src/db.ts`, `plugin-client.ts`, `scripts/reset-mfa.ts`, `scripts/seed.ts`)
- State-marker mismatch guard (fail-fast both directions: encrypted-but-no-key, and plaintext-but-key-set)
- Manifest `database.requireEncryption` — **raise-only** (a plugin can force encryption on for its own isolated DB, never off), implies `isolation: "isolated"`, and fails startup naming the plugin if the key is unset; `docs/plugin-development.md` + docs-parity update
- Postgres: documented no-op with a startup **warning** when a `requireEncryption` plugin resolves to Postgres (no SQLCipher equivalent — falls back to disk + `sslmode`)
- `sv db encrypt` / `sv db decrypt` migration tooling (offline, backup-first, crash-tolerant atomic swap, covers all SQLite files); documented replacement for the pgloader-based SQLite→Postgres path
- Docker/native-dep: `allowBuilds` entry for `better-sqlite3-multiple-ciphers` + dependency swap in both Dockerfiles (toolchain already present); `.env.example` + `docs/self-hosting.md` + `docs/security.md` updates

**Dependencies:** Task 8.3 (per-plugin database — the isolated-DB call site), Task 8.1 (`sv backup` baseline — backups inherit encryption for free). Does **not** depend on the full Task 8.5 envelope work.

**SRS reference:** [RFC 0071](../rfcs/0071-sqlite-at-rest-encryption.md), amends RFC 0008 Tier 2b; NFR-02/07/08.

**Review checklist:**

- With no key set, behaviour is byte-for-byte unchanged (plaintext, no new runtime cost).
- With the key set, a raw copy of any `.db` file is ciphertext; sign-in, MFA, and better-auth migrations work against an encrypted `auth.db`.
- Key/state mismatch fails fast with an actionable message, never a generic "file is not a database" or silent plaintext write.
- A plugin's `requireEncryption` can only raise protection; a `shared` plugin declaring it is a manifest error; an unset key names the requiring plugin at startup.
- The migration tool refuses to run live, requires a backup, and leaves the plaintext original intact on failure.
- Docs state plainly that this protects a stolen disk/backup only — not a curious operator or RCE (use RFC 0060 for those) — and that losing the key loses the data.

---

#### ✅ 8.15 — Per-database SQLite encryption enforcement (RFC 0071 follow-up)

**Goal:** Fix the root cause of the 2026-07-24 production incident
(`docs/incidents/2026-07-24-rfc-0071-encryption-rollout.md`): Task 8.14 made
`SOVEREIGN_DB_ENCRYPTION_KEY`'s presence a **directory-wide** toggle — one
marker file at `<dataDir>/.db-encrypted` meant "every SQLite file this
instance owns must already be encrypted or the instance refuses to boot,"
with no per-plugin distinction. Setting the key because one plugin
(`sovereign-healthlog`) declared `database.requireEncryption: true` broke
four unrelated plugins whose plaintext files had nothing to do with that
requirement. Replace the directory-wide marker with per-database state so
the key can be present without forcing every plugin's database to be
encrypted.

**Target behaviour:**

- **Key unset:** nothing is ever encrypted — platform core or plugin. A
  plugin manifest declaring `database.requireEncryption: true` no longer
  fails startup; it logs a warning ("platform-wide encryption isn't
  configured — running unencrypted") and boots normally, same posture the
  Postgres branch of `assertPluginEncryptionRequirement` already has today.
- **Key set:** the platform core (`sovereign.db` + `auth.db`, tied together —
  no separate flag) is always expected to be encrypted. A plugin's isolated
  SQLite file is encrypted **only if its own manifest requests it** via
  `database.requireEncryption`; a plugin that doesn't request it stays
  plaintext, untouched by the key, exactly the case the incident broke.
- **Key set + an existing plaintext file that should be encrypted** (core, or
  a plugin that requests it): still fails fast for that specific file only,
  prompting `sv db encrypt` — same fail-fast spirit as Task 8.14, correctly
  scoped instead of directory-wide.

**Deliverables:**

- Replace the single directory-wide marker (`packages/db/src/sqlite-encryption.ts`
  `checkEncryptionMarker`, and its `apps/auth` twin) with **per-file state**: a
  core marker (redefine the existing `.db-encrypted` file's meaning to cover
  only `sovereign.db`/`auth.db`) plus a new per-plugin marker per isolated
  `.db` file (e.g. `<dataDir>/plugins/<id>.db-encrypted`).
- `packages/db/src/plugin-client.ts`'s `getPluginDb` reads the plugin's own
  `database.requireEncryption` (currently never consulted at this call site —
  root cause of the incident) and only applies the key / checks that plugin's
  own marker when the plugin requests it; otherwise opens the file plain
  regardless of key presence.
- `runtime/src/plugin-migrations.ts`'s `assertPluginEncryptionRequirement`:
  SQLite branch changes from throw-on-no-key to warn-on-no-key (mirroring its
  existing Postgres branch); a separate check (key present, plugin requires
  it, plugin's own marker absent, plugin's file already exists as plaintext)
  still fails fast for that plugin only — already isolated per-plugin by the
  incident's first fix, just re-pointed at the new per-plugin marker instead
  of the removed directory-wide one.
- Same treatment for `apps/auth/src/sqlite-encryption.ts` (self-contained
  twin, per its own header comment) for `auth.db`'s tie to the core marker.
- `bin/sv.ts`'s `sv db encrypt`/`decrypt` (`dbEncrypt`/`dbDecrypt`,
  currently blanket over every file from `listInstanceSqliteFiles`) become
  selective: encrypt/decrypt the core files plus only the plugin files whose
  manifest requests it, writing/clearing each file's own marker as it goes.
  A plugin file that never requested encryption is left untouched entirely.
- **Backward-compat migration:** on first boot under this change, if the
  legacy directory-wide marker is present (an existing instance that already
  ran the old blanket `sv db encrypt`), backfill per-plugin markers for every
  plugin `.db` file that already exists on disk — the old system encrypted
  everything blanket-style, so their current on-disk state genuinely is
  already-encrypted; this avoids incorrectly flagging them as needing
  conversion. One-time, idempotent, logged.
- `docs/self-hosting.md` / `.env.example` / `docs/security.md` updated to
  describe the new per-database semantics; note this is a **behaviour
  change**, not a data migration — no operator action required unless a
  plugin's own encryption requirement changes.

**Dependencies:** Task 8.14 (this directly amends its enforcement model, not
its key/opener mechanics, which are unchanged).

**SRS reference:** [RFC 0071](../rfcs/0071-sqlite-at-rest-encryption.md)
(amendment); incident doc above.

**Review checklist:**

- Setting the key with only one plugin requesting encryption leaves every
  other plugin's plaintext file untouched and bootable — the exact incident
  scenario, verified end to end.
- No key set + a plugin requesting encryption: boots successfully with a
  logged warning, not a startup failure.
- Key set + platform core already plaintext: fails fast, names `sv db
encrypt`, same as today.
- Key set + a requesting plugin's file already plaintext: fails fast for
  that plugin only; every other plugin still boots (regression test for the
  incident's original migrations-loop bug).
- An instance upgrading from the old directory-wide-marker model boots
  cleanly with no spurious "needs encryption" errors for already-encrypted
  plugin files.
- `sv db encrypt`/`decrypt` skip plugins that never requested encryption.
- Full test suite plus a live encrypt → verify → decrypt → verify round-trip
  against real data (per this subsystem's standing CLAUDE.md requirement).
- `pnpm format:check && pnpm lint && pnpm typecheck && pnpm test`

---

#### 📋 8.16 — Backup job infrastructure & signed download delivery (RFC 0084)

**Goal:** Give both the operator (instance) and user (self-service) backup flows a
shared, minimal async-job primitive and a delivery mechanism that fits an archive
too large or slow to hand back in one HTTP request — neither exists today. This is
pure platform primitive; nothing user-facing ships in this task.

**Deliverables:**

- `backup_jobs` Drizzle schema (both dialects) in `packages/db`: `id`, `scope`
  (`'instance' | 'user'`), `requestedByUserId`, `tenantId`, `status`
  (`queued|running|complete|failed`), `optionsJson`, `archivePath`, `sizeBytes`,
  `errorMessage`, `createdAt`, `startedAt`, `completedAt`, `expiresAt`.
- `runtime/src/backup-worker.ts` — a new sibling module to `runtime/src/scheduler.ts`
  (not a repurposing of it — `scheduler.ts`'s own doc comment states it is
  deliberately not a job queue), using the same interval-tick +
  conditional-`UPDATE`-claim idempotency pattern. Claims one queued job per tick,
  runs it, marks `complete`/`failed`, and sweeps expired archive files.
- Passphrase-derived (`scrypt`) AES-256-GCM archive encryption/decryption helper
  using Node's built-in `crypto` — no new dependency.
- `runtime/app/api/backup-jobs/[jobId]/download/[token]/route.ts` — HMAC-signed
  opaque token in the same construction style as
  `runtime/app/api/storage/[token]/route.ts`, but a configurable TTL (default 48h,
  not the storage route's 1h ceiling) and streaming from disk (`createReadStream`),
  never buffering the whole archive in memory.
- Notification-on-completion wiring — confirm and implement the platform-level
  (non-plugin) integration point into the existing notification broker that
  `NotificationBell`/`sdk.notifications` already surface through.

**Dependencies:** None new — a self-contained platform primitive.

**SRS reference:** [RFC 0084](../rfcs/0084-ui-driven-backup-restore.md)

**Review checklist:**

- A job survives a mid-job process restart by being swept from `running` back to
  `failed` on next boot, rather than staying stuck `running` forever.
- The encryption helper round-trips: encrypt → decrypt with the correct
  passphrase succeeds; the wrong passphrase fails cleanly, not silently.
- The download route streams rather than buffers — verified against an archive
  larger than `sdk.storage`'s object caps.
- A signed download token cannot decrypt the archive on its own; the passphrase
  is required separately.
- Expired jobs' archive files are actually removed from disk by the sweep.

**Progress note (in progress, not yet complete — kept at 📋):** the schema,
worker orchestration (claim/run/mark/sweep, boot-time reclaim of orphaned
`running` jobs), encryption helper, and download route all exist and are
tested — the encryption helper and the claim/complete/sweep DB primitives
against a live sqld instance, the worker's orchestration logic against
injected fakes. Two deliverables are still genuinely incomplete, not just
untested:

- **Instance-scope jobs cannot succeed in the documented production Docker
  deployment yet.** `runInstanceBackup` (`runtime/src/backup-run.ts`) spawns
  `pnpm sv backup` as designed, but the `runtime` service's production image
  has no `bin/`/`scripts/`/`tsx` to spawn at all (only the separate, on-demand
  `tools` image does) — see `docs/architecture-rules.md`'s new entry for the
  full account. A claimed job fails cleanly with an actionable error in this
  topology today; none actually succeed until this is resolved. Works
  correctly in a native `pnpm dev` checkout, which is how the worker logic
  itself was verified.
- **Notification-on-completion now sends when the requester is known**
  (`runtime/src/backup-notification.ts`, closed by workstream 0020 task
  `0.25`) — a completed/failed job writes a `notifications` row, publishes to
  the broker, and fans out a push to `backup_jobs.requestedByUserId` when
  set. The one remaining gap: an instance-scope job with no identifiable
  requester has nowhere to send a notification, since no primitive anywhere
  in `packages/db`/`runtime/src` enumerates admin user IDs (role data lives
  in the separate `apps/auth` service). This case is explicit and logged
  (`logger.warn`), not silently dropped — closing it fully needs a
  cross-service admin-listing primitive, out of scope for `0.25`.

User-scope jobs (`assembleExport()`) are correctly out of scope here per the
RFC's own adoption path (task 8.18) — `runInstanceBackup` rejects a
`scope: 'user'` job with a clear "not implemented yet" error rather than
attempting a partial integration; there is no enqueue path at all yet for
either scope (Console/Account UI is 8.17/8.18). Encryption is deliberately
not wired into job execution: the requester's passphrase must never be
persisted, and no mechanism yet carries it from wherever a job is enqueued
through to whichever later tick actually claims and runs it — unresolved
design work for whichever of 8.17/8.18 builds the first real enqueue path,
not a coding gap in this task.

Given both gaps above, the worker is gated behind `SOVEREIGN_BACKUP_WORKER_ENABLED`
(opt-in, off by default — see `runtime/src/backup-worker.ts`'s doc comment),
unlike the scheduler/plugin-job-worker it mirrors. With no enqueue path yet,
a running worker would only ever tick over an empty table — pure DB-query
overhead on every existing self-hosted instance for a feature nobody can
reach. Flip it on once 8.17/8.18 land.

---

#### 📋 8.17 — Console: instance backup & restore UI (owner/admin) (RFC 0084)

**Goal:** Give owners and admins a Console page to back up and restore the whole
instance without touching a CLI — wrapping the existing `sv backup`/`sv restore`
(epic task 8.1) rather than reimplementing their archive logic.

**Deliverables:**

- `plugins/console/app/backups/page.tsx` — `adminOnly`-gated, same
  `hasCapability`/Server-Action/`ActionResult` conventions as the rest of Console.
- Backup trigger: plugin-exclusion checkboxes, required passphrase field, optional
  "also push to a Git remote" checkbox (shown only when
  `SV_BACKUP_GIT_REPOSITORY`/`SV_BACKUP_GIT_TOKEN`-shaped credentials are
  configured — reusing RFC 0064's env var naming for forward compatibility). Job
  list with status and download links.
- `sv backup --exclude-plugin <id>` (repeatable) CLI flag — the one change to the
  existing backup command this task needs; the worker (8.16) spawns `sv backup` as
  a subprocess with this flag set from the job's options.
- Optional Git-remote push after a successful backup: orphan commit tagged
  `sv-backup/<timestamp>/v<platform>` (same shape RFC 0064 proposes). No
  retention/listing/pruning UI — that stays epic task 8.12, deferred. Git token
  stored via the same encrypted-secret pattern
  `plugins/console/app/settings/SmtpSettingsForm.tsx` already establishes for
  admin-managed external provider config.
- Guarded restore flow: pick a previous backup or upload an archive → validation/
  compatibility preview (platform version, DB dialect, plugin manifest
  compatibility — pulls forward RFC 0064's "Restore guards" list) → maintenance-
  mode toggle → automatic pre-restore safety snapshot (mirrors `sv db encrypt`'s
  existing auto-backup-before-convert precedent) → typed confirmation (type the
  instance name) → in-process execution using `sv restore`'s existing logic.

**Dependencies:** 8.16, 8.1 (`sv backup`/`restore` baseline). Coordinate with
future epic tasks 8.10–8.12 (RFC 0064) — when they land, reconcile this task's
local backup manifest and Git-push code into RFC 0064's format rather than
maintaining two formats permanently; do not block this task on 8.10–8.12.

**SRS reference:** [RFC 0084](../rfcs/0084-ui-driven-backup-restore.md), RFC 0006,
RFC 0064 (partial — Git push only, not retention/scoped restore).

**Review checklist:**

- A non-admin cannot reach `/console/backups` (403, same as every other
  `adminOnly` Console route).
- Excluding a plugin from a backup produces an archive that genuinely omits that
  plugin's data, verified against a real generated archive.
- Restore refuses to proceed past the compatibility preview on a platform-version
  or dialect mismatch without an explicit override.
- The automatic pre-restore safety snapshot exists on disk before the restore
  writes anything.
- A restore cannot be triggered without both the maintenance-mode toggle and the
  typed instance-name confirmation.
- Git push (when configured) produces a resolvable tag; when not configured, the
  checkbox is absent, not merely disabled.

---

#### ✅ 8.18 — Account: async selective data backup UI (regular users) (RFC 0084)

**Goal:** Let any user trigger an asynchronous, selective backup of their own
data, resolving RFC 0007's long-open "sync vs async export" and "selective
export" questions — without touching the existing synchronous quick-export
endpoint or the existing import/restore flow.

**Deliverables:**

- A new "Full backup" action in `plugins/account/app/data/page.tsx` /
  `PortabilityPanel.tsx`, alongside (not replacing) the existing synchronous
  export button: per-plugin inclusion checkboxes, required passphrase field, job
  status, signed download link once ready.
- `ExportOptions` (`packages/sdk/src/portability.ts`) extended with a per-plugin
  inclusion list alongside the existing `includeFiles` toggle.
- The async path has no `MAX_EXPORT_BYTES` ceiling — the existing synchronous
  `GET /api/account/export` keeps its ceiling unchanged for quick small exports.
- Restore is explicitly **not** changed — it stays the existing
  `POST /api/account/import` additive-merge flow; importing an already-downloaded
  file is fast and bounded and doesn't need the job/async treatment.

**Dependencies:** 8.16, 8.2 (user data portability), 8.8 (plugin portability
hooks), 8.13 (export completeness hardening).

**SRS reference:** [RFC 0084](../rfcs/0084-ui-driven-backup-restore.md), RFC 0007
(resolves Open Questions #2 and #7), RFC 0068.

**Review checklist:**

- A selective backup excluding a plugin produces a bundle whose manifest reflects
  that exclusion (not silently included, not silently missing without a reason).
- An async backup larger than `MAX_EXPORT_BYTES` completes successfully, proving
  the async path is genuinely uncapped by the old ceiling.
- The existing synchronous quick-export button and the existing import flow are
  both unchanged and still pass their existing tests.
- The archive requires the passphrase to decrypt; a wrong passphrase fails
  cleanly.

**Shipped:** Picked up as an unplanned prerequisite for workstream 0023 leg 3
(per-user git push, epic 8.39), which extends this task's async backup job
with a push step — leg 3 cannot start without a real enqueue path existing
first, and this task was still 📋 when that gap was hit.

`ExportOptions` (`packages/sdk/src/portability.ts`) gained
`excludePluginIds?: string[]`; `assembleExport()`
(`runtime/src/portability/assemble.ts`) filters excluded plugins before
invoking their exporter and records them in the bundle manifest with a new
`NotExportedEntry.reason` value, `'user-excluded'`, alongside the existing
`'no-export-hook'`/`'disabled'` — never silently included, never silently
missing without a reason, per this task's own review checklist. New
`runtime/src/portability/platform.ts` `gatherPlatformExport(userId, cookie)`
splits the existing cookie-based session read (`profileFromSessionCookie`,
used by the synchronous export route, unchanged) from a new
`profileFromDirectory()` fallback — admin-key-authenticated
`POST /api/admin/directory` — for the case this task actually needed: a
background worker tick has no session cookie at all. New
`runtime/src/backup-passphrase-store.ts` bridges the passphrase from the
enqueue request (which has it) to the later worker tick that runs the job
(which only has the `backup_jobs` row) — single-use, 10-minute TTL, never
persisted or logged, matching RFC 0084's "always applied, never persisted"
passphrase invariant. New `runUserBackup()` (`runtime/src/backup-run.ts`)
wires all of this together — assembles the export, encrypts with task
8.37's `age`-based `encrypt()`, writes the archive — and `backup-worker.ts`
dispatches on `job.scope` to it or the existing instance-scope path. Two new
API routes, `POST /api/account/backup-jobs` (enqueue) and
`GET /api/account/backup-jobs/[id]` (poll — 404s for another user's job or
an instance-scope job, never just denies, so existence itself isn't leaked)
round out the surface `PortabilityPanel.tsx`'s new "Full backup" section
polls against.

**A real, load-bearing concurrency bug was found and fixed during live
verification, not by unit tests** (which mock the module boundary and can't
catch this class of bug): the first live end-to-end attempt failed every
time with `"No passphrase available for this job"`, even though the
passphrase had genuinely just been stored. Root-caused with temporary
instance-id diagnostic logging rather than guessed at: `next dev` compiles
the instrumentation-loaded worker (started once at boot) and the
on-demand-compiled `/api/account/backup-jobs` route handler into **separate
webpack module registries**, so `backup-passphrase-store.ts`'s plain
module-scope `const entries = new Map()` was not actually the same `Map` in
both places — confirmed live: two different `[DIAG]`-tagged instance ids
logged in the one running process. Fixed by anchoring the store's state on
`globalThis` (the same idiom Next.js's own docs prescribe for a dev-mode
Prisma client singleton) — a no-op in a real production build, where
everything resolves to the same compiled module, but a real fix for dev and
for any topology where these two code paths could otherwise diverge.

Verified live end-to-end against a real dev server with
`SOVEREIGN_BACKUP_WORKER_ENABLED=1`, not just unit tests: triggered a full
backup with a real passphrase from the actual "Full backup" UI, watched it
queue then complete via the real 60-second worker tick, downloaded the
resulting `.zip.age` archive via its signed URL, and decrypted it with
`backup-encryption.ts`'s real `decrypt()` using the exact passphrase — a
valid ZIP (`PK\x03\x04` magic) containing a correct `manifest.json` (right
user, right installed-plugin roster) and `platform/account.json`. Confirmed
decryption **fails cleanly** with a wrong passphrase, closing the review
checklist's last item. Confirmed via direct code inspection (not just
reasoning) that the async path carries no `MAX_EXPORT_BYTES` ceiling at
all — that constant exists only in the synchronous `GET /api/account/export`
route (`runtime/app/api/account/export/route.ts`), never in
`runUserBackup()` — so the async path is genuinely uncapped by construction,
not merely untested at large sizes. `backupArchivePathForJob()`
(`runtime/src/backup-download.ts`) was also fixed to be scope-aware —
`.zip.age` for user-scope, `.tar.gz` for instance-scope — after a review
pass caught it always producing the instance-scope extension, which would
have shipped a real, confusing UX bug (a user trying to `tar -xzf` an
age-encrypted ZIP). Test archives and `backup_jobs` rows created during live
verification were cleaned up afterward.

Full repository suite green (309 files, 3007 tests, 0 failed, up from 2907
before this task); `pnpm --filter runtime typecheck`, `pnpm lint`,
`pnpm format:check`, and `pnpm exec tsx scripts/design-tokens-check.ts` all
clean. `@sovereignfs/sdk` bumped `1.49.0` → `1.50.0` (minor — additive public
field on `ExportOptions`, a host-implementer-facing contract per NFR-04);
`runtime` bumped `0.93.0` → `0.94.0`; `plugins/account/manifest.json` bumped
`0.4.3` → `0.4.4`.

---

#### ❌ 8.19 — RFC 0071 incident: pre-flight warning and remaining doc follow-ups — Rejected

**Rejected (2026-08-13)** — excluded from workstream
[0006](../workstreams/0006-rfc-0071-incident-followups.md) (Leg 2) during
implementation planning; not carried forward to any other workstream. Left
here for the record rather than deleted.

**Why:** this task's entire mechanism was built on RFC 0071's
`database.requireEncryption` manifest field and the `findEncryptionRequiringPlugins()`
scanner. Both are gone: RFC 0071's at-rest encryption was retired from the
live code path (see CLAUDE.md's changelog and
[RFC 0071](../rfcs/0071-sqlite-at-rest-encryption.md)'s Status line) before
this task was ever started, the manifest schema now rejects any `database`
key at all (`packages/manifest/src/__tests__/validate.test.ts:347-358`), and
`findEncryptionRequiringPlugins()` no longer exists in `bin/sv.ts`. There is
nothing left to scan for or warn about — "an encryption-requiring plugin" is
no longer a thing a manifest can declare. Re-scoping this task against RFC
0092's field-level encryption (`database.requireEncryption`'s closest living
analogue) would be a materially different task, not a fix to this one; if
that's wanted later it should be planned fresh, not resurrected here.

Two of the four doc deliverables are moot along with the mechanism:
`docs/self-hosting.md`'s "installing an encryption-requiring plugin" scenario
(the section it would have lived in no longer exists), and
`docs/troubleshooting.md`/`docs/upgrade.md` entries for the exact
`DbEncryptionConfigError: ... has not been encrypted yet` message — that
specific message was only ever thrown by the boot-time reactive check Task
8.15 added, which no longer runs (nothing in the live server reads
`SOVEREIGN_DB_ENCRYPTION_KEY` today; `DbEncryptionConfigError` itself
survives only for an unrelated key-format error in the legacy
`migrate-to-postgres` read path).

**One deliverable is not moot and was mis-scoped into this rejection
initially:** `docs/plugin-development.md`'s append-only-migrations guidance.
The original task text says this explicitly — "this is ... not an encryption
bug at all, ... worth documenting on its own regardless of encryption." The
underlying fact (Drizzle's SQLite migrator compares a migration folder's
embedded timestamp against `__drizzle_migrations`, not a content hash, so a
regenerated migration file is silently re-run) is still true and still
undocumented (`docs/plugin-development.md` has no such section as of
2026-08-13). This item should be picked up as its own small, standalone doc
follow-up — not resurrected under this task, since everything else about it
is retired.

Per workstream 0006's kill criteria, the still-valid sibling (publishing a
`sovereign-tools` image, Task 0.19) proceeds unaffected.

**Original goal, deliverables, and review checklist** are preserved in this
file's git history (see the commit that added this rejection note) rather
than reproduced here, since none of it is actionable against the current
codebase.

**Dependencies:** none (was Task 8.15; no longer applicable).

**SRS reference:** [RFC 0071](../rfcs/0071-sqlite-at-rest-encryption.md)
(Retired); incident doc above.

---

#### 🚧 8.20 — Offline data encryption at rest (Research 0012)

> **Partial — both tiers' web/PWA encryption done, native SQLCipher and the
> real relational engines are not.** `packages/sdk/src/device-only-kv.ts`
> (`@sovereignfs/sdk/device-only-kv`) is a real, tested AES-GCM-encrypted
> key/value store over OPFS, gated on the unlocked Device Storage Key from
> task 1.22. `packages/sdk/src/offline.ts` (`sdk.offline`, the `offline-first`
> tier's existing IndexedDB cache) now transparently AES-GCM-encrypts every
> value under `offline-device-key.ts`'s own automatically-generated,
> no-presence device key — no enrollment, no opt-in, matching this
> deliverable's "zero UX cost" requirement exactly. Both have genuine live
> round-trips (real WebCrypto encrypt/decrypt, not mocked) in their test
> suites. Since `offline.ts` is plain browser IndexedDB code with no
> OPFS/native dependency, the same shipped code should also cover the
> `offline-first` tier inside a Capacitor WebView (`sovereign-mobile`'s "same
> PWA, unchanged" shell model) — **stated as reasoning, not verified against
> a real Capacitor build**. **What the round-trips do _not_ verify:** real
> browser OPFS behavior for `device-only-kv.ts` (its test suite's OPFS fake
> is necessary — Node has no OPFS — but doesn't prove a real browser's File
> System Access API behaves identically). **Not done at all:** native
> SQLite/SQLCipher encryption (task 20.13, itself still 🚧 — see
> `docs/epics/mobile.md`); neither web module is the real relational engine
> RFC 0093 §1 specs for `device-only` (`wa-sqlite`) — `device-only-kv.ts` is
> key/value only, no queries or joins. See RFC 0093 §1's own "Interim web
> primitive" note. `offline.set` also now requires JSON-serializable values
> (see `docs/upgrade.md`'s 1.41.0 → 1.42.0 entry) — a documented narrowing,
> not a silent one. The remaining relational-engine and encryption work is
> now planned, not just noted here — see
> [workstream 0008](../workstreams/0008-offline-first-architecture.md)'s
> legs 6–8.

**Goal:** Encrypt offline data on the device in **both** offline tiers, so
"plaintext on disk" is never the answer anywhere. The tiers differ in what guards
the key, not in whether encryption exists.

**Deliverables:**

- `offline-first`: encrypted under a device key with **no** user-presence
  requirement — Keychain/Keystore without biometric gating, or a non-extractable
  `CryptoKey`. Zero UX cost; protects against other apps and casual filesystem
  access.
- `device-only`: encrypted under the user-presence key from task 1.22.
- Applied across every backend from task 3.37, including native SQLite, where
  `@capacitor-community/sqlite` provides SQLCipher — the work there is key
  custody and unlock UX, not cryptography.
- A documented statement in `docs/plugin-development.md` of what each tier
  guarantees, so an author does not assume `offline-first` data is protected
  against device access when it is not.
- Explicit note that a non-extractable `CryptoKey` protects against key
  exfiltration by script but **not** against someone with the device — it unlocks
  automatically for the origin. Do not let this be mistaken for device-level
  protection.

**Dependencies:** Tasks 3.37, 1.22.

**Constraints:** This subsystem's standing rule applies — encryption surfaces in
this repo have repeatedly looked more finished than they were. RFC 0071 needed
three hardening passes including a production incident
(`docs/incidents/2026-07-24-rfc-0071-encryption-rollout.md`). Require a live
round-trip against real data before considering this done.

**SRS reference:** §3.11, §5.2.

**Review checklist:**

- On-disk data is ciphertext in both tiers, verified by inspecting storage
  directly rather than through the app.
- A `device-only` store is unreadable while locked.
- Live round-trip: write → lock → unlock → read, on a real device.
- `pnpm format:check && pnpm lint && pnpm typecheck && pnpm test`

#### 🚧 8.21 — Escrow and recovery for `device-only` data (Research 0012)

> **Partial — Layers 1 and 2 done, Layer 3 is not.** The mandatory warning
> (`DeviceStorageKeySection.tsx`'s setup flow, both steps) now states
> permanent, unrecoverable loss as the tier's defining property, per RFC
> 0093 §4's exact language — not just "isn't synced or backed up anywhere."
> `device-only-export.ts`'s `exportDeviceOnlyData`/`importDeviceOnlyData`
> implement the always-available, no-toggle, no-server encrypted export/import
> Layer 2 calls for — a genuine, tested round-trip (real WebCrypto AES-GCM/
> PBKDF2, wrong-passphrase rejection, cross-"device" re-encryption) against
> `device-only-kv.ts` — so Layer 1's warning is now backed by an actual
> mitigation a user can act on, not just an accurate statement of risk.
> Account → Security's "Export data"/"Import data" controls
> (`DeviceStorageKeySection.tsx`) now call those functions directly — a user
> can actually reach Layer 2, not just a plugin author. **Not done:** the
> opt-in encrypted server backup cascade (Layer 3 — `.env` → Console →
> per-plugin per-user gates) — now planned as
> [workstream 0008](../workstreams/0008-offline-first-architecture.md)'s
> leg 10.

**Goal:** Implement what RFC 0093 decided happens to `device-only` data when
the key dies — because with no server copy, a hardware-bound key that is
invalidated takes the data with it.

**Resolved — see [RFC 0093](../rfcs/0093-device-only-storage-and-key-custody.md)
(Accepted, August 2026).** Research 0012 deliberately made no recommendation;
the three options and their costs were in its "Open questions" section. The
decision: all three, layered — mandatory warning, always-available encrypted
user export, and opt-in encrypted server backup gated by an `.env` → Console
→ per-plugin per-user opt-in cascade. This task's remaining work is
implementing that design (Account UX, the toggle cascade, wiring RFC 0060's
existing wrap/recovery machinery), not deciding it.

**Why the key dies:** deleting a passkey destroys its PRF secret; an OS-level
credential change can invalidate a Keychain/Keystore item; a lost or wiped
device takes the key with it regardless. For `offline-first` this is
harmless — re-sync. For `device-only`, RFC 0093 §3 gives a second, independent
recovery wrapper that survives the first two cases without touching escrow
at all — this task's escrow layer is specifically for the third: the device
itself gone.

**Deliverables — per RFC 0093 §4, all three, layered:**

- **Mandatory warning (Layer 1):** explicit in-product warning shown once,
  when the user sets up their Device Storage Key in Account → Security (task
  1.22) — not per-plugin — and in `docs/plugin-development.md`: what
  device-only means, that losing the device with no recovery secret saved
  is permanent, unrecoverable loss.
- **User-driven export (Layer 2), always available, no toggle:** an
  encrypted (never plaintext) export/import path. No server involvement.
- **Encrypted server backup (Layer 3), opt-in:** server stores ciphertext of
  the recovery-wrapped key, never the key or recovery secret in the clear —
  reuses RFC 0060's existing wrap/recovery-secret machinery rather than a
  parallel system. Gated by a three-layer cascade: `.env` flag (hard kill
  switch) → Console toggle (`platform:owner`/`platform:admin`) → per-plugin
  per-user opt-in. With no env flag set, an instance behaves as Layer 1+2
  only.

This also answers device-to-device migration — migration and key-invalidation
recovery are the same problem, and Layer 2's export covers it directly.

**Also settled here, per RFC 0093 §5 and §7:** key strictness is **not**
manifest-declared per plugin — one platform-wide, `userPresence`-equivalent
setting (biometric **or** device passcode; biometric-only was considered and
rejected on accessibility grounds). Server-side revocation does **not** reach
`device-only` data, on either platform, by design — the server never holds a
usable key. Correct for a sovereignty product, but a real departure from the
sign-out purge's usual assumption; document it in `docs/architecture-rules.md`
as a stated exception once implemented.

**Dependencies:** Task 8.20. Gates task 1.22.

**SRS reference:** §5.2.

**Review checklist:**

- The chosen option is implemented and documented.
- Setting up the Device Storage Key (Account → Security, task 1.22) tells the user
  what happens if they lose the device, before any `device-only` plugin
  commits data under it.
- The revocation position is written down where an operator will find it.
- `pnpm format:check && pnpm lint && pnpm typecheck && pnpm test`

---

#### ✅ 8.22 — Platform-wide dialect consolidation (workstream 0009 leg 1)

**Goal:** Make the operator's `DB_DIALECT`/`DATABASE_URL` choice
(`packages/db/src/dialect.ts:20`) the single source of truth for every
database the platform opens — platform, auth, and every plugin — by removing
the per-plugin override that exists today only to force SQLite on a
Postgres-dialect instance. No shipped or example plugin manifest uses it.

**Deliverables:**

- Remove `dialect: z.enum(['sqlite']).optional()` from `manifestDatabaseSchema`
  (`packages/manifest/src/schema.ts:55`) and the `manifestDatabaseDialect()`
  helper.
- Remove the refinement pairing `database.requireEncryption` with
  `database.dialect` (`schema.ts:656-669`) — it exists only to resolve the
  ambiguity a per-plugin override created. The other `requireEncryption`
  refinement, requiring `isolation: "isolated"` (`schema.ts:641-654`), is
  unaffected and stays.
- Simplify `resolvePluginDialect()` (`packages/db/src/plugin-client.ts:31`) to
  always resolve to the platform's dialect; delete the
  plugin-forces-sqlite-on-postgres branch and its cross-dialect error.
- `docs/plugin-development.md` manifest reference updated to drop the
  `dialect` field; the docs-parity test
  (`runtime/src/__tests__/docs-parity.test.ts`) stays green.

**Dependencies:** None. Independent of Task 0.20.

**SRS reference:** none — a manifest/db-package simplification, not a new
capability.

**Review checklist:**

- Before deleting, grep every plugin manifest in the working tree — including
  any `.local` plugin present at review time, not only the 12 in-repo plugins
  checked during design — for `"dialect"` and confirm zero live users.
- `pnpm typecheck` and `packages/manifest`'s test suite pass with the field
  gone.
- An instance with `DB_DIALECT=postgres` provisions every plugin — including
  any that previously could have forced `sqlite` — onto Postgres without
  error.

---

#### ✅ 8.23 — `packages/db` libSQL driver adoption (workstream 0009 leg 3)

**Goal:** Replace the direct `better-sqlite3`/`better-sqlite3-multiple-ciphers`
file access in `packages/db`'s SQLite path with a client that talks to the
`sqld` container from Task 0.20, for the platform DB, `apps/auth`'s DB, and
every isolated plugin DB — per the RFC 0091 encryption carve-out: databases
RFC 0071 would encrypt stay on plain-file SQLite+SQLCipher; everything else
moves to `sqld`, mandatorily.

**Delivered (PR #367):**

- `packages/db/src/sqld.ts` (new) — `sqld` client + per-namespace isolation
  (`x-namespace` header) + namespace provisioning/drop via the admin API.
- `client.ts`/`plugin-client.ts` route the platform/auth core and every
  isolated plugin store to `sqld` unless the carve-out applies
  (`SOVEREIGN_DB_ENCRYPTION_KEY` set for the core, `requireEncryption: true`
  in the manifest for a plugin). `:memory:` is explicitly excluded — no sqld
  equivalent exists for ephemeral per-process test storage.
  `checkEncryptionMarker` always runs before the carve-out decision so a
  misconfigured "key was removed" state still fails loudly.
- `migrate.ts` picks `drizzle-orm/libsql`'s async migrator over
  `better-sqlite3`'s sync one via an `isLibsqlDb()` runtime guard.
- `exec.ts`/`platform-db.ts` — the 9 async-contract call sites RFC 0091
  enumerated (7 in `platform-db.ts`, 2 in `scripts/seed.ts`), all converted.
- `apps/auth/src/db.ts`/`migrate.ts` — the same carve-out via better-auth's
  Kysely dialect adapter, independently implemented (auth must not depend on
  `@sovereignfs/db`). Namespaces don't auto-vivify (verified live), so
  `runAuthMigrations()` explicitly provisions the "auth" namespace first.
- `runtime/next.config.ts` + `apps/auth/next.config.ts` — aliased the native
  `libsql` package out of Webpack's server graph (same treatment as the
  existing `better-sqlite3` alias); it's only ever exercised for `file:`-scheme
  URLs, which this codebase never uses.
- `docker-compose.sqld.yml` — `--enable-namespaces` + a separate admin
  listener, wired to both `runtime` and `auth` with a healthcheck gate.

**Known, documented gap (not solved by this task):** enabling encryption on an
instance that has been running unencrypted (and therefore on `sqld`) has no
migration tooling yet — `sv db encrypt` only converts an existing plain file.
Documented in `packages/db/src/client.ts` and `docs/self-hosting.md`.

**Dependencies:** Task 0.20 (blocked on its RFC), Task 8.22 (dialect
consolidation landed first so this didn't need to reconcile with a per-plugin
override mid-migration).

**SRS reference:** none yet — see RFC 0091.

**Review checklist:**

- `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm build`, `pnpm test`
  all pass (163/163 test files, 1441 passed).
- Empirically verified against a live `sqld --enable-namespaces` container:
  healthcheck, admin API, namespace create/drop idempotency, `x-namespace`
  isolation.
- **Not yet done, deliberately deferred to Task 8.24:** a live encrypted
  round-trip against real production-shaped data on the new setup — this task
  changed the routing/driver layer only; Task 8.24 is where the single
  production instance's actual data crosses onto it.

---

#### ✅ 8.24 — One-time SQLite → libSQL data cutover (workstream 0009 leg 4)

**Goal:** Migrate the single production instance's existing SQLite files
(`sovereign.db`, `auth.db`, and every isolated plugin `.db`) onto the
`sqld`-backed setup from Task 8.23, as a one-time cutover — not a phased or
dual-write migration, since only one production instance exists today.

**Delivered:**

- `sv db migrate-to-sqld` (`bin/sv.ts`, backed by `packages/db/src/sqld-cutover.ts`):
  determines every plain-file SQLite database leg 3's routing would send to
  sqld (ground truth is each file's own on-disk encryption marker plus its
  current manifest/env state, not a snapshot of history — this also
  correctly skips a plaintext file that's _supposed_ to be encrypted but
  hasn't been converted yet with `sv db encrypt`, rather than migrating it to
  the wrong place), takes an automatic pre-cutover backup, and copies each
  target's schema + every row into its sqld namespace as one atomic
  `client.migrate()` transaction — either the whole file lands or none of it
  does. Refuses to write into an already-populated destination (a one-time
  cutover, not incremental sync), so a partial failure is always safe to
  diagnose and retry.
- `--dry-run` previews exactly what would move (files, tables, row counts)
  without touching sqld or taking a backup.
- A documented, backup-first runbook in `docs/self-hosting.md`'s sqld section
  covering the full sequence: stop the server, back up, dry-run preview,
  bring up sqld, run the cutover, verify, restart against sqld.
- `packages/db/src/__tests__/sqld-cutover.test.ts`: unit tests against a real
  SQLite-backed `Client` test double (schema/FK/row/BLOB fidelity, non-empty
  destination refusal, empty-source refusal, exclusive-access contention).

**Verification against real data (not synthetic fixtures alone):** the tool
was run live against an isolated `sqld --enable-namespaces` container with
representative platform/auth/plugin fixture databases — full cutover
end-to-end (provisioning, atomic copy, row-count verification, cross-namespace
isolation), the non-empty-destination refusal on retry, and every branch of
the target-discovery logic (core included when the encryption key is unset,
excluded when it's set; a plugin included when its manifest omits
`requireEncryption`, excluded when it's declared; a core/plugin file already
marked encrypted always excluded) — each verified against the actual CLI
command, not a mock.

**The real production cutover doesn't apply — resolved, not performed.**
Rehearsing this tool against a copy of the real production instance's data
(the starting point for Task 8.25) found that instance's platform dialect is
already **Postgres**, not SQLite — it has no plain-file SQLite databases at
all for `sv db migrate-to-sqld` to cut over, and never will while it stays on
Postgres. This is not a gap: the tool and runbook are correct and complete,
verified live against representative fixture data (see above); they were
simply never the right fit for the production instance that actually exists,
only for a hypothetical future SQLite-dialect deployment. See
`docs/workstreams/0009-database-dialect-and-libsql-migration.md`'s changelog
(0.4) for the full closing note.

The rehearsal did surface a real, different problem on that instance — 6
plugins stranded on pre-task-8.22 per-plugin SQLite overrides on an
otherwise-Postgres platform — which Task 8.25 built `sv db
migrate-to-postgres` to fix instead.

**Dependencies:** Task 8.23.

**SRS reference:** none yet — see RFC 0091.

**Review checklist:**

- `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test` all pass.
- The tool is verified live against representative fixture data — done; see
  above. A rehearsal against a copy of real production data was run and
  found no applicable target (see above) — not a failed check, a correct
  "nothing to migrate here" outcome.
- The pre-cutover backup mechanism and non-empty-destination refusal are
  covered by tests — done.

---

#### ✅ 8.25 — Legacy per-plugin SQLite → Postgres migration tool

**Goal:** Migrate an isolated plugin's data off a legacy plain-file SQLite
database — left behind by a per-plugin `database.dialect: "sqlite"` manifest
override from before Task 8.22 removed that field — into its proper Postgres
schema, on an instance whose platform dialect is already Postgres. Discovered
while preparing to rehearse Task 8.24's cutover against a real production
instance: that instance's platform core and auth database had already been
migrated to Postgres, but 6 plugins were still actively writing to per-plugin
SQLite files, invisible to `DB_DIALECT` (it only ever governed the platform;
`apps/auth`'s own dialect is independently inferred from
`AUTH_DATABASE_URL`'s scheme, and per-plugin isolation was, before Task 8.22,
independently overridable too). Left unmigrated, upgrading that instance past
Task 8.22 would silently orphan these plugins' real data: `getPluginDb()`
would start each one against a fresh, empty Postgres schema instead of
erroring, since the override that used to force them onto SQLite no longer
exists to stop it.

Not part of workstream 0009 (that workstream's `sqld` migration is for
SQLite-_dialect_ deployments; this instance's platform dialect is already
Postgres) — a standalone tool for the general shape of this problem, since
any instance that mixed per-plugin SQLite overrides with a Postgres platform
before Task 8.22 shipped can hit it.

**Delivered:**

- `sv db migrate-to-postgres [pluginId]` (`bin/sv.ts`, backed by
  `packages/db/src/postgres-migration.ts`): for each isolated plugin with a
  pending `data/plugins/<id>.db` file (or a single named one), runs the
  plugin's own Postgres migrations against its `plugin_<slug>` schema first
  (`provisionPluginDb` + `runPluginMigrations` — the same mechanism the
  running app itself uses, so the destination shape always matches what the
  app expects), then copies every row, matched by column name, from the
  SQLite source into the now-provisioned Postgres tables as one atomic
  transaction. Unlike `sv db migrate-to-sqld`, this does **not** copy SQLite
  `CREATE TABLE` DDL verbatim — SQLite and Postgres DDL aren't transferable
  (no `AUTOINCREMENT` in Postgres, different type keywords) — the destination
  schema must already exist in its real, dialect-native shape.
- Column-level type coercion (`coerceForPostgres`) based on the destination's
  _actual_ Postgres column type, not an assumption that every plugin follows
  this codebase's own convention of storing booleans/timestamps as plain
  integers on both dialects (verified true for every already-Postgres-migrated
  plugin checked, but not guaranteed for an arbitrary third-party schema —
  `plugin_status.enabled` on the platform's own schema is a real `boolean`
  column, proof the convention isn't universal): `boolean` columns coerce a
  SQLite 0/1 integer to a real JS boolean, `timestamp`/`timestamptz` columns
  coerce a SQLite epoch-seconds integer to a `Date`, `bytea` columns coerce a
  SQLite BLOB to a `Buffer` — everything else passes through unchanged.
- Refuses (not silent) on: a destination table missing entirely (migrations
  weren't run), a destination table already holding rows (one-time migration,
  not incremental sync — a partial failure must be diagnosed and retried
  clean, not resumed into), or a source column absent from the destination
  (would silently drop data). A destination column absent from the source is
  fine — left at its default/NULL.
- Reuses the RFC 0071 `openKeyedSqlite` chokepoint for an encrypted source
  file, keyed the same way every other tool in this codebase resolves
  `SOVEREIGN_DB_ENCRYPTION_KEY` — 5 of the 6 stranded plugins on the
  triggering production instance were RFC 0071 encrypted.
- `--dry-run` previews table/row counts from the SQLite source only, without
  touching Postgres.
- The original SQLite file is never written to — left completely untouched
  whether the migration succeeds or fails, so a failed attempt costs nothing
  to retry.
- A documented runbook section in `docs/self-hosting.md`.
- `packages/db/src/__tests__/postgres-migration.pg.test.ts`: live-Postgres
  tests (same `TEST_DATABASE_URL` gate as `postgres.pg.test.ts`) covering
  boolean/timestamp/bytea coercion, encrypted-source open (right key
  succeeds, wrong key refuses), non-empty-destination refusal, missing-table
  and missing-column refusal, a destination-only extra column left at its
  default, exclusive-access contention, mid-transaction rollback (a later
  table's constraint violation rolls back an earlier table's already-copied
  rows in the same transaction), and that the original file is provably
  unmodified after a successful run.

**Run against the real production instance:** `plainwrite` and `shopper`
migrated successfully — every table's row count verified matching both by
the tool's own post-copy check and independently via `psql`, and the
original SQLite files confirmed untouched. `docs`, `healthlog`, `sheets`
were dropped from this instance's plugin set before the run (never had
Postgres migrations authored, same conclusion as when this task was
scoped). `wallet` was migrated in a follow-up pass once it gained Postgres
migrations of its own — see Task 8.27, which also covers the two further
bugs that run surfaced.

The real run also surfaced a genuine bug in `runPluginMigrations()` itself
(pre-existing, not introduced by this task) — see Task 8.26.

**Dependencies:** Task 8.22 (the override this cleans up after only exists on
pre-8.22 deployments).

**SRS reference:** none — a data-migration tool, not a new capability.

**Review checklist:**

- `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm build`,
  `TEST_DATABASE_URL=... pnpm test` all pass.
- Run live against a copy of the triggering production instance's real data
  before running it against the actual instance — done; see above.
- Post-migration, each plugin's data is verifiably intact (row counts, spot
  checks) against the pre-migration backup, and the original SQLite files are
  confirmed byte-for-byte untouched — done; see above.

---

#### ✅ 8.26 — Fix isolated-Postgres plugin migration-table collision

**Goal:** Fix a pre-existing bug surfaced while running Task 8.25's migration
tool against real production data: `plainwrite` and `shopper`'s Postgres
schemas were provisioned successfully, their migrations folders genuinely
existed with valid SQL, yet no tables were ever created — `sv plugin
migrate` reported "up to date" for each, meaning drizzle's migrator believed
the migrations had already run.

**Root cause:** drizzle-orm's node-postgres migrator tracks applied
migrations in a table living in a **fixed `drizzle` schema**, regardless of
the connecting pool's `search_path`. Every isolated-mode Postgres plugin left
on the untouched default table name (`__drizzle_migrations`) therefore shares
that one table across every plugin. `com.mooniak.tritext` (the only isolated
Postgres plugin that existed before this task) had already populated it with
entries carrying timestamps later than plainwrite/shopper's own migration
timestamps — so their migrators compared their own (older) pending migrations
against tritext's newest row, concluded "already applied", and silently
skipped every `CREATE TABLE` statement. No error, no warning: the schema
existed, empty, indistinguishable from a successful no-op migration. This is
the identical hazard `pluginMigrationsTableName()` already existed to prevent
for **shared**-mode plugins (writing into the platform DB) — never extended
to isolated-mode Postgres, because until Task 8.25's migration there was only
ever one isolated Postgres plugin, so the collision was latent, not yet
possible.

**Delivered:**

- `pluginMigrationsTableName(id)` now passed as the `migrationsTable` at all
  three call sites that run isolated-plugin Postgres migrations:
  `runtime/src/plugin-migrations.ts` (the real startup path — every
  production instance's actual migration flow), and both `bin/sv.ts`
  commands (`sv plugin migrate`, `sv db migrate-to-postgres`).
  Deliberately **scoped to `pluginDb.dialect === 'postgres'` only** — isolated
  SQLite plugins are unaffected (a genuinely separate file per plugin has no
  collision risk) and must keep the untouched default name; every existing
  SQLite-isolated plugin already has real migration history under it, and
  changing that now would orphan it, not fix anything.
- `packages/db/src/__tests__/migrate.pg.test.ts` (live Postgres): reproduces
  the exact incident (two isolated plugins, deliberately ordered timestamps
  matching tritext-then-plainwrite, confirms the second plugin's table is
  never created without the fix) and confirms the fix (same setup, with
  `pluginMigrationsTableName()` passed, both plugins' tables created
  independently).
- Verified against the real production instance in the same session the bug
  was found: after this fix, `plainwrite` and `shopper` migrated correctly
  (see Task 8.25).

**Dependencies:** Task 8.25 (found while running its migration against real
data).

**SRS reference:** none — a bug fix, not a new capability.

**Review checklist:**

- `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm build`,
  `TEST_DATABASE_URL=... pnpm test` all pass.
- `migrate.pg.test.ts`'s first test reproduces the incident (proves the bug
  is real, not assumed); its second test proves the fix.
- Isolated SQLite plugins are unaffected — the fix is dialect-scoped, not a
  blanket change to `runPluginMigrations()`'s default behavior.

---

#### ✅ 8.27 — Wallet Postgres migration: FK ordering and `tools` compose gaps

**Goal:** Give `wallet` (the one plugin Task 8.25 left on SQLite) Postgres
migrations of its own, migrate its real production data, and fix the two
further bugs that surfaced doing so — none caused by this task, all
pre-existing and newly exposed because `wallet` was the first isolated
Postgres plugin with a foreign key between two of its own tables, and the
first time `sv db migrate-to-postgres` was ever run through the `tools`
Compose profile against a live Postgres deployment.

**What was added:**

- `sovereign-plugin-wallet`: `db/schema.postgres.ts` mirroring
  `app/_db/schema.ts`'s `wallet_items`/`wallet_card_payloads` tables (plain
  `integer`, never native `boolean`, per `docs/plugin-database.md`), plus
  generated `migrations/postgres/`. Shipped as `v0.3.0`, then `v0.3.1` fixing
  the FK bug below.

**Bug 1 — generated FK hardcoded the `public` schema qualifier.**
`drizzle-kit generate --dialect postgresql` always qualifies a generated
`FOREIGN KEY`'s target table with the schema the `pgTable()` was declared
in, which defaults to `public` since no plugin schema file declares an
explicit `pgSchema()`. An isolated plugin's tables never live in `public` —
they live in `plugin_<slug>`, reached only via the pool's `search_path` — so
the generated `ALTER TABLE ... REFERENCES "public"."wallet_items"` failed on
first boot with `relation "public.wallet_items" does not exist`. Because
Drizzle wraps each migration file in one transaction, the failure rolled
back the whole file, including both `CREATE TABLE`s — no partial state, but
no tables either; `runAllPluginMigrations`'s per-plugin try/catch (Task
8.26) correctly contained the failure to `wallet` alone. Fixed by hand-
stripping the schema qualifier down to an unqualified `REFERENCES
"wallet_items"(...)`, which resolves correctly through `search_path`.
Documented in `docs/plugin-database.md` under "Foreign keys in an isolated
Postgres schema" — the generator has no isolated-schema awareness and will
re-add the qualifier on every future regeneration.

**Bug 2 — `migratePluginSqliteToPostgres` copied tables in plain alphabetical
order.** `listSqliteTables()` (`packages/db/src/postgres-migration.ts`)
orders tables with `ORDER BY name`, with no awareness of foreign-key
dependency. `wallet_card_payloads` sorts before `wallet_items` alphabetically
but references it — the first real attempt at the data copy failed with
`insert or update on table "wallet_card_payloads" violates foreign key
constraint`. `plainwrite`/`shopper` never hit this because neither has a
foreign key between its own tables; `wallet` is the first migrated plugin
that does. Fixed by adding `orderTablesByDependency()`, which reads the
actual FK graph among the tables being migrated from the destination
schema's own `information_schema` (topological sort, alphabetical order
preserved as the tie-break for tables with no FK relationship, so the
existing rollback test's ordering assumption still holds) and orders the
copy loop by it instead of by name. Covered by a new regression test
reproducing the exact `wallet_card_payloads` → `wallet_items` case.

**Bug 3 — the `tools` Compose profile was never wired for a Postgres
deployment.** Two separate gaps, both pre-existing since
`docker-compose.postgres.yml` was first authored, neither previously
exercised because this was the first time `tools` ran against a live
Postgres instance:

- `docker-compose.postgres.yml` overlays `runtime`/`auth` with the real
  `DB_DIALECT`/`DATABASE_URL`/`AUTH_DATABASE_URL`, but never added a
  `tools:` override — so `tools` silently kept `docker-compose.prod.yml`'s
  SQLite-default `DATABASE_URL` and no `DB_DIALECT` at all, and any
  dialect-aware `sv` command resolved to `"sqlite"` and refused to run.
- `docker-compose.prod.yml`'s `tools` service never declared `networks:
[sovereign_net]` at all (unlike `runtime`/`auth`, which both do), so even
  with the dialect fixed it couldn't resolve the `postgres` hostname
  (`getaddrinfo EAI_AGAIN postgres`).

Fixed by adding a `tools:` block to `docker-compose.postgres.yml` (mirroring
`runtime`'s override) and a `networks: [sovereign_net]` line to
`docker-compose.prod.yml`'s `tools` service.

**Run against the real production instance:** `wallet` migrated
successfully once both bugs above were fixed — `wallet_items: 2 → 2`,
`wallet_card_payloads: 2 → 2`, verified independently via `psql`, foreign
key intact, original SQLite file confirmed untouched. All three
`sovereign.plugins.json`-declared data plugins (`plainwrite`, `shopper`,
`wallet`) are now fully on Postgres.

**Dependencies:** Task 8.25 (this task's tool), Task 8.26 (the migration-
table-collision fix that kept `wallet`'s first, failing migration attempt
from taking any other plugin down with it).

**SRS reference:** none — bug fixes and one plugin's migration, not a new
capability.

**Review checklist:**

- `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm build`,
  `TEST_DATABASE_URL=... pnpm test` all pass.
- `postgres-migration.pg.test.ts`'s new test reproduces the FK-ordering bug
  and proves the fix; all existing tests in the file still pass unchanged,
  including the alphabetical-order rollback test (no FK edges there, so the
  topological sort's tie-break preserves it).
- Run live against the real production instance — done; see above.

---

#### ✅ 8.28 — Retire the `database.isolation`/`"shared"` manifest option

**Goal:** Every `sovereign`/`community` plugin's database is unconditionally
isolated — its own dedicated SQLite file/namespace or Postgres schema. Retire
the `shared` manifest option entirely rather than leave it as an
increasingly-unused, increasingly-risky choice.

**Why now:** tasks 8.26 and 8.27 found three distinct, previously-latent bugs
in quick succession, all specific to isolated-mode plugins on Postgres. That
prompted a closer look at what `shared` mode actually buys a real plugin
author: checking every plugin actually installed anywhere in this repo or
its known external repos found `shared` used by exactly three plugins —
`account`, `console`, `launcher` (`type: "platform"`) — and every real,
user-facing plugin (`tasks`, `plainwrite`, `shopper`, `wallet`) already
`isolated`. The three `shared` holdouts turned out not to be genuine
`shared`-mode consumers at all: Console owns no tables of its own at all (it
reads/writes existing platform tables like `users`/`plugin_status` directly
through `@sovereignfs/db`, bypassing `sdk.db.getClient()` entirely — already
true before this task); Account's `account_prefs` table is defined in the
platform's own schema file, not a plugin-owned one; Launcher has no database
code at all. None of the three ever participated in the shared/isolated
choice in the way a real third-party plugin would — they administer the
platform's own core data, architecturally closer to `apps/auth` (which was
never a "plugin" with a manifest `database` field to begin with) than to a
`sovereign`/`community` plugin.

**Delivered:**

- `packages/manifest/src/schema.ts`: `manifestDatabaseSchema` narrowed to
  `{ requireEncryption?: boolean }` — the `z.enum(['shared', 'isolated'])`
  shorthand and the `isolation` field are both gone; an existing manifest
  declaring either fails validation (`.strict()`), the same enforcement
  shape task 8.22 used to retire `database.dialect`.
- `manifestDatabaseIsolation()` repurposed: it now derives isolation from
  `manifest.type` (`type === 'platform' ? 'shared' : 'isolated'`) instead of
  a `database.isolation` sub-field. Every call site
  (`runtime/src/plugin-migrations.ts`, `runtime/src/sdk-host.ts`,
  `runtime/src/user-deletion.ts`, three sites in `bin/sv.ts`) now passes
  `.type` instead of `.database`. The function's output type and the
  two-branch control flow at every call site are otherwise unchanged — this
  keeps `type: "platform"` plugins on exactly their current code path (the
  platform DB), which matters because none of the three ever exercises it
  today (no `migrations/` folder), so the change is a no-op for them in
  practice, not just in theory.
- The `requireEncryption` validation refinement recast around `type` instead
  of `isolation`: not valid for `type: "platform"` (no isolated store to
  encrypt), valid for everything else unconditionally (previously
  conditional on `isolation: "isolated"` being separately declared, which is
  now automatic).
- `docs/plugin-development.md` and `docs/plugin-database.md`: substantial
  rewrite — the "Choosing a mode" decision and the `shared` walkthrough are
  gone; the isolated-mode walkthrough is now simply "the" database section;
  a new "Platform-type plugins" section explains the `account`/`console`/
  `launcher` exemption for contributors who touch those three specifically.
  `docs/workstreams/0009-database-dialect-and-libsql-migration.md`'s own
  "Isolation-mode default: Unchanged" decision is marked superseded with a
  pointer back here, rather than left silently contradicted.
- `packages/sdk/src/db.ts`'s `getClient()` doc comment updated to match —
  the SDK function itself needed no code change, only the description of
  what it now always does.

**Not yet done, deliberately out of scope:** migrating the manifests of
already-`isolated` external plugins (`tasks`, `plainwrite`, `shopper`,
`wallet`, and any others) that still declare
`"database": { "isolation": "isolated" }` — a shape this task's `.strict()`
schema now rejects outright, identical in kind to task 8.22's `dialect`
field removal needing the same six repos patched after the fact. Each
external plugin repo needs its manifest's `isolation` key removed, a patch
version bump, and a retag before this platform change can safely ship to
the production instance — otherwise the next `pnpm install:plugins`/build
against these plugins fails validation. Left for a follow-up pass once this
PR is merged, mirroring how the `dialect` field cleanup was sequenced.

**Dependencies:** Tasks 8.26, 8.27 (the bug pattern that prompted this).

**SRS reference:** none — a manifest-schema simplification, not a new
capability.

**Review checklist:**

- `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test` all pass.
- `packages/manifest`'s test suite covers: the legacy string/object
  `isolation` forms are rejected; `manifestDatabaseIsolation()` derives
  correctly from every `type` value; `requireEncryption` is accepted on a
  non-platform plugin and rejected on `type: "platform"`.
- `runtime/src/__tests__/plugin-migrations.test.ts` passes unchanged — its
  mocked registry entries have no `type` field, which resolves to
  `"isolated"` under the new function exactly as they did under the old
  manifest-declared one, confirming the change is behavior-preserving for
  every currently-real plugin.
- Follow-up (external repos) tracked separately, not blocking this PR — see
  "Not yet done" above.

---

#### ✅ 8.29 — `sv plugin migrate-to-isolated` (shared → isolated data migration)

**Goal:** A migration tool for the one real gap task 8.28 found: unlike
`plainwrite`/`shopper`/`wallet` (already `isolated`, just needed a stale
`isolation` key removed), `sovereign-plugin-tasks` was genuinely
`database: "shared"` — its tables (`tasks_lists`, `tasks_items`, `tasks_views`,
`tasks_user_list_prefs`, `tasks_notification_prefs`) live inside the platform's
own database. Task 8.28's schema change rejects `"shared"` outright, so simply
editing `tasks`'s manifest without first moving its data would orphan every
real user's task lists the moment the runtime provisions a fresh, empty
isolated schema for it — the exact failure shape task 8.27 hit with `wallet`,
here for the platform's default, most-used plugin.

**Delivered:**

- `sv plugin migrate-to-isolated <id>` (`bin/sv.ts`, backed by
  `packages/db/src/plugin-isolation-migration.ts`): discovers a plugin's real
  table list by parsing `CREATE TABLE` statements out of its own
  `migrations/<dialect>/*.sql` files (`discoverPluginTables()`) rather than
  deriving it from a slug-prefix convention — plugin authors choose their own,
  often shorter table prefix (`tasks_*`, not `fs_sovereign_tasks_*`), so the
  convention can't be trusted to enumerate tables reliably. Same-dialect
  throughout (SQLite-shared → SQLite-isolated, or Postgres-shared →
  Postgres-isolated) — unlike task 8.25's tool, there is no cross-dialect type
  coercion to do, since source and destination tables are created by the
  identical migration SQL.
- Copies every row of every discovered table from the platform's own
  connection into the plugin's freshly-provisioned isolated store
  (`provisionPluginDb` + `runPluginMigrations`, the same mechanism the
  running app itself uses) inside one destination-side transaction — either
  everything lands or nothing does. Uses Drizzle's `.transaction()`, not a
  hand-rolled `BEGIN`/`COMMIT` over `dbRun` calls: the destination's Postgres
  connection is a `Pool`, and separate `.execute()` calls can each be handed a
  different pooled connection, so a manual `BEGIN … COMMIT` sequence would not
  actually run on one connection. Refuses if any destination table already
  has rows (one-time migration, not incremental sync). The platform source is
  never modified — dropping the original `shared`-mode tables afterward is a
  deliberate, separate, manual step.
- `--dry-run` (`previewPluginTables()`) previews row counts without touching
  anything. `--skip-backup` on a SQLite platform skips the automatic `data/`
  archive (mirroring task 8.25's flag); on Postgres, where this CLI has no
  automated backup capability yet (task 8.16, still not built), the flag is
  **required** to proceed at all — the command refuses outright without it,
  printing the `pg_dump` command to run first, rather than silently skipping
  a backup step that doesn't exist.
- `packages/db/src/__tests__/plugin-isolation-migration.pg.test.ts`: live-Postgres
  tests (same `TEST_DATABASE_URL` gate as `postgres-migration.pg.test.ts`) —
  row copying, source-untouched verification, multi-table atomicity, non-empty-
  destination refusal, mid-transaction rollback, dialect-mismatch refusal —
  plus dialect-agnostic unit tests for `discoverPluginTables()` covering both
  quoting styles (SQLite backticks, Postgres double quotes), multi-file
  ordering, and de-duplication.
- Full CLI rehearsed end-to-end against a throwaway Postgres database (not
  just the underlying library function via tests): dry-run, real run, source
  left untouched, isolated destination correct, re-run correctly refused.

**Run against the real production instance:** dry-run first, then a real
`pg_dump` backup, then the real migration — `tasks_lists` (17),
`tasks_items` (264), `tasks_views` (17), `tasks_user_list_prefs` (17),
`tasks_notification_prefs` (2) all copied into `plugin_fs_sovereign_tasks`,
independently verified via direct `psql` queries against both source and
destination (row counts match; the platform's original shared tables are
untouched). This run is what surfaced Task 8.30's bug — see that task for the
fix.

**Not yet done — `sovereign-plugin-tasks`'s manifest update and redeploy.**
Removing `"database": "shared"` from its manifest, tagging a new release, and
redeploying with it composed into the runtime image is a follow-up operator
action; the production runtime currently still has `tasks`'s old manifest on
disk (data has moved, the manifest declaring where hasn't caught up yet).

**Dependencies:** Task 8.28 (the schema change that requires this).

**SRS reference:** none — transitional migration tooling, not a new
capability.

**Review checklist:**

- `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm build`,
  `TEST_DATABASE_URL=... pnpm test` all pass.
- Rehearsed against a copy of real production data before running against
  the actual instance.
- The pre-migration backup is confirmed restorable before the migration
  proceeds.
- Post-migration, `tasks`'s data is verifiably intact (row counts, spot
  checks) against the pre-migration backup, and the original platform-DB
  tables are confirmed unmodified, before `tasks`'s manifest is updated.

---

#### ✅ 8.30 — Fix shared→isolated transition migrations-table collision

**Goal:** Fix a bug surfaced while running Task 8.29's tool against real
production data for `fs.sovereign.tasks`: the isolated Postgres schema was
provisioned successfully but ended up with **zero tables**, no error — only
surfacing when the subsequent destination-emptiness check tried to
`SELECT count(*)` from a table that was never created.

**Root cause:** `provisionPluginDb` + `runPluginMigrations` (the same
provisioning call the running app itself uses) was passed
`pluginMigrationsTableName(pluginId)` as its `migrationsTable` — the same name
Task 8.26 already uses to keep every isolated-mode Postgres plugin's history
independent. But a plugin transitioning **out of** `shared` mode already has
real migration history recorded under that exact name: shared-mode migrations
always use `pluginMigrationsTableName()` too, to avoid colliding with the
platform's own `__drizzle_migrations`. `fs.sovereign.tasks` had two rows there
from years of real shared-mode operation. Drizzle's migrator compared the
brand-new isolated schema's pending migration against that stale row,
concluded "already applied", and silently skipped every `CREATE TABLE` — the
same failure shape as Task 8.26, but self-inflicted this time: the plugin's
own prior history collided with its own future history, not another plugin's.

**Delivered:**

- `sharedToIsolatedMigrationsTableName(pluginId)`
  (`packages/db/src/plugin-isolation-migration.ts`): returns
  `` `__drizzle_migrations_${pluginId}_shared_to_isolated` `` — a name
  guaranteed distinct from the plugin's prior shared-mode history, used only
  for this one-time transition's provisioning step. `bin/sv.ts`'s
  `pluginMigrateToIsolated` command now passes this instead of
  `pluginMigrationsTableName()` when provisioning the destination schema.
- `packages/db/src/__tests__/plugin-isolation-migration.pg.test.ts` (live
  Postgres): reproduces the exact incident (a plugin's prior history recorded
  under `pluginMigrationsTableName()`, then the same name reused for a fresh
  isolated schema — table never created) and confirms the fix (same setup,
  `sharedToIsolatedMigrationsTableName()` used instead — table created
  regardless of the other table's stale state).
- Verified against the real production instance in the same operational
  session the bug was found: after this fix, `fs.sovereign.tasks`'s isolated
  schema was correctly provisioned and its data migrated (see Task 8.29).

**Dependencies:** Task 8.29 (found while running its migration against real
data), Task 8.26 (the migrations-table-name convention this bug collided
with).

**SRS reference:** none — a bug fix, not a new capability.

**Review checklist:**

- `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm build`,
  `TEST_DATABASE_URL=... pnpm test` all pass.
- `plugin-isolation-migration.pg.test.ts`'s new pair of tests reproduces the
  incident (proves the bug is real, not assumed) and proves the fix.
- Isolated-mode Postgres plugins provisioned normally (not mid-transition)
  are unaffected — `pluginMigrationsTableName()` is untouched for that path;
  only the one-time transition command uses the new name.

---

#### ✅ 8.31 — Field-encryption key service (KEK→DEK envelope) (RFC 0092, workstream 0011 leg 1)

**Goal:** The key-management foundation for app-level field encryption: a master Key Encryption Key from the environment, per-(class × plugin) Data Encryption Keys and blind-index HMAC keys wrapped under it, and KEK rotation that re-wraps rather than re-encrypts.

**Deliverables:**

- `SOVEREIGN_FIELD_KEK` env var — 32 bytes, same encoding + fail-fast loader discipline as `SOVEREIGN_VAULT_KEY` (`runtime/src/secrets.ts`), no default. Required iff `SOVEREIGN_ENCRYPT_CLASSES` is non-empty; boot fails loudly on policy-without-key. Deliberately distinct from `SOVEREIGN_VAULT_KEY` (different blast radius and rotation cadence — see RFC 0092 Alternatives).
- Platform table for wrapped keys: one DEK and one HMAC blind-index key per (sensitivity class × plugin), generated on first use, wrapped under the KEK. Migration in both dialects.
- Key service module (runtime): resolve/unwrap/cache DEKs, expose to the sdk-host layer only — never to plugin code.
- `sv keys rotate-field-kek` — re-wraps every stored DEK/HMAC key under a new KEK without touching row data.
- `.env.example` + `docs/self-hosting.md` + docs-parity for both new env vars; `docker-compose.prod.yml` pass-through.

**Dependencies:** RFC 0092 acceptance including taxonomy sign-off (workstream 0011 gate A).

**SRS reference:** [RFC 0092](../rfcs/0092-app-level-field-encryption.md), RFC 0008 (Tier 2 key-management lineage), SRS §3.17, NFR-02/07/08.

**Review checklist:**

- Boot with `SOVEREIGN_ENCRYPT_CLASSES` set but `SOVEREIGN_FIELD_KEK` unset fails with a message naming both vars; malformed key fails fast; both-unset boots exactly as today.
- `sv keys rotate-field-kek` on a populated instance leaves every field decryptable and completes without reading a single data row.
- The wrapped-keys table round-trips on both dialects; DEKs never appear unwrapped outside the key service module.
- `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm build`, `pnpm test` pass; docs-parity green.

---

#### ✅ 8.32 — `sdk.crypto` field encryption surface + `crypto:use` enforcement (RFC 0092, workstream 0011 leg 2)

**Goal:** The plugin-facing crypto API: `sdk.crypto.encryptField()`/`decryptField()` implemented host-side over the leg-1 key service, gated by the `crypto:use` manifest permission, honoring the operator's `SOVEREIGN_ENCRYPT_CLASSES` policy.

**Deliverables:**

- `sdk.crypto.encryptField(value, { sensitivity })` / `sdk.crypto.decryptField(envelope)` in `@sovereignfs/sdk` (types + host-provided impl via `provideHost()` → `runtime/src/sdk-host.ts`), replacing the long-reserved stub reference in `packages/sdk/src/types.ts`.
- Envelope format `svf1:<dekId>:<iv>:<tag>:<ciphertext>` (base64url), AES-256-GCM, AAD bound to `{tenantId, pluginId, class, column}` — extends the `secrets.ts` `sv1` shape with an explicit DEK id.
- `crypto:use` added to the manifest permission enum (`packages/manifest`); calls without it throw the standard permission error.
- Policy behavior: encrypting a class not enabled in `SOVEREIGN_ENCRYPT_CLASSES` is a documented no-op passthrough (returns plaintext-marked envelope), so plugin code is policy-agnostic; decryption handles both envelope and passthrough transparently.
- Sensitivity taxonomy enum (`pii` | `health` | `financial` | `sensitive`) in `@sovereignfs/sdk` + `@sovereignfs/manifest` — the gate-A-approved set.
- `docs/plugin-development.md`: new permission + SDK methods (docs-parity covers the enumerable parts).

**Dependencies:** Task 8.31 (key service).

**SRS reference:** [RFC 0092](../rfcs/0092-app-level-field-encryption.md), SRS §5 (`crypto:use`), NFR-04 (additive minor bumps for `@sovereignfs/sdk`).

**Review checklist:**

- A plugin without `crypto:use` calling either method gets the standard permission error; with it, round-trip succeeds.
- AAD tamper test: an envelope replayed under a different plugin/tenant/column fails authentication.
- Policy off → passthrough is explicit and lossless; policy on → ciphertext in, plaintext never stored.
- `@sovereignfs/sdk` and `@sovereignfs/manifest` bumped **minor**; no breaking API change (NFR-04).

---

#### ✅ 8.33 — `encryptedText()`/`blindIndex()` schema helpers + policy-driven write path (RFC 0092, workstream 0011 leg 3)

**Goal:** Make classification declarative: drizzle column helpers plugin authors use in schema code, with the write/read path encrypting, decrypting, and maintaining blind-index companions automatically — no imperative crypto calls in plugin CRUD code.

> **Correction note (as shipped):** the "no imperative crypto calls" wording proved unachievable safely — plugins query a raw drizzle client (`sdk.db.getClient()`), and drizzle's only column hook (`customType.toDriver`) is synchronous and identity-blind, so fully transparent interception would have required a record-and-replay proxy over drizzle's entire fluent API whose failure mode is silently-unencrypted writes (this leg's designed stop condition). Shipped design, approved at the gate: classification stays fully declarative in the schema; crypto is **one mechanical `sdk.crypto.seal()`/`open()` call per statement**; and `toDriver` serves as a synchronous **tripwire** that throws on any unsealed write to a classified column — a forgotten `seal()` cannot silently store plaintext (raw ` sql` `` statements bypass column mappers and are the documented exception). `sdk.crypto.hashField()` (added this leg) is the blind-index query primitive.

**Deliverables:**

- `encryptedText(name, { sensitivity })` and `blindIndex(name, { source })` exported from `@sovereignfs/sdk` — `customType`-based wrappers over `drizzle-orm` (which plugins already depend on), carrying metadata only; no `@sovereignfs/db` import (SDK zero-deps rule holds).
- Write/read integration: inserts/updates through the platform data layer encrypt classified columns and compute blind-index HMACs in the same statement; reads decrypt transparently. Works identically on both dialects (ciphertext is an ordinary string column).
- Exact-match query support via blind index documented and tested (`WHERE <bidx> = hmac(term)` helper).
- Verify RFC 0092 open question 4: user data export (RFC 0007 path) emits plaintext by routing through the same host service; add a regression test.
- `docs/plugin-development.md`: schema-helper guide including the three sanctioned search/sort patterns (blind index, plaintext metadata, decrypt-and-filter) with their costs stated.

**Dependencies:** Task 8.32 (SDK surface + taxonomy enum).

**SRS reference:** [RFC 0092](../rfcs/0092-app-level-field-encryption.md), NFR-04.

**Review checklist:**

- A schema using both helpers round-trips on live Postgres and live sqld; the stored column value is ciphertext under an enabled class, plaintext under a disabled one.
- Blind-index exact match returns identical results pre- and post-encryption for the same dataset.
- User data export of a row with encrypted fields contains plaintext values.
- No plugin-side imports beyond `@sovereignfs/sdk`/`drizzle-orm`; ESLint boundary rule passes.

---

#### ✅ 8.34 — Operator backfill + blind-index rotation tooling (`sv db encrypt-fields`) (RFC 0092, workstream 0011 leg 4)

**Goal:** The explicit, operator-triggered migration completing the story: encrypt pre-existing plaintext rows for newly enabled classes, and give blind-index key rotation its dual-read transition — the two operations deliberately excluded from automatic boot-time behavior (RFC 0071 incident lesson).

> **Implementation notes (as shipped):** table discovery is **persisted**, not
> in-process — `sdk.crypto.registerTables()` upserts each classified table's
> metadata (name, pk, columns, classes, index sources) into
> `field_table_registrations`, because the CLI walker runs outside the runtime
> process where plugin modules are never loaded (the in-process portability
> registry pattern cannot serve operator tooling). The blind-index HMAC path
> reads key rows fresh per call (uncached, unlike DEKs) so a live rotation's
> key swap is visible immediately — the dual-read guarantee depends on it.
> `rotate-blind-index` refuses to complete a window for a plugin with zero
> registrations unless `--force` is passed. v1 walker limitation: composite
> primary keys are skipped (named in output) — the checkpoint cursor is
> single-column.

**Deliverables:**

- `sv db encrypt-fields` — offline-safe, backup-first, resumable: walks every plugin schema for classified columns whose class is enabled, encrypts plaintext rows in batches, computes blind indexes, records per-table progress so interruption resumes rather than restarts. Per-plugin scoping flag (`--plugin <id>`) to bound blast radius.
- Dual-read blind-index rotation (RFC 0092 open question 2, per gate-B design): query matches old-or-new HMAC during a background re-index; `sv keys rotate-blind-index` drives it.
- Console → Settings: read-only display of active `SOVEREIGN_ENCRYPT_CLASSES` policy and per-plugin backfill status.
- `docs/self-hosting.md`: the full operator runbook — enabling a class, backfilling, rotating, and the explicit statement that enabling a class never mutates existing rows by itself.

**Dependencies:** Task 8.33 (write path + helpers); workstream 0011 gate B (rotation design sign-off).

**SRS reference:** [RFC 0092](../rfcs/0092-app-level-field-encryption.md), NFR-02/07/08.

**Review checklist:**

- Killing `sv db encrypt-fields` mid-run and re-running completes correctly (resume, not restart); a backup exists before the first mutation.
- Enabling a class then booting without running the tool changes zero existing rows — verified by checksum.
- Rotation dual-read: queries return identical results before, during, and after a blind-index re-index.
- The runbook's commands are copy-paste runnable against the compose stack's `tools` profile.

---

#### ✅ 8.35 — Bound isolated Postgres plugin pool size; expose a pool-size env var

**Goal:** Close an unbounded-connection-pool finding from a codebase audit: `packages/db/src/plugin-client.ts`'s `getPluginDb()` opens a `new Pool({connectionString, ssl, options})` per isolated Postgres plugin with no explicit `max`, so node-postgres's implicit default of 10 applies to every plugin pool; `packages/db/src/client.ts`'s platform pool and `apps/auth/src/db.ts`'s auth pool are two more independently unconfigured `Pool`s with the same implicit default. `runAllPluginMigrations()` (`runtime/src/plugin-migrations.ts`) calls `getPluginDb()` for every isolated plugin with a `migrations/postgres/` folder unconditionally at boot — this checkout currently has 11 such plugins (`docs.local`, `kanban.local`, `ledger.local`, `plainwrite.local`, `sheets.local`, `shopper.local`, `tally.local`, `tasks.local`, `travellog.local`, `wallet.local`, `warden`) — so on a Postgres-backed instance with all of them installed, boot alone can open up to 110 connections from plugin pools before counting the platform's or auth's own pool, against Postgres's out-of-the-box `max_connections = 100`. No env var in `.env.example`/`docs/self-hosting.md` currently tunes any of this. Fix: give each of the three long-lived pools an explicit, conservative default `max` and one shared, documented `POSTGRES_POOL_MAX` env var so an operator running many isolated Postgres plugins can size total connections against their server's real `max_connections` budget instead of discovering the ceiling in production.

**Deliverables:**

- Add a pure `postgresPoolMax(env: NodeJS.ProcessEnv = process.env): number` helper to `packages/db/src/client.ts` (exported alongside the existing `pgSslMode`) — reads `POSTGRES_POOL_MAX`, parses it as a positive integer, and falls back to a conservative default of `5` when unset, empty, non-numeric, zero, or negative.
- `packages/db/src/client.ts`'s `createClient()` (platform pool, `client.ts:76`): pass `max: postgresPoolMax(process.env)` to the `new Pool({...})` call.
- `packages/db/src/plugin-client.ts`'s `getPluginDb()` (the long-lived, cached, per-isolated-plugin Postgres pool, `plugin-client.ts:121`, also reused for ongoing `sdk.db.getClient()` calls via `runtime/src/sdk-host.ts:557`, not just migrations): import `postgresPoolMax` from `./client` (this file already imports `pgSslMode` from the same module) and pass `max: postgresPoolMax(process.env)` to its `new Pool({...})`.
- `apps/auth/src/db.ts`'s `getAuthDb()` (the long-lived cached Postgres pool, `db.ts:141`): add a small local duplicate of the same parsing logic (mirrors this file's existing documented pattern of duplicating dialect/sqld resolution rather than importing `@sovereignfs/db`, for service-boundary independence) and pass `max` to its `new Pool({...})`.
- Leave the three short-lived, immediately-`.end()`-ed pools untouched: `provisionPluginDb` (`plugin-client.ts:149`), `dropPluginDb` (`plugin-client.ts:195`), and `provisionAuthStore` (`apps/auth/src/db.ts:97`) each open exactly one connection for one query inside a `try { ... } finally { await pool.end() }` and `runAllPluginMigrations` (`runtime/src/plugin-migrations.ts`) awaits each plugin sequentially in its `for` loop — these never contribute to the sustained-connection budget `POSTGRES_POOL_MAX` is sizing, so bounding them adds no real protection.
- `.env.example`: add a commented `# POSTGRES_POOL_MAX=5` line inside the existing Postgres block (next to `POSTGRES_DB_URL`/`PGSSLROOTCERT`, around line 179-184), documenting that it applies uniformly to the platform pool, the auth pool, and each isolated Postgres plugin's pool — not a single shared total.
- `docs/self-hosting.md`: new table row next to the existing `PGSSLROOTCERT` row (around line 243) documenting `POSTGRES_POOL_MAX`, its default (`5`), and worked sizing guidance: `(number of isolated Postgres plugins installed x max) + platform pool max + auth pool max` must stay under the server's `max_connections` (Postgres's out-of-the-box default is 100).
- Unit tests for `postgresPoolMax()` in `packages/db/src/__tests__/client.test.ts` (or a new adjacent file): unset -> 5, valid override (e.g. `'8'` -> 8), and each invalid case (`''`, `'0'`, `'-3'`, `'abc'`) falling back to 5.

**Dependencies:** None. Independent of the other in-flight 8.3x (RFC 0092) tasks — touches only Pool construction in packages/db, apps/auth, and the two docs/env files; no schema or migration changes.

**SRS reference:** None — this is operational remediation from a codebase audit (unbounded connection-pool sizing), not new product capability. Related, but not a formal dependency: the Postgres advisory-lock incident recorded in this file's own Status section (`0.101.9`) and its matching bullet in `docs/architecture-rules.md` — a different bug (session-scoped primitive on a pooled connection) in the same `packages/db` Postgres-pool surface, which is what prompted the audit this task's finding came out of.

**Review checklist:**

- `rg "new Pool\(" packages/db/src/client.ts packages/db/src/plugin-client.ts apps/auth/src/db.ts` shows `max: postgresPoolMax(...)` (or its local duplicate) on exactly the three long-lived pools (`client.ts:76` platform, `plugin-client.ts:121` isolated-plugin, `apps/auth/src/db.ts:141` auth); the three short-lived provision/drop pools (`plugin-client.ts:149`, `plugin-client.ts:195`, `apps/auth/src/db.ts:97`) are unchanged.
- With `POSTGRES_POOL_MAX` unset, each of the three pools opens with `max: 5` — verified via the new `postgresPoolMax()` unit tests plus a live check (`pool.options.max` or `SELECT count(*) FROM pg_stat_activity` under concurrent load against a real Postgres instance).
- `postgresPoolMax()`'s unit tests pass for unset, a valid override, and each invalid input (`''`, `'0'`, `'-3'`, `'abc'`) falling back to the default of 5.
- `.env.example` documents `POSTGRES_POOL_MAX` (commented, with its default) and `docs/self-hosting.md`'s variable table has a matching row with the worked sizing math.
- `pnpm exec vitest run runtime/src/__tests__/docs-parity.test.ts` passes (the new commented-out var must resolve in `self-hosting.md`).
- `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm build`, and `TEST_DATABASE_URL=... pnpm test` (including the `.pg.test.ts` suite) all pass.
- `@sovereignfs/db` and `apps/auth` package versions bumped patch (behavior change is an additive, defaulted constructor option — not a breaking API change); root platform `package.json` bumped minor for this epic task's completion, per CLAUDE.md's version-bump convention.

---

#### ✅ 8.36 — Batch field-reseal's per-row UPDATE into multi-row statements

**Goal:** Task 8.36 — `walkOneTable`'s inner loop (`runtime/src/field-reseal.ts:236-249`), the shared machinery under both `sv db encrypt-fields` (backfill) and `sv keys rotate-blind-index` (RFC 0092 gate B, task 8.34), reads each `BATCH_SIZE` (100, `field-reseal.ts:37`) chunk with one `SELECT ... LIMIT 100` (lines 226-233), but for every row that `transform()` — the `backfillTransform`/`rotateIndexTransform` pair, lines 96-177 — flags as needing re-sealing, issues and awaits a separate `UPDATE ... WHERE <pk> = ...` (lines 239-247, dialect-branched at 244-245 into `pdb.db.run`/`pdb.db.execute`) before moving to the next row. A rotation or backfill against a classified table with many rows needing re-sealing therefore does one sequential network round trip per row against sqld or Postgres — wall-clock time scales with row count instead of batch count — even though the read side of the same loop already batches. `docs/self-hosting.md`'s "Field encryption (RFC 0092)" runbook (§1965) already tells operators to run both commands against real production data. This task closes the finding by batching the write side to match the read side, within the existing per-batch checkpoint boundary.

**Deliverables:**

- In `walkOneTable` (`runtime/src/field-reseal.ts:236-249`), collect every row's `transform()` result across the batch first — `transform()` itself stays a per-row call (it's CPU/crypto-bound decrypt+re-encrypt work on already-fetched rows, not a round trip) — then group the rows needing a write by their exact `Object.keys(updates)` shape (`backfillTransform`/`rotateIndexTransform`, lines 96-177, can each produce a different changed-column set per row — e.g. one row needs only its blind index recomputed while another also needs its ciphertext resealed) and flush each group as one multi-row `UPDATE`, replacing the current per-row `await pdb.db.run(update)` / `await pdb.db.execute(update)` pair (lines 244-245).
- Build each dialect's multi-row statement at the same `pdb.dialect === 'sqlite'` branch point that already exists in this function (lines 230-233, 244-245) — e.g. `UPDATE <table> SET <col> = v.<col>, ... FROM (VALUES (pk, val, ...), ...) AS v(pk, <col>, ...) WHERE <table>.<pk> = v.pk` — using the file's existing `q()` identifier-quoting helper (lines 55-62) for every table/column name and the drizzle `sql`/`sql.join` template (already used for the per-row assignment list at lines 240-243) for every bound value; no manual string interpolation of row data.
- Preserve current observable semantics unchanged: `result.updated` still counts individual rows written, not statements issued; `cursor` still advances to the last scanned row's pk in scan order (line 248) regardless of whether that row was written; the per-batch checkpoint upsert (lines 250-256, `upsertResealCheckpoint`) still fires exactly once per `BATCH_SIZE` chunk, not once per statement.
- Add a regression test proving round-trip count no longer scales with row count — e.g. a batch of ~100 rows that all need resealing issues a small, bounded number of `UPDATE` statements (one per distinct changed-column shape present in the batch), not 100.
- Add Postgres coverage for the walker: today only `runtime/src/__tests__/field-rotation-e2e.sqld.test.ts` (sqld/SQLite, `describe.skipIf(!LIVE)` gated on `TEST_SQLD_URL`/`TEST_SQLD_ADMIN_URL`) exercises `runReseal`/`walkOneTable` end-to-end — the new Postgres `UPDATE ... FROM (VALUES ...)` code path has no dialect coverage otherwise. Add `runtime/src/__tests__/field-reseal.pg.test.ts` gated on `TEST_DATABASE_URL` (mirroring `field-schema-e2e.pg.test.ts`'s existing setup), covering at minimum a multi-row backfill and a multi-row blind-index rotation.

**Dependencies:** Task 8.34 (implemented `walkOneTable`/`runReseal`, the code this task modifies).

**SRS reference:** [RFC 0092](../rfcs/0092-app-level-field-encryption.md) — hardens the gate-B operator tooling task 8.34 shipped under that RFC; not new design, and no dedicated performance NFR exists for this admin-only path.

**Review checklist:**

- `field-rotation-e2e.sqld.test.ts`'s two existing tests (dual-read continuity through a rotation window; checkpoint resume-not-restart) pass unmodified against a live sqld (`TEST_SQLD_URL`/`TEST_SQLD_ADMIN_URL` set).
- The new `field-reseal.pg.test.ts` passes against a live Postgres (`TEST_DATABASE_URL` set), covering both a multi-row backfill and a multi-row rotation.
- The new regression test demonstrates the number of `UPDATE` statements issued for a batch no longer grows 1:1 with the number of rows needing resealing in that batch.
- `result.updated`, checkpoint cursor advancement, and per-batch checkpoint persistence in `runReseal`'s returned `ResealSummary` are identical to pre-change behavior for the same fixture data — no observable behavior change to callers of `sv db encrypt-fields`/`sv keys rotate-blind-index`.
- `pnpm typecheck`, `pnpm lint`, and `pnpm format:check` all pass; a full `pnpm exec vitest run` is green.

---

#### ✅ 8.37 — Age-based backup encryption: passphrase-mode migration + recipient-mode primitives (RFC 0064, workstream 0023 leg 1)

**Goal:** Move task 8.16's passphrase-mode backup encryption helper onto the `age` format instead of raw Node `crypto`, and add a new recipient-mode encryption primitive — so both workstream 0004's existing passphrase flows and this workstream's new recipient-based flows share one encryption implementation instead of two.

**Deliverables:**

- Added the `age-encryption` npm package (0.3.1, by the `age` format's own author) to `runtime/package.json` as a direct dependency. **Correction to this task's own original spec:** it is pure JS (built on `@noble/ciphers`/`@noble/curves`/`@noble/hashes`), not WASM — there is no `.wasm` asset in the published package. This is good news for task 8.40's browser decrypt: no `'wasm-unsafe-eval'` CSP addition is needed after all, contrary to what workstream 0023's own doc currently assumes; that doc needs a follow-up correction when 8.40 is picked up.
- Migrated `runtime/src/backup-encryption.ts`'s `encrypt`/`decrypt` (passphrase mode) to use `age`'s `Encrypter`/`Decrypter` classes with `setPassphrase`/`addPassphrase` internally, keeping the same external contract (`Buffer` plaintext in, base64url `string` ciphertext out, and back). **Correction to this task's own original spec:** "every existing test must pass unmodified" undersold what changed — `age-encryption`'s API is promise-based, so `encrypt`/`decrypt` themselves became `async`, and the standalone `deriveKey` export was removed entirely (an implementation detail of the old raw-scrypt approach; `age` derives its own key internally via its `ScryptIdentity`/`ScryptRecipient` and exposes no equivalent primitive, and `deriveKey` had zero callers outside its own two dedicated tests). What's actually preserved is the **behavioral contract** the rest of this workstream depends on: same round-trip semantics, same clean-failure-on-wrong-passphrase/tampered-data semantics — verified by rewriting every test as `async`/`await` against the real library rather than assumed. Confirmed via `grep` before touching anything that `backup-encryption.ts` had zero callers anywhere in `runtime/`/`bin/` outside its own test file — tasks 8.17/8.18 haven't wired it into `backup-run.ts`/`backup-download.ts` yet (matches 8.16's own progress note), so this migration has zero blast radius on shipped behavior.
- Added `encryptToRecipients(plaintext: Buffer, recipients: string[]): Promise<string>`, using `Encrypter.addRecipient` per recipient (age supports multiple recipients per file natively). No corresponding server-side decrypt-with-identity function exists anywhere in `runtime/` — decrypting recipient-mode ciphertext happens only in the operator's own `sv restore` process (task 8.42) or client-side in the browser (task 8.40), never in the running platform process.

**Dependencies:** Task 8.16 (the encryption helper this task migrates).

**SRS reference:** [RFC 0064](../rfcs/0064-git-backed-operator-backups.md) — resolves the per-user-shaped half of its Open Question #1 ("age recipients, passphrase AES-GCM, or both?"); see [workstream 0023](../workstreams/0023-age-encrypted-git-backup-destinations.md).

**Review checklist:**

- ✅ Every behavior the original test suite asserted (round-trip, empty-archive round-trip, clean failure on wrong passphrase, clean failure on tampered ciphertext, clean failure on truncated ciphertext, distinct ciphertext per call) still holds, re-verified against the real `age-encryption` library — 10/10 tests passing (`runtime/src/__tests__/backup-encryption.test.ts`), plus new coverage for `encryptToRecipients` (single recipient, multiple recipients where any one matching identity decrypts, non-matching identity fails, distinct ciphertext per call).
- ✅ **Both** `encryptToRecipients` and the migrated passphrase-mode `encrypt` round-trip against the real, standalone `age` v1.3.1 CLI (Homebrew, not this codebase's own tooling) — not just this library's own internal self-consistency. Recipient mode: encrypted here with a real `age-keygen`-generated identity's recipient, decrypted with `age --decrypt --identity identity.txt` against the real CLI. Passphrase mode: encrypted here, decrypted with `age --decrypt` against the real CLI (required faking a TTY via `script -q /dev/null` for the interactive passphrase prompt in this sandboxed shell — a test-environment workaround, not a code concern). Both produced the exact original plaintext.
- ✅ No code path anywhere in `runtime/` calls an age decrypt function with a private identity — `decrypt()` only ever calls `Decrypter.addPassphrase`; `encryptToRecipients()` only ever calls `Encrypter.addRecipient`. (Test code exercises `Decrypter.addIdentity` directly to prove round-trip correctness — that's test-only verification of the third-party library, not a runtime code path.)
- ✅ `pnpm typecheck`, `pnpm lint`, `pnpm format:check` all clean on the touched files; full `runtime` package test suite (864 tests) passes.

---

#### ✅ 8.38 — Per-user AGE identity generation & git connection storage (workstream 0023 leg 2)

**Goal:** Let any user generate their own age identity entirely client-side and connect a personal git repository as a labeled destination, with the private key never transmitted to or stored by the server.

**Deliverables:**

- New Account UI: "Generate a backup key" — runs `age-encryption.js` in-browser, shows the identity once with strong "save this now" friction (download-as-file plus copy-to-clipboard), sends only the public recipient string to the server.
- Connection storage mirrors `plugins/warden/app/_lib/providers.ts`'s existing shape exactly: `sdk.secrets.create({ scope: 'user', ... })` for the git credential (PAT or SSH private key), `sdk.connections.create({ scope: 'user', provider: 'git.custom', secretRef, metadata: { repoUrl, branch, ageRecipient } })` for the record — `ageRecipient` is plain metadata, not a vault secret, since a public recipient cannot decrypt anything.
- Account surfaces the connection with the same `status`/`lastError`/`lastCheckedAt` health fields `sdk.connections` already provides; disconnect reuses its existing atomic secret-cleanup.
- No push logic in this task — see task 8.39.

**Dependencies:** Task 8.6 (plugin secret vault), the `sdk.connections`/`sdk.secrets` surfaces (already implemented, live precedent in `plugins/warden`).

**SRS reference:** [RFC 0043](../rfcs/0043-plugin-secret-vault.md), [RFC 0049](../rfcs/0049-plugin-external-connections.md); see [workstream 0023](../workstreams/0023-age-encrypted-git-backup-destinations.md).

**Review checklist:**

- Network traffic during identity generation is inspected directly (not just code-reviewed) to confirm the private key never appears in any request.
- A user cannot read or list another user's git connection.
- Disconnecting a connection deletes its linked secret atomically, matching `sdk.connections.disconnect()`'s existing behavior.

**Shipped:** New `plugins/account/app/_lib/backup-destinations.ts` (client fetch
helpers) and `plugins/account/app/data/actions.ts`
(`connectBackupDestinationAction`, an `ActionResult`/`useActionState` server
action per this repo's own convention) mirror `plugins/warden/app/_lib/providers.ts`'s
shape exactly: `sdk.secrets.create({ scope: 'user', ... })` for the PAT/SSH
credential, `sdk.connections.create({ scope: 'user', provider: 'git.custom',
secretRef, metadata: { repoUrl, branch, ageRecipient } })` for the record.
New `BackupDestinationPanel.tsx` wires an in-browser `age-encryption` identity
generator ("Generate a backup key") into the existing "Connect a backup
destination" form, and is mounted in `plugins/account/app/data/page.tsx`
alongside the existing `PortabilityPanel`.

Two real bugs caught and fixed before this was considered done, both from
this repo's own documented bug classes: (1) `BackupDestinationPanel`'s
success `useEffect` initially re-fired whenever its `onConnected` prop's
identity changed, not only on a genuine new submission — fixed with the
`handledStateRef` guard `AddProviderForm.tsx` (Warden, `0.112.3`) already
established for this exact class of bug, confirmed by a regression test that
first failed against the naive fix (dependency array alone) before the
guard was added. (2) None of the three connect-form inputs had
`disabled={pending}`, the same gap `ProviderRow.tsx`/`AddProviderForm.tsx`
each shipped and had to fix separately (`0.112.5`/`0.113.2`) — added
proactively here rather than waiting for a third occurrence.

Verified live end-to-end against a real dev server: generating a backup key
runs entirely client-side — confirmed via direct network-tab inspection
during generation that no request contains the private identity, only the
public `age1...` recipient ever reaches the connect form. Also found and
fixed a real mobile layout bug live-testing this: `.sessionMeta`'s connection
summary had no `overflow-wrap`, so a long `age1...` recipient string
overflowed the viewport horizontally at 375px — fixed with
`overflow-wrap: anywhere`. Two follow-up gaps were found but deliberately
left unfixed, out of scope for this task, and flagged separately: the Data
page's `secrets` list doesn't refresh after a connection disconnect deletes
its linked secret (stale UI until reload), and a broader pre-existing
horizontal-overflow issue on the Data page unrelated to this task's own
changes. `sdk.connections`' existing per-user scoping (already shipped,
exercised here only as a consumer) covers "a user cannot read another user's
connection" — no new authorization code was written in this task.

Full `plugins/account` + `runtime/src` suite green (105 files, 1067 tests),
`pnpm --filter runtime typecheck`, `pnpm lint`, `pnpm format:check`, and
`pnpm exec tsx scripts/design-tokens-check.ts` all clean.
`plugins/account/manifest.json` bumped `0.4.3` → `0.4.4`.

---

#### ✅ 8.39 — Per-user git-push backup destination (workstream 0023 leg 3)

**Goal:** Let a user's existing async data backup (task 8.18) optionally push as an age-recipient-encrypted, tagged commit to their connected git repository.

**Deliverables:**

- Extends task 8.18's async backup job with an optional git-push step, using task 8.38's connection and task 8.37's `encryptToRecipients`. Runs in-process — no subprocess spawn, unaffected by task 8.16's Docker-spawn gap (see task 8.41's notes).
- New shared module (e.g. `runtime/src/git-backup.ts`) wrapping `git` invocations via `execFileSync` with argv arrays only — never an interpolated shell string. One orphan commit per backup, tagged `sv-backup/<timestamp>/v<platform>`, matching RFC 0064's and task 8.17's existing shape.
- Task 8.17's own operator git-push logic is refactored to share this module rather than duplicating shell-out code between scopes.
- A failed push moves the connection to `needs_reauth`/`error` via `sdk.connections.markError()`; the backup job's own status distinguishes "archive generated" from "archive generated and pushed" so a push failure is never silently indistinguishable from full success.

**Dependencies:** Tasks 8.18, 8.37, 8.38.

**SRS reference:** [RFC 0064](../rfcs/0064-git-backed-operator-backups.md); see [workstream 0023](../workstreams/0023-age-encrypted-git-backup-destinations.md).

**Review checklist:**

- A real backup pushes a resolvable, correctly-tagged orphan commit to a real test git remote end to end.
- A simulated push failure (auth rejection, unreachable remote) leaves the connection in `error`/`needs_reauth` and the job status clearly distinct from a fully-succeeded backup.
- No user-supplied value (repo URL, branch, token) ever reaches a shell as an interpolated string — verified by reading `git-backup.ts` directly, not just by testing the happy path.

**Shipped:** New `runtime/src/git-backup.ts` provides `pushBackupToGit()` — one
orphan commit per backup (a fresh `git init` temp directory always starts on
an unborn branch, so its first commit has no parent by construction, no
`--orphan` checkout needed), tagged `sv-backup/<timestamp>/v<platformVersion>`
per RFC 0064, pushed via `execFileSync` with argv arrays throughout. The
credential (HTTPS token or SSH private key) is passed to `git` exclusively
through environment variables read by a short-lived `GIT_ASKPASS` script or
an `IdentityFile`, written to a 0600 temp file removed in a `finally` block —
never as a literal argv element or embedded in the remote URL, both of which
are visible to any user on the host via `ps`, unlike an env var. Deliberate
scope reduction from this task's own original deliverable list: task 8.17
(Console instance backup UI) still hasn't shipped, so there is no existing
operator git-push logic to refactor onto this shared module yet — 8.17 gets
the module already built when it lands, rather than this leg blocking on a
task with no code to share with.

`runUserBackup()` (`runtime/src/backup-run.ts`) gained an optional push step,
gated on a new `pushDestinationId` in the job's `optionsJson`: it encrypts
the **same plaintext export bundle a second time**, to the destination's age
recipient via task 8.37's `encryptToRecipients` — deliberately never the
same ciphertext the direct-download path gets from the requester's
passphrase, since the whole point of a personal git destination is that it's
decryptable only with the user's own downloaded private key, never a
passphrase a git host operator could guess or brute-force. The push step is
wrapped in its own try/catch that never propagates: per this task's own "do
not proceed if" clause, a failed push must never turn an otherwise-successful
archive generation into a failed job. Failure is instead recorded via two
new `backup_jobs` columns, `push_status`/`push_error` (new
`markBackupJobPushResult()`, `@sovereignfs/db`) — deliberately separate
columns from the existing `status`/`error_message`, not a new value in the
`status` enum, so the existing 8.18 UI's status handling needed zero changes
— and on the connection itself via the existing `markPluginConnectionError()`
(`error` by default, `needs_reauth` for a light regex-classified
authentication-flavored failure message). `runtime/app/api/account/backup-jobs/route.ts`
validates a supplied `pushDestinationId` exists and is `connected` at enqueue
time (fail-fast 400, better UX than only discovering it on the worker's next
tick) — `runUserBackup()`'s own re-fetch remains the actual authorization
boundary regardless, unaffected by a race between enqueue and claim.
`plugins/account/app/_components/PortabilityPanel.tsx`'s "Full backup"
section gained a destination picker (only shown when the user has at least
one `connected` `git.custom` destination) and shows the push outcome
alongside the existing download-ready state once the job completes.

Verified live end-to-end against a real dev server with a real local bare
git repository standing in as the remote (a filesystem path is a fully valid
git transport — no network/auth server needed to exercise real orphan-commit
and tag mechanics), seeding real connection/secret rows through the same
`@sovereignfs/db` functions the app itself uses rather than the connect
form's own client-side URL-scheme validation (`https://`/`git@`/`ssh://`
only, a legitimate real-world guard, not a bug, that a bare local test path
can't satisfy): a real backup job queued with `pushDestinationId` set,
the worker's real 60s tick claimed and ran it, and the bare repo received a
tag matching `sv-backup/<timestamp>/v0.121.1` on a commit with **no parents**
(confirmed via `git log --format=%P`), containing the encrypted payload and
a plaintext `manifest.json`. The pushed ciphertext's header read
`age-encryption.org/v1` / `-> X25519 ...` — confirmed recipient-mode, not
the `-> scrypt ...` passphrase-mode header the direct-download archive uses
— and was successfully decrypted with the real private identity generated
client-side in an earlier step, yielding a valid ZIP with the correct
`manifest.json` (right user, right platform version). A second live run
against a nonexistent remote path confirmed the failure path end to end:
`pushStatus: "failed"` with git's real captured stderr, the connection
flipped to `status: "error"`, and the job itself stayed `status: "complete"`
with `errorMessage: null` and a working `downloadUrl` — the local archive
succeeding independent of the push outcome, exactly as this task's own "do
not proceed if" clause requires. New `runtime/src/__tests__/git-backup.test.ts`
covers the same orphan-commit/tag/argv-safety properties against a real
local bare repo at the unit level (13 test cases across both files touching
this leg's new push behavior). A live UI render of the new destination
picker itself could not be completed — this session's browser preview tool
stopped hydrating client components partway through verification, confirmed
unrelated to this task's own code since the identical symptom affected
`plugins/account/app/data/page.tsx`'s pre-existing, unmodified data-loading
effect on the same page, and persisted across two full dev-server restarts
and a fresh browser tab; the component itself is typecheck- and lint-clean
and follows the identical `FormField`/`Select` pattern already shipped
elsewhere in the same file.

Full repository suite green (312 files, 3049 tests, 0 failed),
`pnpm --filter runtime typecheck`, `pnpm --filter @sovereignfs/db typecheck`,
`pnpm lint`, `pnpm format:check`, `pnpm exec tsx scripts/design-tokens-check.ts`,
and `pnpm --filter runtime build` (composed plugin directories are excluded
from `runtime`'s own `tsc --noEmit` scope) all clean. `@sovereignfs/db`
bumped `4.10.0` → `4.11.0` (new `push_status`/`push_error` columns on
`backup_jobs`, plus `markBackupJobPushResult()`); `runtime` bumped `0.94.0`
→ `0.95.0`; `plugins/account/manifest.json` bumped `0.5.0` → `0.6.0` (rebased
past workstream 0018's own `0.4.6` → `0.5.0` bump, merged in the meantime).

---

#### 📋 8.40 — Restore from a personal git backup destination (workstream 0023 leg 4)

**Goal:** Let a user list, fetch, and decrypt their own git-backed backups entirely client-side, landing the result in the existing unmodified import flow — closing the loop task 8.39 opens.

**Deliverables:**

- Sync listing via `git ls-remote --tags` against `sv-backup/*` — no object fetch, no job needed.
- New `backup_jobs` kind (`restore-fetch`) reusing task 8.16's worker/claim/signed-download machinery unchanged in mechanism — a shallow `git fetch --depth=1` of the chosen tag, delivered via the existing signed-download route shape, streamed not buffered.
- Client-side decrypt via `age-encryption.js` in the browser (streaming, so a near-250MB archive doesn't need to fit in memory at once); identity supplied via a file picker (`FileReader`, matching `packages/sdk/src/device-client.ts`'s `pickViaFileInput` pattern), held in a local variable scoped to the decrypt call only — never React state, never `sessionStorage`.
- Add `'wasm-unsafe-eval'` to `script-src` in `runtime/src/security.ts` (currently `'self' 'nonce-${nonce}' ${THEME_SCRIPT_CSP_HASH}` in production) — a narrower, WASM-specific token, not a reversal of that file's existing "never ship `'unsafe-eval'`" rule.
- Decrypted bytes `fetch()` directly to the existing, unmodified `POST /api/account/import`. This inherits `MAX_IMPORT_BYTES` (50MB, `runtime/app/api/account/import/route.ts:8`) — the restore UI must surface this ceiling clearly rather than fail silently past it; fixing the ceiling itself is out of this task's scope.

**Dependencies:** Tasks 8.16, 8.37, 8.38, 8.39.

**SRS reference:** [RFC 0064](../rfcs/0064-git-backed-operator-backups.md), [RFC 0007](../rfcs/0007-user-data-portability.md) (restore target); see [workstream 0023](../workstreams/0023-age-encrypted-git-backup-destinations.md), whose leg 4 marks this a **gate** — see its Kill criteria for the fallback if browser decrypt proves unworkable on real devices.

**Review checklist:**

- A real personal backup is listed, fetched, decrypted, and imported end to end on a real device — including at least one low-power mobile device, not only desktop.
- The signed-download token alone (without the user's identity) cannot yield decryptable data.
- Restoring the identical archive by cloning the repo and using the standalone `age` CLI (entirely outside this app) succeeds — proving the underlying Sovereign-independent restore path is real, not just the in-app convenience layer.
- A backup exceeding `MAX_IMPORT_BYTES` produces a clear, specific UI message, not a generic failure.

---

#### 📋 8.41 — Operator age-recipient backup destination (workstream 0023 leg 5)

**Goal:** Give operators an age-recipient encryption option for instance-scope git-push backups, alongside (not instead of) task 8.17's existing passphrase option.

**Deliverables:**

- Extends task 8.17's Console git-push settings with an optional age-recipient field — plain config, not `sdk.secrets`, since a recipient string is not sensitive.
- Push mechanics reuse task 8.39's shared `git-backup.ts` module rather than task 8.17's original bespoke implementation.

**Dependencies:** Tasks 8.17, 8.37, 8.39. **Cannot be verified end-to-end until task 8.16's Docker-spawn gap is resolved** (the production `runner` image cannot spawn `sv backup`, per that task's own progress note and `docs/architecture-rules.md`) — this is a pre-existing blocker on task 8.17 itself, not introduced here; do not treat a clean local `pnpm dev` test as sufficient proof this task works in production.

**SRS reference:** [RFC 0064](../rfcs/0064-git-backed-operator-backups.md); see [workstream 0023](../workstreams/0023-age-encrypted-git-backup-destinations.md).

**Review checklist:**

- A real instance backup, with an age recipient configured, pushes a resolvable, correctly-tagged orphan commit that decrypts only with the matching identity.
- Verified against the actual production-shaped Docker topology, not only a native `pnpm dev` checkout.
- The existing passphrase-only flow (task 8.17) is unaffected when no recipient is configured.

---

#### 📋 8.42 — `sv restore --age-identity` + docs (workstream 0023 leg 6)

**Goal:** Let an operator restore an age-recipient-encrypted instance backup from the CLI, and document both new destination types.

**Deliverables:**

- `sv restore` gains `--age-identity <file>` — decrypts in the operator's own CLI process using a key file they supply from their own storage, then applies the existing restore logic unchanged, including SQLite's existing marker-reconciliation logic (`bin/sv.ts:696-746`, load-bearing per the 2026-07-24 RFC 0071 incident) untouched.
- `docs/self-hosting.md` documents the new age-recipient config surface (alongside RFC 0064's existing `SV_BACKUP_GIT_*` naming); `docs/security.md` documents age-recipient mode as a backup encryption option and states plainly that losing a personal or operator identity is unrecoverable by design — no server-side escrow exists.

**Dependencies:** Task 8.41.

**SRS reference:** [RFC 0064](../rfcs/0064-git-backed-operator-backups.md); see [workstream 0023](../workstreams/0023-age-encrypted-git-backup-destinations.md).

**Review checklist:**

- `sv restore --age-identity` recovers a real recipient-mode instance backup end to end.
- The existing passphrase-mode `sv restore` path is unaffected.
- `docs/self-hosting.md` and `docs/security.md` accurately describe both new destination types and the no-escrow warning.

---

## Related RFCs

- [RFC 0006 — Deployment & upgrade strategy](../rfcs/0006-deployment-upgrade-strategy.md)
- [RFC 0007 — User data portability](../rfcs/0007-user-data-portability.md)
- [RFC 0004 — Per-plugin database](../rfcs/0004-per-plugin-database.md)
- [RFC 0033 — User data deletion](../rfcs/0033-user-data-deletion.md)
- [RFC 0008 — Security & encryption architecture](../rfcs/0008-security-encryption-architecture.md)
- [RFC 0043 — Plugin secret vault](../rfcs/0043-plugin-secret-vault.md)
- [RFC 0044 — Plugin file storage](../rfcs/0044-plugin-storage.md)
- [RFC 0052 — Plugin portability hooks](../rfcs/0052-plugin-portability-hooks.md)
- [RFC 0060 — Client-side encryption core](../rfcs/0060-client-side-encryption-core.md)
- [RFC 0071 — SQLite at-rest encryption (opt-in, single-key)](../rfcs/0071-sqlite-at-rest-encryption.md)
- [RFC 0064 — Git-backed operator backups](../rfcs/0064-git-backed-operator-backups.md)
- [RFC 0068 — Export completeness hardening](../rfcs/0068-export-completeness-hardening.md)
- [RFC 0084 — UI-driven backup & restore](../rfcs/0084-ui-driven-backup-restore.md)
- [RFC 0092 — App-level field encryption (platform-wide by classification)](../rfcs/0092-app-level-field-encryption.md)

## Related Docs

- [plugin-database.md](../plugin-database.md)
- [self-hosting.md — Backup & restore, upgrade](../self-hosting.md)
- [upgrade.md](../upgrade.md)

## Cross-references

- Per-plugin database (epic task 3.13) is also tracked in [Plugins Runtime](plugins-runtime.md).
- User data deletion (epic task 1.7) is also tracked in [Users & Auth](users-auth.md) (it extends `sdk.portability`).
- Security hardening Tier 0+1 is tracked in [Platform Shell](platform-shell.md) (no crypto machinery in v1).
- Sovereign Wallet (Epic 21) is the first planned consumer of client-side encryption.
