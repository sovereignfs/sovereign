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
