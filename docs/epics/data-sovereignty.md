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

#### 📋 8.4 — User data deletion

> Full entry: **[1.7]** in [users-auth.md](users-auth.md) — User data deletion.
> This task gives users the right to permanently delete all their data, with plugin handlers called via `sdk.portability.provideDelete`.

---

#### 📋 8.5 — Encryption at rest & field-level, Tier 2–4 (RFC 0008)

**Goal:** The deferred, crypto-heavy tiers of RFC 0008 / SRS §3.17 — shipped **after v1**. Tier 2 (at-rest encryption + key management), Tier 3 (field-level via `sdk.crypto`), and the charting of Tier 4 (zero-knowledge E2EE). The reserved `sdk.crypto` surface + `crypto:use` permission land as `NotImplementedError` stubs first (after RFC 0005's stubs).

**Deliverables:**

- Tier 2: local-keyfile envelope key management (master KEK → wrapped DEKs; fail-fast when enabled); SQLCipher DB encryption (`better-sqlite3-multiple-ciphers`); encrypted backups (amends Task 0.5.13) + encrypted export bundles (amends Task 0.5.14); avatar/blob encryption
- Tier 3: `sdk.crypto` field-level encrypt/decrypt (per-user DEK) + `crypto:use` enforcement; optional blind indexes
- Tier 4: zero-knowledge E2EE remains charted (per-plugin opt-in, aligned with the federation direction) — not built
- New env vars (`SOVEREIGN_ENCRYPTION`, key/keyfile, backup passphrase) → `.env.example` + `docs/self-hosting.md` + docs-parity; **Docker/native-dep impact** (SQLCipher in image build + `allowBuilds`)

**Dependencies:** Task 0.5.15 (Tier 0–1), Task 0.5.13 (backups), Task 0.5.14 (exports)

**SRS reference:** RFC 0008 (Tiers 2–4), SRS §3.17, §5 (`crypto:use`), NFR-02/07/08/09

**Review checklist:**

- A stolen disk / leaked backup yields ciphertext; the docs state plainly that server-held keys do not defend against a curious operator or RCE
- Encryption is opt-in and fails fast when enabled without a key; rotation re-wraps DEKs without bulk re-encryption
- Field-level encryption is gated by `crypto:use`; encrypted columns document the search/sort caveat

---

#### 📋 8.6 — Plugin secret vault (RFC 0043)

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

#### 📋 8.7 — Plugin file storage (RFC 0044)

**Goal:** Implement `sdk.storage` as a plugin-scoped file storage surface for attachments, generated assets, imports, exports, thumbnails, and other plugin-owned binary objects.

**Deliverables:**

- Add local filesystem-backed storage under the Sovereign data directory.
- Add SDK methods for put/get/delete/list or equivalent object operations.
- Add metadata tables for ownership, plugin ID, user ID, content type, size, and lifecycle state.
- Add signed/authorized serving routes for plugin-owned files.
- Integrate storage with user data export/import and deletion.
- Define quotas and upload limits.
- Keep the API backend-neutral so object-store support can be added later.

**Dependencies:** Task 8.2 (portability), Task 8.4/1.7 (deletion), Task 8.5 (future encryption).

**SRS reference:** [RFC 0044](../rfcs/0044-plugin-storage.md)

**Review checklist:**

- A plugin can store and serve a user-owned file without writing ad hoc paths.
- Storage objects are deleted when user data deletion runs.
- Export includes storage metadata and file payloads according to the accepted format.
- Access checks prevent one plugin/user from reading another plugin/user's objects.

---

#### 📋 8.8 — Plugin portability hooks (RFC 0052)

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

## Related RFCs

- [RFC 0006 — Deployment & upgrade strategy](../rfcs/0006-deployment-upgrade-strategy.md)
- [RFC 0007 — User data portability](../rfcs/0007-user-data-portability.md)
- [RFC 0004 — Per-plugin database](../rfcs/0004-per-plugin-database.md)
- [RFC 0033 — User data deletion](../rfcs/0033-user-data-deletion.md)
- [RFC 0008 — Security & encryption architecture](../rfcs/0008-security-encryption-architecture.md)
- [RFC 0043 — Plugin secret vault](../rfcs/0043-plugin-secret-vault.md)
- [RFC 0044 — Plugin file storage](../rfcs/0044-plugin-storage.md)
- [RFC 0052 — Plugin portability hooks](../rfcs/0052-plugin-portability-hooks.md)

## Related Docs

- [plugin-database.md](../plugin-database.md)
- [self-hosting.md — Backup & restore, upgrade](../self-hosting.md)
- [upgrade.md](../upgrade.md)

## Cross-references

- Per-plugin database (epic task 3.13) is also tracked in [Plugins Runtime](plugins-runtime.md).
- User data deletion (epic task 1.7) is also tracked in [Users & Auth](users-auth.md) (it extends `sdk.portability`).
- Security hardening Tier 0+1 is tracked in [Platform Shell](platform-shell.md) (no crypto machinery in v1).
