---
docSection: operators
docType: guide
audiences:
  - operator
  - app-developer
---

# Upgrade guide

Migration notes for breaking changes and release-by-release upgrade steps.

Per NFR-04, any breaking change to a published package (`@sovereignfs/sdk`,
`@sovereignfs/ui`) ships with at least a minor version bump and an entry here.
Operators upgrading a self-hosted instance should read the Platform releases
section; plugin developers should read the Published package migrations section.

---

## Upgrade procedure (Docker Compose)

This is the standard path for all production upgrades.

### 1. Back up data

Always snapshot before upgrading. On a running instance:

**Docker Compose (production) — back up the named volume.** The prod stack
stores data in the `sovereign_data` named volume, not on the host, so snapshot
the volume directly:

```bash
docker run --rm \
  -v sovereign_data:/data \
  -v "$(pwd)/backups":/backup \
  alpine \
  tar czf /backup/sovereign-backup-$(date +%Y%m%dT%H%M%S).tar.gz -C /data .
```

**Source / host install — use the CLI.** When the databases live in a host
`./data` directory (dev, bind-mount, or a non-Docker host install), `sv backup`
snapshots them (it reads `DATABASE_URL` from the environment):

```bash
pnpm sv backup
```

Either way the archive contains all SQLite databases (with their `-wal`/`-shm`
sidecars) and the `avatars/` directory, stored with paths relative to the data
directory so it restores into any location.

### 2. Apply the upgrade

**Published images** (recommended — no build step):

```bash
# Pin the exact release you are upgrading to.
SOVEREIGN_VERSION=v0.15.0 docker compose -f docker-compose.prod.yml pull
SOVEREIGN_VERSION=v0.15.0 docker compose -f docker-compose.prod.yml up -d
```

**Build from source** (forks, air-gapped environments, custom patches):

```bash
git pull
docker compose -f docker-compose.prod.yml up --build -d
```

Database migrations run automatically on startup via `runMigrations()` in
`packages/db`. The server is fail-fast: a migration error prevents the
runtime from accepting requests, leaving the pre-upgrade snapshot intact.

### 3. Verify

```bash
# Check health — includes platform version and any downgrade warning.
curl -s -H "Authorization: Bearer $SOVEREIGN_ADMIN_KEY" \
  http://localhost:4000/api/admin/health | jq .
```

A successful upgrade shows the new `platformVersion`. A `downgradeWarning`
field means the database was last written by a newer binary — stop, restore
your backup, then re-apply the correct image.

### Rollback

If the upgraded instance is unhealthy:

```bash
# 1. Stop the upgraded containers.
docker compose -f docker-compose.prod.yml down

# 2. Restore the pre-upgrade backup into the named volume (mirror of the backup
#    command — overwrites the volume contents from the archive).
docker run --rm \
  -v sovereign_data:/data \
  -v "$(pwd)/backups":/backup \
  alpine \
  sh -c 'rm -rf /data/* && tar xzf /backup/<archive>.tar.gz -C /data'

# 3. Start the previous image.
SOVEREIGN_VERSION=<previous-version> docker compose -f docker-compose.prod.yml up -d
```

(For a source / host install, use `pnpm sv restore ./backups/<archive>.tar.gz`
instead of the volume command.)

For published images, `SOVEREIGN_VERSION` pins the exact tag to restart from.
For source builds, `git checkout <previous-commit>` before rebuilding.

---

## Platform releases

Version numbers in the sections below refer to the **`runtime` package version**
(`runtime/package.json`), not the root `package.json`. The root `package.json`
tracks roadmap phase milestones and will jump to `1.0.0` at the public release.
See the [Runtime version map](#runtime-version-map) and [v1.0.0 release checklist](#v100-release-checklist) at the end of this file.

Notes call out any required configuration changes, schema changes, or action required.

### v0.53 → v0.54

- **Public plugin page routes (RFC 0042) — epic task 2.14 done.** New optional
  manifest `publicRoutes` field lets a plugin exempt a path prefix (relative
  to its own `routePrefix`) from the platform's session-redirect gate — for
  shared documents, published read-only views, or token-protected previews.
  The plugin itself is responsible for authorizing every request under a
  public route and must fail closed (404) for anything invalid, expired, or
  unknown. Disabled-plugin and paywall gates still apply: a monetized
  plugin's public routes block anonymous access by default (there is no
  `paywallExempt` escape hatch). **No action required** — purely additive;
  plugins that don't declare `publicRoutes` are unaffected.
- **`runtime` → 0.54.0**, **`@sovereignfs/manifest` → 0.22.0**.

### v0.42 → v0.43

- **Cross-plugin references and dependency discovery (RFC 0051) — epic task
  3.20 done.** New `sdk.plugins.get(id)` / `sdk.plugins.list(filter?)` return
  `PluginAvailability` (install/enable status folded with the current user's
  disabled/adminOnly/paywall gates) so a plugin can check an optional sibling
  before offering an integration. `sdk.plugins.getConsentStatus(ref)` checks a
  data-contract consent grant without a full `sdk.data.query()` call. New
  `PluginReference` type defines the standard opaque-link shape (`providerId`,
  `resourceType`, `resourceId`, `contract?`, `version?`, `labelSnapshot?`,
  `metadata?`, `linkedAt`) for a plugin to store a pointer to another plugin's
  record without a cross-plugin foreign key. **No action required** — purely
  additive SDK surface, no schema change.
- **New optional manifest `integrations.optional` field** — informational
  sibling-plugin metadata for install/discovery UX (Console, Account, plugin
  UI hints). Declaring one grants nothing by itself; never an install blocker.
- **Plugin portability export metadata (RFC 0052) complete — epic task 8.8
  done.** `PluginExportSection` gains `references?: PluginReference[]`,
  carried through export and import as **inert metadata only** — the platform
  never dereferences them; importing a reference never grants access to the
  provider plugin. This was the last outstanding RFC 0052 deliverable (the
  rest shipped in the v0.41 → v0.42 entry below).
- **`runtime` → 0.43.0**, **`@sovereignfs/sdk` → 1.25.0**,
  **`@sovereignfs/manifest` → 0.20.0**.

### v0.41 → v0.42

- **Plugin portability export metadata (RFC 0052, partial).** `PluginExportSection`
  gains `pluginVersion` (always overwritten by the runtime from the installed
  manifest — a resolver cannot misreport it), `secretMetadata` (per-plugin
  secret metadata, never plaintext values), and `warnings`. `ExportContext`
  gains `options: { includeFiles }` so a resolver can honor the user's choice
  to skip large attachments. All additive — existing resolvers that don't read
  these fields are unaffected.
- **Account → Data export gains an "include files and attachments" toggle**
  (`?includeFiles=false` on `GET /api/account/export`), and a throwing plugin
  exporter no longer aborts the whole export — it's excluded and recorded in
  the bundle manifest's new `failures` list.
- **Not yet implemented**: cross-plugin reference preservation in exports
  (depends on RFC 0051, still unimplemented) — the remaining piece of RFC 0052.
- **`runtime` → 0.42.0**, **`@sovereignfs/sdk` → 1.24.0**,
  **`plugins/account` → 0.17.0**.

### v0.40 → v0.41

- **Client-side encryption core complete, steps 6 of 7 (RFC 0060) — epic task
  8.9 done.** Account export now includes a user's encryption profile,
  recovery wrapper, and active device enrollments (still wrapped ciphertext
  and non-sensitive KDF/algorithm metadata only — never plaintext). Account
  deletion already removed this data unconditionally; export was the missing
  half. **No action required** — no schema change, existing `e2ee_*` tables
  and DB helper functions were reused as-is.
- **Import is additive-safe, never destructive.** If the importing user
  already has an encryption profile on this instance, imported e2ee data is
  silently skipped rather than overwriting a live setup that might not
  correspond to the same Client Master Key.
- **No `sdk.storage`/`sdk.portability` API change.** Plugin-owned encrypted
  objects (e.g. a future Sovereign Wallet document) already compose through
  each plugin's own export/import handlers calling `sdk.storage` directly —
  documented in `docs/plugin-development.md`, no new platform mechanism
  needed.
- **`docs/security.md` corrected** — it previously described client-side
  encryption as "post-v1 (charted)"; it's implemented and opt-in as of this
  release.
- **`runtime` → 0.41.0**. No SDK/db/manifest version change — this task only
  touched the platform's internal export/import wiring
  (`runtime/src/portability/`), not any published package's contract.

### v0.39 → v0.40

- **Client-side encryption core, steps 1–5 of 7 (RFC 0060).** New `sdk.e2ee`
  persistence surface (profile/recovery-wrapper/device-enrollment plumbing)
  and a new Account → Security section for setup, recovery-secret unlock, and
  device enrollment/revocation. Three new platform tables (`e2ee_profiles`,
  `e2ee_recovery_wrappers`, `e2ee_device_enrollments`) auto-create via the
  existing bootstrap DDL path — **no action required**. All CMK/DEK
  generation, wrap/unwrap, and object encryption happens in the browser
  (WebCrypto); the server only ever stores wrapped ciphertext and
  non-sensitive KDF/algorithm metadata, never plaintext key material.
- **New optional `e2ee:use` manifest permission**, reserved for a future
  plugin consumer (not yet declared by any first-party plugin).
- **`@sovereignfs/sdk` gains `sdk.e2ee.*`** plus browser-only helpers across
  four subpaths: `generateCmk`/`wrapCmkWithRecoverySecret`/etc.
  (`e2ee-crypto`, also `generateDek`/`wrapDekWithCmk`/`unwrapDekWithCmk` for
  per-object keys), `getOrCreateDeviceId`/`storeDeviceKey`/etc.
  (`e2ee-device`), `encryptBlob`/`decryptBlob`/`encryptJson`/`decryptJson`
  (`e2ee-object`), and `getE2eeLocalState` for normalized locked/unlocked
  state detection (`e2ee-state`). Additive, experimental tier — no existing
  SDK surface changed.
- **`sdk.storage` integrated with client-side encryption (step 5).** No
  dedicated storage method was needed — `StorageObject.metadata` (see the
  `@sovereignfs/sdk` 1.22.0 → 1.23.0 migration note below) is where an
  encrypted object's wrapped DEK and algorithm version travel alongside its
  ciphertext.
- **Not yet implemented**: export/delete hook integration — the final step of
  the same RFC 0060 adoption path.
- **`runtime` → 0.40.1**, **`@sovereignfs/sdk` → 1.23.0**,
  **`@sovereignfs/db` → 1.10.2**, **`@sovereignfs/manifest` → 0.19.0**,
  **`plugins/account` → 0.16.1**. `db` 1.10.2 adds a missing unique index on
  `(tenant_id, user_id)` for `e2ee_profiles`/`e2ee_recovery_wrappers`
  (migration `0013`) — the initial `0012` migration created the tables
  without it, so the recovery-wrapper
  upsert's `ON CONFLICT` clause had no matching constraint to target and
  threw on first use.

### v0.37 → v0.38

- **Plugin background schedules — Phase 1 (RFC 0046).** Plugins can now declare
  recurring server-side jobs (manifest `schedules`) that the runtime invokes
  in-process on a 60-second tick, independent of any browser request. **No
  action required** — the scheduler starts automatically at boot and is a
  no-op when no installed plugin declares a schedule.
- **New optional `SOVEREIGN_SCHEDULER_DISABLED` env var.** Set to `1` to stop
  the runtime invoking plugin schedules — a kill-switch for debugging a
  misbehaving plugin job. Unset (default) = scheduler runs. See
  [`docs/self-hosting.md`](self-hosting.md#environment-variables).
- **`@sovereignfs/sdk` gains `ScheduleContext`/`ScheduleHandler` types.**
  Additive, experimental tier — no existing SDK surface changed.
- **No database schema change** at the platform layer. Individual plugins
  that adopt `schedules` may ship their own migrations (e.g.
  `sovereign-tasks` 0.11.0's `tasks_notification_prefs` table).
- **`runtime` → 0.38.0**, **`@sovereignfs/manifest` → 0.18.0**,
  **`@sovereignfs/sdk` → 1.18.0**.

### v0.27 → v0.28

- **White-labeling Phase 1 (RFC 0027).** Operators can now set a brand name,
  primary colour, logo, and favicon via Console → Settings → Branding. A new
  `tenant_branding` table is created by the Drizzle migration automatically on
  startup — **no manual step required**.
- **`sdk.platform.getConfig()` gains `brandName` and `brandPrimaryColor?`.**
  Existing calls are unaffected; the fields are additive.
- **Three new `--sv-brand-*` CSS tokens** (`--sv-brand-logo`,
  `--sv-brand-logo-dark`, `--sv-brand-favicon`) are set at `:root` by
  `BrandProvider` and are available in plugin CSS without any import.
- **Seven new optional `BRAND_*` env vars** control deployment-level brand
  defaults. All are optional; Sovereign defaults apply when unset. See
  [`docs/self-hosting.md`](self-hosting.md#environment-variables).
- **`runtime` → 0.28.0**, **`@sovereignfs/db` → 1.6.0**,
  **`@sovereignfs/sdk` → 1.10.0**, **`@sovereignfs/ui` → 0.10.0**,
  **`plugins/console` → 0.12.0**.

### v0.26 → v0.27

- **Production dev-mode & diagnostics (RFC 0020).** A request-scoped dev-mode
  switch (`SOVEREIGN_DEV_MODE_ENABLED=true`) routes SDK DB calls to a mock
  database for a single request when the correct `X-Sovereign-Dev-Mode-Secret`
  header is present. Real requests are completely unaffected. Off by default.
- **Structured logging.** `LOG_LEVEL` (error/warn/info/debug; default `warn`)
  controls a newline-delimited JSON logger to stdout. No egress.
- **Richer `/api/admin/health`.** Now includes `database.migrationVersion`,
  `plugins.installed`/`adminOnly`, and `diagnostics.{logLevel, devModeEnabled}`.
- **Four new optional env vars:** `LOG_LEVEL`, `SOVEREIGN_DEV_MODE_ENABLED`,
  `SOVEREIGN_DEV_MODE_SECRET`, `SOVEREIGN_DEV_DATABASE_URL`. All documented in
  `.env.example` and `docs/self-hosting.md`.
- **`runtime` → 0.27.0**.

### v0.25 → v0.26

- **Per-plugin isolated databases (RFC 0004).** Plugins can now opt into a dedicated
  database by setting `"database": "isolated"` in their manifest. This is **entirely
  opt-in** — existing `shared` plugins (the default) are completely unaffected and
  require no changes.
- **No action required for operators.** The `data/plugins/` directory is created
  automatically when the first isolated plugin provisions its store. It is included in
  `sv backup` archives automatically. Nothing in the existing platform schema changes.
- **Plugin authors adopting `isolated`:** set `"database": "isolated"` in your
  `manifest.json`, create `plugins/<id>/migrations/sqlite/` and
  `plugins/<id>/migrations/postgres/` directories for your Drizzle migration files, and
  remove the slug prefix from your table names (optional but recommended — you have your
  own namespace). `sdk.db.getClient()` call sites need no changes.
- **`sv plugin remove` now drops the store.** When removing an isolated plugin,
  `sv plugin remove <id>` deletes the store (SQLite file or Postgres schema). Pass
  `--keep-data` to retain the store for manual inspection or migration.
- **`@sovereignfs/db` → 1.5.0** (minor — new `plugin-client.ts` with `getPluginDb`,
  `provisionPluginDb`, `dropPluginDb`, `pluginMigrationsFolder`; `runPluginMigrations`
  added to migrate module).
- **`@sovereignfs/sdk` → 1.9.0** (minor — `sdk.db.getClient()` now routes isolated
  plugins to their dedicated store transparently; `SdkHost.db.getClient` signature change
  is internal only).
- **`runtime` → 0.26.0** (minor — SDK host routes isolated plugins; startup runs
  per-plugin migrations).

See [`docs/plugin-database.md`](plugin-database.md) for the full reference.

### v0.24 → v0.25

- **Plugin monetization (RFC 0003).** Plugin authors can now declare a `monetization`
  field in `manifest.json` to gate access with signed Ed25519 license tokens. A new
  `entitlements` table is created by the Drizzle migration automatically on startup —
  **no manual schema change required**.
- **No action required for most operators.** Plugins without a `monetization` field
  (or with `model: "free"`) are completely unaffected. Monetization is opt-in by plugin
  authors.
- **Users with a paid plugin:** if a user lacks an entitlement for a plugin, they are
  redirected to the plugin's paywall page (`/paywall/<pluginId>`) where they can paste
  a signed license token obtained from the plugin author. Once imported, access is
  granted immediately without restart. Users can manage their licenses in
  Account → Billing.
- **Admins:** Console → Entitlements shows all entitlements across all users. Admin
  key-authenticated `GET /api/admin/entitlements` returns the full list or (with
  `?userId=`) the set of paywalled plugin IDs for a specific user (used by the
  middleware).
- **No Stripe / payment gateway required in v1.** The platform implements only the
  offline Ed25519 license-token model (manual flow). Webhook integration with Stripe
  or other gateways is a post-v1 concern; plugin authors who want automated
  billing today can build their own webhook handler.
- **`@sovereignfs/db` → 1.3.0** (minor — `entitlements` table + 7 helper functions).
- **`@sovereignfs/sdk` → 1.8.0** (minor — `sdk.billing` stub: `getEntitlement()` and
  `requireEntitlement()` exported; `EntitlementRequiredError` exported).
- **`@sovereignfs/manifest` → 0.14.0** (minor — `monetization` manifest field).

### v0.23 → v0.24

- **Web Push notifications (RFC 0016).** Background push delivery for the in-app inbox.
  A new `push_subscriptions` table is created by the Drizzle migration automatically on
  startup — **no manual schema change required**.
- **No action required for most operators.** Push is opt-in and silently disabled when
  VAPID keys are absent. The in-app bell continues to work without any configuration.
- **To enable push:** generate a VAPID key pair once per deployment and add to `.env`:
  ```bash
  npx web-push generate-vapid-keys
  # then add to .env:
  # VAPID_PUBLIC_KEY=<base64url public key>
  # VAPID_PRIVATE_KEY=<base64url private key>
  # VAPID_CONTACT=mailto:admin@example.com
  ```
  Users then opt in per-device via Account → Notifications → "Enable push notifications".
  Push respects per-user muted-category preferences (set in Account → Notifications).
- **Stale subscriptions are pruned automatically.** When a push service returns `410 Gone`
  (device unregistered or browser cleared), the subscription is deleted from the DB.
- **`@sovereignfs/db` → 1.2.0** (minor — `push_subscriptions` table + 6 helper functions).

### v0.22 → v0.23

- **Notification Center (RFC 0015).** In-app per-user notifications with a bell icon in the
  chrome, polling-based delivery (default 30s), and SSE streaming. Two new platform tables
  (`notifications`, `notification_prefs`) are added by the Drizzle migration automatically
  on startup.
- **No action required for operators.** The migration runs automatically. Existing plugins
  continue to work without changes.
- **Plugin authors:** to send notifications, add `"notifications:send"` to your manifest
  `permissions` and call `sdk.notifications.send(input, await headers())`. See
  `docs/plugin-development.md` for the full API.
- **Admin broadcast:** `POST /api/admin/broadcast` (admin key required) sends announcements
  to one or more users; rate-limited to once per 60 seconds.
- **`@sovereignfs/db` → 1.1.0** (minor — new tables and helper functions).
- **`@sovereignfs/sdk` → 1.7.0** (minor — `sdk.notifications` promoted from
  `NotImplementedError` stub to a working implementation; `SendNotificationInput` type
  exported).
- **`@sovereignfs/ui` → 0.9.0** (minor — `Toast`/`ToastProvider`/`useToast` exported).

### v0.21 → v0.22

- **Plugin-declared capabilities (RFC 0022).** Plugins may now declare a
  `capabilities` field in `manifest.json` to express fine-grained, namespaced
  permissions (e.g. `my-plugin:create-item`). This is an additive manifest
  change — existing manifests without a `capabilities` field are unaffected.
- **No action required for operators.** The platform automatically injects
  capabilities declared with `defaultGrant: "all"` into every authenticated
  session. Plugin authors who want to adopt the feature should see the new
  `### capabilities (RFC 0022)` section in `docs/plugin-development.md`.
- **`@sovereignfs/manifest` → 0.13.0** (minor, no breaking changes). The
  internal manifest schema adds the optional `capabilities` field and exports a
  new `pluginCapabilityName(pluginId, capName)` helper.

### v0.20 → v0.21

- **Platform roles expanded to four (RFC 0021).** The `platform:admin` role is
  preserved; two new roles are added: `platform:owner` (full privileges, including
  `role:assign`) and `platform:auditor` (read-only Console access).
- **Automatic migration:** on first startup after upgrading, the auth server
  promotes the oldest `platform:admin` user to `platform:owner` if no owner
  exists yet. No manual action required.
- **Existing `platform:admin` users retain all their current capabilities.**
  The admin preset loses only `role:assign` (the ability to assign roles), which
  is now owner-exclusive. If you need role assignment to remain with an existing
  admin, promote them to owner via Console → Users.
- **`platform:owner` is protected:** the owner's role and account active state
  cannot be changed via the admin API. Use Console → Users (as the owner) or
  the `sv user reset-mfa` CLI for break-glass operations.
- **SDK `@sovereignfs/sdk` 1.6.0:** `SessionUser` gains `capabilities`, and
  `sdk.auth.hasCapability(session, cap)` is added. Plugin authors can use this
  instead of checking `user.role` directly. Both are backward-compatible
  additive additions.

### v0.18 → v0.19

- **Mobile responsiveness & PWA hardening (RFC 0013).** The shell's mobile footer
  is replaced by a single "Apps" Drawer button; the header gains an
  `ActivePluginTitle`; Console moves into the avatar menu on mobile. Dialog
  top-inset (`--sv-dialog-inset-top`) keeps the header visible above overlay
  sheets. Unified breakpoint at 768 px; `100dvh` throughout; safe-area insets;
  44 px touch targets; `viewport-fit=cover` + immersive iOS status bar.
- **New `Drawer` UI primitive** added to `@sovereignfs/ui` (bottom-sheet, focus
  trap, safe-area-aware).
- **PWA manifest polish:** `display_override`, `orientation: "any"`,
  `categories: ["productivity"]`, `shortcuts` (Launcher + Account).
- **No operator action required.** All changes are in the shell UI.
- **`runtime` → 0.19.0**, **`@sovereignfs/ui` → 0.6.0**.

### v0.17 → v0.18

- **Minimal shell mode (RFC 0014).** A `shell: "minimal"` manifest value now
  composes plugins into a chrome-free route group (`(minimal)/`). Previously
  `shell: "minimal"` failed the build. Minimal plugins can be used as the root
  plugin for kiosk use cases.
- **No operator action required.** Existing plugins are unaffected. The new route
  group is entirely generated and gitignored.
- **`runtime` → 0.18.0**.

### v0.16 → v0.17

- **Plugin-scoped environment variables (RFC 0018).** Plugins may now declare an
  `env` map in `manifest.json`; keys are auto-namespaced to
  `SV_PLUGIN_<SLUG>_<KEY>` (runtime) or `NEXT_PUBLIC_SV_PLUGIN_<SLUG>_<KEY>`
  (build). `sdk.env.get('KEY')` reads only the calling plugin's own vars.
- **No operator action required.** The feature is opt-in by plugin authors.
  Plugin-declared secrets must be supplied at runtime via the namespaced env var.
- **`runtime` → 0.17.0**, **`@sovereignfs/sdk` → 1.5.0**,
  **`@sovereignfs/manifest` → 0.12.0**.

### v0.15 → v0.16

- **User data portability (RFC 0007).** Users can export all their data as a
  versioned ZIP (Account → Data → Export) and import it on another instance.
  Plugin participation is opt-in via `sdk.portability.provideExport` /
  `provideImport` and the `data:export` / `data:import` manifest permissions.
- **No operator action required.** Export/import routes are session-gated. The
  50 MB import cap is enforced by the server.
- **`runtime` → 0.16.0**, **`@sovereignfs/sdk` → 1.4.0**,
  **`@sovereignfs/manifest` → 0.11.0**, **`plugins/account` → 0.5.0**.

### v0.19 → v0.20

- **TOTP and passkey MFA available.** No configuration is required for existing
  deployments — MFA is opt-in per user. The `twoFactor` and `passkey` tables
  are created automatically by better-auth on first startup.
- **Three new optional env vars** (all have safe defaults for `localhost`):
  - `AUTH_WEBAUTHN_RP_ID` — defaults to the hostname of `AUTH_BASE_URL`.
  - `AUTH_WEBAUTHN_RP_NAME` — defaults to `Sovereign`.
  - `AUTH_WEBAUTHN_ORIGIN` — defaults to `SOVEREIGN_AUTH_PUBLIC_URL` or `AUTH_BASE_URL`.

  **Production deployments must set these** — the defaults will not work when
  your instance runs on a real domain. See
  [self-hosting.md — Two-factor authentication](self-hosting.md#two-factor-authentication-mfa)
  for the correct values and the `rpID` constraint.

- **`sv user reset-mfa <email>`** — new CLI break-glass command. Clears TOTP
  secrets and passkeys for a user directly in the SQLite auth database (no
  running server required). For Postgres instances, use Console → Users →
  Reset MFA instead.
- No database migration required — better-auth creates the `twoFactor` and
  `passkey` tables at startup via its own DDL.

### v0.13 → v0.14

- **Activity log (RFC 0005).** The `activity_log` table records platform and plugin
  actions. `sdk.activity.log()` is now implemented (no longer a stub). Personal
  activity appears in Account → Activity; platform-wide history is in Console →
  Activity. The migration runs automatically on startup.
- **Icon system (RFC 0011).** `@sovereignfs/ui` exports an `<Icon>` component
  backed by curated Lucide SVG icons. Plugin manifest `icon.svg` files are served
  from `/plugin-icons/<id>.svg`. Chrome monograms and emoji replaced with icons.
- **No operator action required.** All changes are additive.
- **`runtime` → 0.14.0** (`0.14.1` for icon system), **`@sovereignfs/db` → 0.9.0**,
  **`@sovereignfs/sdk` → 1.3.0**, **`@sovereignfs/ui` → 0.5.0**,
  **`plugins/account` → 0.4.0**, **`plugins/console` → 0.5.0**.

### v0.12 → v0.13

- **Cross-plugin data sharing (RFC 0002).** Provider plugins can call
  `sdk.data.provide(contract, resolver)`; consumer plugins call
  `sdk.data.query(ref, params)`. Consent is managed by users in Account → Data.
  Two new tables (`consent_grants`, `data_access_log`) are created by migration
  on startup.
- **Manifest:** optional `data.provides[]` / `data.consumes[]` fields;
  `data:provide` and `data:consume` permissions promoted from reserved to active.
- **No operator action required.** The feature is entirely opt-in by plugin authors.
- **`runtime` → 0.13.0**, **`@sovereignfs/db` → 0.8.0**,
  **`@sovereignfs/sdk` → 1.2.0**, **`@sovereignfs/manifest` → 0.10.0**,
  **`plugins/account` → 0.3.0**.

### v0.11 → v0.12

- **Plugin compatibility & versioning (RFC 0024).** The dormant `schemaVersion`
  and `compatibility.minPlatformVersion` fields in `manifest.json` are now
  enforced. An incompatible plugin is rejected at `sv plugin add`, at build, and
  is disabled at boot (not bricked). An advisory `maxPlatformVersion` generates a
  warning. Console shows an "Incompatible" badge; `/api/admin/health` lists
  incompatible plugins.
- **No operator action required.** Existing plugins without a `compatibility` field
  are unaffected. Platform plugins ship with appropriate `minPlatformVersion`.
- **`runtime` → 0.12.0**, **`@sovereignfs/manifest` → 0.9.0**.

### v0.10 → v0.11

- **SDK distribution & plugin isolation boundary (RFC 0023).** `@sovereignfs/sdk`
  now has zero runtime dependencies. Implementations are host-provided by the
  runtime at startup via `provideHost()` (`runtime/instrumentation.ts`). Outside
  the runtime, SDK calls throw "no runtime host is registered". Plugin authors can
  type-check against the published SDK without installing `@sovereignfs/db` or
  `@sovereignfs/mailer`.
- **Plugin authors:** no call-site changes needed. If you were relying on the
  SDK importing from `@sovereignfs/db` directly in a non-runtime context (e.g.
  tests), that no longer works — use mocked host registrations instead.
- **`runtime` → 0.11.0**, **`@sovereignfs/sdk` → 1.1.0**.

### v0.14 → v0.15

- **Drizzle-kit migrations replace the interim DDL bootstrap.** Platform schema
  migrations now live in `packages/db/migrations/` and are applied automatically
  at startup via `runMigrations()`. The migrations use `CREATE TABLE IF NOT EXISTS`
  throughout, so existing instances bootstrapped by earlier versions upgrade safely
  without any manual SQL.
- **`sv backup` / `sv restore`** are now available in the `bin/sv` CLI. Run
  `pnpm sv backup` before upgrading; the archive captures all SQLite databases
  and uploaded avatars.
- **Downgrade detection.** The runtime now records the running platform version
  in `platform_settings` on every startup. Starting an older binary against a
  database written by a newer binary is flagged in `GET /api/admin/health` as
  a `downgradeWarning`. Always restore a backup before downgrading.
- **Published Docker images.** Semver-tagged images are published to GHCR on
  every `v*.*.*` tag. Set `SOVEREIGN_VERSION=vX.Y.Z` in your environment to pull
  them without a local build step.
- **`AUTH_TRUSTED_ORIGINS`** (new, optional). Comma-separated list of additional
  origins that better-auth accepts for server-to-server CSRF checks. Set to
  `http://auth:3001` when `AUTH_BASE_URL` is a public domain (the Docker default
  in `docker-compose.prod.yml`).
- **`SOVEREIGN_AUTH_PUBLIC_URL`** (new, optional). Browser-facing auth URL for
  login redirects. Defaults to `SOVEREIGN_AUTH_URL`. Required if your auth
  server is not reachable from the browser on the same address used for
  internal server-to-server calls.
- **Production auth port changed from unexposed to 4001.** `docker-compose.prod.yml`
  now maps auth to `${AUTH_PORT:-4001}:3001`. Update reverse-proxy configs
  if you previously routed directly to the internal service.

### v0.4 → v0.5

- **`SOVEREIGN_ADMIN_KEY` is required** (auth + runtime). Set it in `.env` — both
  services refuse to start without it. Generate with `openssl rand -base64 32`.
- **The runtime now reads `AUTH_SECRET`** to verify sessions locally (AUTH-05).
  It must equal the auth server's `AUTH_SECRET`; since both apps load the one
  root `.env`, no action is needed unless you set a distinct `SOVEREIGN_AUTH_SECRET`.
  The provided Compose files pass `AUTH_SECRET` to the runtime service.
- **PostgreSQL is supported** as an alternative to the default SQLite — opt in
  with `DB_DIALECT=postgres` + `DATABASE_URL`/`AUTH_DATABASE_URL`, or the
  `docker-compose.postgres.yml` overlay. See [self-hosting.md](self-hosting.md#postgresql).
- No data migration is required for existing SQLite instances.

### v0.3 → v0.4

- First-class **Console** (user + plugin management), **Launcher**, and
  **Account** plugins land. No configuration changes; existing data is carried
  forward. The first registered user is the platform admin.

---

## Published package migrations

### `@sovereignfs/sdk` 1.22.0 → 1.23.0

**`StorageObject` gains a `metadata` field** (RFC 0044/0060). `sdk.storage.put()`
already accepted a `metadata` input, but it was silently dropped and never
returned by `get()`/`list()`/`put()`'s response — a bug, not an intentional
omission. It now round-trips unchanged, which is what makes `sdk.storage`
usable for encrypted objects (RFC 0060 step 5): the wrapped per-object DEK and
algorithm version travel alongside the ciphertext in this field instead of
needing a separate table.

If your own test code or a mock host implementation constructs a `StorageObject`
value directly (rather than only reading one returned by `sdk.storage`), add a
`metadata: null` (or the actual value) — TypeScript now requires it. Real
plugin code that only calls `sdk.storage.get()`/`list()`/`put()` and reads the
result needs no changes; the new field is simply present.

### `@sovereignfs/sdk` 1.1.0 → 1.2.0

**`sdk.data.provide` / `sdk.data.query` are implemented** (RFC 0002).
Plugins may now declare `data.provides[]` and `data.consumes[]` in their
manifest. No action required for existing plugins that don't use cross-plugin
data sharing.

### `@sovereignfs/sdk` 1.0.0 → 1.1.0

**Host-provided implementations (RFC 0023).** `packages/sdk` no longer imports
`@sovereignfs/db` or `@sovereignfs/mailer`. Implementations are registered by
the runtime at startup via `provideHost()`. Plugins never call `provideHost()`.

If you were importing `@sovereignfs/sdk` in a non-runtime context and relying on
the direct DB/mailer imports for testing — those no longer exist. Use mocked host
registrations or test via the runtime instead.

### `@sovereignfs/sdk` 0.6.0 → 0.7.0

### `sdk.db.getClient()` is now implemented and async

`sdk.db.getClient()` previously threw `NotImplementedError`. It now returns the
platform's Drizzle client wrapped in a `Promise`:

```ts
// Before:
const db = sdk.db.getClient(); // threw NotImplementedError

// After:
const db = await sdk.db.getClient();
```

### `@sovereignfs/sdk` 0.5.0 → 0.6.0

### `sdk.platform.getConfig()` is now async

```ts
// Before:
const config = sdk.platform.getConfig();

// After:
const config = await sdk.platform.getConfig();
```

The returned `PlatformConfig` shape is unchanged.

### `@sovereignfs/sdk` 1.9.0 → 1.10.0 (White-labeling Phase 1, RFC 0027)

**`sdk.platform.getConfig()` gains branding fields.** `PlatformConfig` now
includes two new optional fields:

```ts
interface PlatformConfig {
  tenantName: string;
  inviteOnly: boolean;
  version: string;
  brandName: string; // ← new; falls back to tenantName
  brandPrimaryColor?: string; // ← new; validated hex or undefined
}
```

Existing calls are unaffected — the new fields are additive.

**New `--sv-brand-*` CSS tokens** (`--sv-brand-logo`, `--sv-brand-logo-dark`,
`--sv-brand-favicon`) are set at `:root` by `BrandProvider` and are available
in plugin CSS without any import.

---

### Platform 0.28 → 0.29 (`@sovereignfs/ui` 0.10.0 → 0.11.0, `@sovereignfs/sdk` 1.10.0 → 1.11.0, Instance identity rename, RFC 0032)

**Breaking: `--sv-brand-*` CSS tokens renamed to `--sv-instance-*`.** Update any plugin CSS that references these tokens:

```css
/* Before */
background-image: var(--sv-brand-logo);

/* After */
background-image: var(--sv-instance-logo);
```

**Breaking: `PlatformConfig.brandName` and `brandPrimaryColor` renamed.** Update calls to `sdk.platform.getConfig()`:

```ts
// Before
const { brandName, brandPrimaryColor } = await sdk.platform.getConfig();

// After
const { instanceName, instancePrimaryColor } = await sdk.platform.getConfig();
```

**Breaking: `BRAND_*` environment variables renamed to `INSTANCE_*`.** Update your `.env` or Compose env block:

```
BRAND_NAME            → INSTANCE_NAME
BRAND_LOGO            → INSTANCE_LOGO
BRAND_LOGO_DARK       → INSTANCE_LOGO_DARK
BRAND_FAVICON         → INSTANCE_FAVICON
BRAND_PRIMARY_COLOR   → INSTANCE_PRIMARY_COLOR
BRAND_EMAIL_FROM_NAME → INSTANCE_EMAIL_FROM_NAME
BRAND_EMAIL_LOGO      → INSTANCE_EMAIL_LOGO
```

**`/api/brand/*` routes renamed to `/api/instance/*`.** If any external system fetches these routes directly, update those references.

The database migration (`0005_rename_tenant_branding`) runs automatically at startup — no manual SQL required.

---

### Platform 0.9.0 → 0.9.1 (`@sovereignfs/sdk` 1.11.0 → 1.12.0, User data deletion, RFC 0033)

**New: `sdk.portability.provideDelete(handler)` — account deletion hook.**
Plugin authors should register a deletion handler to clean up per-user rows when
a user account is deleted. Plugins without a handler will have their rows left in
place (operator responsibility).

```ts
// In a plugin route or Server Component:
import { sdk } from '@sovereignfs/sdk';

await sdk.portability.provideDelete(async ({ userId, db }) => {
  // delete all rows belonging to this user from your plugin's tables
  const deleted = await myCleanupFn(db, userId);
  return { deleted };
});
```

**New: `DELETE /api/account`** — users can now delete their own account from
Account → Data. Requires password re-verification. Returns 409 if the user is
the sole `platform:owner`. On success, clears session cookies.

**New: `DELETE /api/admin/users/[id]?deleteData=true`** — admins can delete a
user and all their data from Console → Users. Requires `user:manage` capability.
Cannot target a `platform:owner`.

No database migrations required — deletion removes existing rows.

### `@sovereignfs/ui` 0.22.0 → 0.23.0

**Breaking: `FormField` children is now a render prop.** The previous API
computed `aria-describedby` but applied it to a wrapper `<div>` around the
child, not the actual control, so screen readers didn't reliably announce
hints/errors. `FormField` now passes the id/aria wiring to the control itself
via a render-prop `children`, and generates its own `id` when one isn't
provided:

```tsx
// Before
<FormField label="Email" htmlFor="email">
  <Input id="email" type="email" />
</FormField>

// After
<FormField label="Email" id="email">
  {(field) => <Input {...field} type="email" />}
</FormField>

// id is optional — FormField generates one via useId() if omitted:
<FormField label="Email">{(field) => <Input {...field} type="email" />}</FormField>
```

`field` is `{ id, 'aria-describedby'?, 'aria-invalid'?, required? }` — spread
it directly onto any `@sovereignfs/ui` form control or a native element.

**New: `Textarea` component** — additive, no migration required.

---

## Runtime version map

Maps the `runtime` package version at which each major capability was added.
The section headings above correspond to these runtime version transitions.
`SOVEREIGN_VERSION` in Compose files should match the runtime version for
the release you are running.

| Runtime version | Key capability delivered                                                                                             |
| --------------- | -------------------------------------------------------------------------------------------------------------------- |
| 0.2.0           | Platform DB (tenant_settings, root plugin config), Console settings                                                  |
| 0.3.0           | Launcher plugin, root-plugin-in-place rewrite                                                                        |
| 0.4.0           | Account plugin (profile + preferences)                                                                               |
| 0.5.0           | Plugin install script, PWA configuration                                                                             |
| 0.6.0           | Local session verification (cookie-cache, AUTH-05)                                                                   |
| 0.7.0           | Public `/api` namespace delegation (PLT-16)                                                                          |
| 0.8.0–0.9.1     | Overlay shell mode (RFC 0001), Dialog UI primitive                                                                   |
| 0.9.0           | Logout / self sign-out (AUTH-02)                                                                                     |
| 0.10.0          | Security hardening Tier 0 + Tier 1 (RFC 0008)                                                                        |
| 0.11.0          | SDK distribution (RFC 0023), zero-dep published SDK                                                                  |
| 0.12.0          | Plugin compatibility & versioning (RFC 0024)                                                                         |
| 0.13.0          | Cross-plugin data sharing (RFC 0002)                                                                                 |
| 0.14.0–0.14.1   | Activity log (RFC 0005), icon system (RFC 0011)                                                                      |
| 0.15.0          | Drizzle-kit migrations, `sv backup`/`restore`, downgrade guard (RFC 0006)                                            |
| 0.16.0          | User data portability (RFC 0007)                                                                                     |
| 0.17.0          | Plugin-scoped env vars (RFC 0018)                                                                                    |
| 0.18.0          | Minimal shell mode (RFC 0014)                                                                                        |
| 0.19.0          | Mobile responsiveness & PWA hardening (RFC 0013)                                                                     |
| 0.20.0          | Passkeys & TOTP MFA (RFC 0012), offline connectivity banner                                                          |
| 0.21.0          | Platform roles & capabilities (RFC 0021)                                                                             |
| 0.22.0          | Notification Center (RFC 0015)                                                                                       |
| 0.23.0          | Web Push notifications (RFC 0016)                                                                                    |
| 0.25.0–0.25.1   | Plugin monetization (RFC 0003), license generator, entitlements                                                      |
| 0.26.0          | Per-plugin isolated database (RFC 0004)                                                                              |
| 0.27.0          | Production dev-mode & diagnostics (RFC 0020)                                                                         |
| 0.28.0          | White-labeling Phase 1 (RFC 0027)                                                                                    |
| 0.29.0          | Instance identity rename (RFC 0032)                                                                                  |
| 0.30.0          | User data deletion (RFC 0033)                                                                                        |
| 0.31.0          | Notification transport (RFC 0034)                                                                                    |
| 0.32.0          | Sidebar customization (epic task 2.13)                                                                               |
| 0.33.0          | Instance identity — `instanceId` field + terminology cleanup (RFC 0039)                                              |
| 0.34.0          | Platform/runtime version reconciliation chore (RFC 0057 plan status fix)                                             |
| 0.35.0          | iOS PWA launch screens (`apple-touch-startup-image`)                                                                 |
| 0.36.0          | Admin disable surface for example plugins (epic task 12.3)                                                           |
| 0.37.0          | Account and security email delivery coverage (RFC 0062, epic task 1.14)                                              |
| 0.38.0          | Plugin background schedules — Phase 1 (RFC 0046)                                                                     |
| 0.39.0          | Plugin file storage — `sdk.storage` (RFC 0044)                                                                       |
| 0.40.0–0.40.1   | Client-side encryption core, steps 1–5 — `sdk.e2ee`, Account UX, object crypto, `sdk.storage` integration (RFC 0060) |
| 0.41.0          | Client-side encryption core complete, step 6 — export/delete via `sdk.portability` (RFC 0060, epic task 8.9 done)    |
| 0.42.0          | Plugin portability export metadata, partial (RFC 0052)                                                               |
| 0.43.0          | Cross-plugin references and dependency discovery (RFC 0051); RFC 0052 complete                                       |
| 0.44.0          | Launcher grid respects saved sidebar order (epic task 2.22)                                                          |
| 0.45.0          | User groups foundation + per-user capability grants (RFC 0065/0070, epic tasks 1.15–1.16)                            |
| 0.46.0          | Plugin access policy enforcement (RFC 0065, epic task 2.21)                                                          |
| 0.47.0          | Plugin catalog and install-time activation model (RFC 0065, epic task 3.28)                                          |
| 0.48.0          | Console plugin access management (RFC 0065, epic task 13.7)                                                          |
| 0.49.0          | Console plugin catalog browser and install-time activation (RFC 0065, epic task 13.8)                                |
| 0.50.0          | Plugin invite-scope grant resolution (RFC 0065, epic task 2.23)                                                      |
| 0.51.0          | Plugin directory browsing and self-service enable/disable (RFC 0065, epic task 15.3)                                 |
| 0.54.0          | Public plugin page routes — `publicRoutes` manifest field (RFC 0042, epic task 2.14)                                 |

**`runtime@0.33.0` — activity event name changed:**
The `settings.tenant_name_changed` activity log action has been renamed to
`settings.instance_name_changed`. Historical rows already in your `activity_log`
table are unaffected; new renames produce the new event name. If you have any custom
tooling that queries `activity_log` for this specific action string, update it.

**`runtime@0.33.0` — capability strings renamed:**
`tenant:view` → `instance:view` and `tenant:configure` → `instance:configure`.
No plugin manifests are known to declare these capabilities directly (they are
platform-internal), but if you have custom plugins that gate logic on these strings,
update them.

Some runtime minor versions (e.g. 0.24.0) were used by intermediate sub-tasks or
patch releases and are not listed individually.

---

## v1.0.0 release checklist

Steps to execute when all pre-v1 tasks in `ROADMAP.md` are ✅:

1. **Bump root `package.json` to `1.0.0`** and **bump `runtime/package.json` to
   `1.0.0`** in the same PR — aligning both to the product release milestone.
   The runtime is the product from an operator's perspective; keeping both in sync
   avoids operators seeing `sovereign@1.0.0` running on `runtime@0.3x.0`.
2. **Tag the release**: `git tag v1.0.0 && git push --tags`. The Docker image
   publish workflow produces the `v1.0.0` GHCR image automatically.
3. **Update this file** with final transition notes for the last `0.9.x → 1.0.0`
   jump, following the same format as the sections above.
4. **Reorganise upgrade guide section headings** to use root `package.json` versions
   (`v1.0 → v1.1`, etc.) instead of runtime-internal ones going forward. The runtime
   version map above remains the historical reference for pre-v1 sections.
5. **Update `SOVEREIGN_VERSION`** in `docker-compose.prod.yml` to `1.0.0`.
6. **Branch convention changes**: `main` becomes the production branch and `dev`
   the integration branch (as noted in `CLAUDE.md`).
