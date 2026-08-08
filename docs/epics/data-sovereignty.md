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

#### 📋 8.18 — Account: async selective data backup UI (regular users) (RFC 0084)

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

---

#### 📋 8.19 — RFC 0071 incident: pre-flight warning and remaining doc follow-ups

**Goal:** Close the four still-untracked, non-Docker follow-ups from
`docs/incidents/2026-07-24-rfc-0071-encryption-rollout.md`'s "Follow-up
actions" table (a fifth, publishing a `sovereign-tools` image, is tracked
separately as Task 0.19 — a Docker/CI change, not an RFC 0071 semantics
change). Task 8.15 already closed the two boot-time reactive cases (no key
set → warn and boot; key set + a requesting plugin's file already plaintext
→ fail fast, naming `sv db encrypt`) — what's still missing is surfacing
that same signal **earlier**, at the point a plugin is added to an instance,
plus the documentation the incident's own "Lessons learned" section says
this scenario deserved and never got.

**Per this codebase's standing rule on this subsystem**
(`CLAUDE.md`'s SQLite/Postgres at-rest encryption hard architectural rule):
read the incident doc first, and re-run the full test suite plus a live
encrypt → verify → decrypt → verify round-trip against real data before
considering this task done — this area has repeatedly looked more finished
than it was.

**Deliverables:**

- **Pre-flight warning at plugin-install time**, not just next-boot: wire
  the already-existing `findEncryptionRequiringPlugins()` scanner
  (`bin/sv.ts:758`, currently only consulted by `sv db encrypt`/`decrypt` to
  decide which files to touch) into `scripts/install-plugins.ts`'s install
  path and/or a new `sv plugin add` check, so that adding a plugin
  declaring `database.requireEncryption: true` to an instance with
  `SOVEREIGN_DB_ENCRYPTION_KEY` unset — or set but with pre-existing
  plaintext data — prints a warning naming the plugin and the required
  follow-up (`sv db encrypt`) **at install time**, before the next restart
  surfaces it as a boot failure or a silently-degraded warning log.
- **Plugin-authoring guidance**: a new section in `docs/plugin-development.md`
  stating Drizzle migration files are append-only once a plugin version
  ships — never regenerate an already-released migration file, even if its
  contents would be identical — with a one-paragraph explanation of why
  (Drizzle's SQLite migrator tracks "already applied" by comparing a
  migration folder's embedded timestamp against `__drizzle_migrations`, not
  by hashing content; a regenerated file with a newer timestamp is treated
  as a new, unapplied migration and re-run against a database that already
  has its objects). This is the incident's step 9 root cause (the `docs`
  plugin's `already exists` error), not an encryption bug at all, but only
  surfaced because encryption had blocked that plugin's migrations from
  running earlier — worth documenting on its own regardless of encryption.
- **`docs/self-hosting.md` scenario**: an explicit "installing a plugin that
  requires encryption on an existing unencrypted instance" walkthrough in
  the existing "SQLite at-rest encryption (RFC 0071)" section
  (`docs/self-hosting.md:314`) — distinct from the two scenarios already
  documented there (fresh instance, converting an already-running plaintext
  instance) per the incident's own "Lessons learned": adding such a plugin
  is a combination of both and wasn't called out as its own case.
- **`docs/troubleshooting.md` / `docs/upgrade.md` entries** for this failure
  class: the exact `DbEncryptionConfigError: SOVEREIGN_DB_ENCRYPTION_KEY is
set, but the data directory has not been encrypted yet` message, what it
  means, and the fix (`sv db encrypt`) — so an operator hitting it from a
  search or an upgrade note finds the answer directly instead of
  re-deriving the incident's diagnosis from scratch.

**Dependencies:** Task 8.15 (this surfaces the same check earlier, reusing
its semantics — not a new encryption-enforcement model).

**SRS reference:** [RFC 0071](../rfcs/0071-sqlite-at-rest-encryption.md)
(follow-up); incident doc above.

**Review checklist:**

- Running the install path against a plugin declaring
  `database.requireEncryption: true` on an instance with no key set prints
  a warning naming that plugin, before any restart — verified live, not
  just unit-tested.
- The same install path against a plugin that doesn't request encryption
  prints nothing new (no false-positive warning noise).
- `docs/plugin-development.md`'s new section is linked from wherever plugin
  migrations are otherwise documented, not an orphaned page.
- `docs/self-hosting.md`'s new scenario walks through the exact incident
  sequence (add plugin → warning → `sv db encrypt` → restart) end to end.
- `docs/troubleshooting.md`/`docs/upgrade.md` both surface the exact error
  string as a searchable heading, not just prose description.
- Full test suite plus a live encrypt → verify → decrypt → verify round-trip
  against real data (per this subsystem's standing CLAUDE.md requirement).
- `pnpm format:check && pnpm lint && pnpm typecheck && pnpm test`

---

#### 📋 8.20 — Offline data encryption at rest (Research 0012)

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

#### 📋 8.21 — Escrow and recovery for `device-only` data (Research 0012)

**Goal:** Decide and implement what happens to `device-only` data when the key
dies — because with no server copy, a hardware-bound key that is invalidated
takes the data with it.

**Blocked on a product decision (goal owner: kasunben).** Research 0012
deliberately makes no recommendation; the three options and their costs are in
its "Open questions" section. This task cannot start before that decision.

**Why the key dies:** `biometryCurrentSet` is invalidated when fingerprints or
face data change; deleting a passkey destroys its PRF secret; a lost or wiped
device takes the key with it. For `offline-first` this is harmless — re-sync. For
`device-only` it is permanent, irrecoverable loss.

**Deliverables — depend on the decision:**

- **Encrypted server backup:** server stores ciphertext it cannot read, plus a
  user-held recovery secret and the UX to issue, store, and redeem it.
- **User-driven export:** an export/import path and honest documentation that
  data not exported will be lost.
- **Accept the loss:** explicit in-product warning at enrolment and in
  `docs/plugin-development.md`; no recovery mechanism.

Whichever is chosen, this also answers device-to-device migration — migration and
key-invalidation recovery are the same problem.

**Also settle here:** whether key strictness (`biometryCurrentSet` vs
`userPresence`) is manifest-declared per plugin, and the written position on
server-side revocation being unable to reach `device-only` data. For a
sovereignty product the latter is arguably correct — it is the user's data on the
user's device — but it contradicts the assumption behind the current sign-out
purge and must be stated deliberately.

**Dependencies:** Task 8.20. Gates task 1.22.

**SRS reference:** §5.2.

**Review checklist:**

- The chosen option is implemented and documented.
- Enrolment tells the user what happens if they lose the device, before they
  commit data to the plugin.
- The revocation position is written down where an operator will find it.
- `pnpm format:check && pnpm lint && pnpm typecheck && pnpm test`

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

## Related Docs

- [plugin-database.md](../plugin-database.md)
- [self-hosting.md — Backup & restore, upgrade](../self-hosting.md)
- [upgrade.md](../upgrade.md)

## Cross-references

- Per-plugin database (epic task 3.13) is also tracked in [Plugins Runtime](plugins-runtime.md).
- User data deletion (epic task 1.7) is also tracked in [Users & Auth](users-auth.md) (it extends `sdk.portability`).
- Security hardening Tier 0+1 is tracked in [Platform Shell](platform-shell.md) (no crypto machinery in v1).
- Sovereign Wallet (Epic 21) is the first planned consumer of client-side encryption.
