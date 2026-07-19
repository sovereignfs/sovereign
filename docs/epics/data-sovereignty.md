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
- [RFC 0064 — Git-backed operator backups](../rfcs/0064-git-backed-operator-backups.md)
- [RFC 0068 — Export completeness hardening](../rfcs/0068-export-completeness-hardening.md)

## Related Docs

- [plugin-database.md](../plugin-database.md)
- [self-hosting.md — Backup & restore, upgrade](../self-hosting.md)
- [upgrade.md](../upgrade.md)

## Cross-references

- Per-plugin database (epic task 3.13) is also tracked in [Plugins Runtime](plugins-runtime.md).
- User data deletion (epic task 1.7) is also tracked in [Users & Auth](users-auth.md) (it extends `sdk.portability`).
- Security hardening Tier 0+1 is tracked in [Platform Shell](platform-shell.md) (no crypto machinery in v1).
- Sovereign Wallet (Epic 21) is the first planned consumer of client-side encryption.
