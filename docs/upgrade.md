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

The root `package.json` version tracks roadmap milestones. Notes below call out
any required configuration changes, schema changes, or action required.

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

---

## v0.27 → v0.28 (White-labeling Phase 1, RFC 0027)

### `sdk.platform.getConfig()` gains branding fields

`PlatformConfig` now includes two new fields:

```ts
interface PlatformConfig {
  tenantName: string;
  inviteOnly: boolean;
  version: string;
  brandName: string; // ← new; falls back to tenantName
  brandPrimaryColor?: string; // ← new; validated hex or undefined
}
```

Existing code reading `getConfig()` is unaffected — the new fields are additive.

### New `tenant_branding` database table

The migration (`0004_tenant_branding`) is applied automatically on startup.
No manual step required.

### New `BRAND_*` environment variables

Seven new optional env vars control white-label defaults. All are optional;
Sovereign defaults apply when unset. See
[`docs/self-hosting.md`](self-hosting.md#environment-variables) for the full
list.

### New `--sv-brand-*` CSS tokens

Three new CSS custom properties are now defined in `packages/ui/src/tokens/semantic.css`:

- `--sv-brand-logo` — light-theme logo URL
- `--sv-brand-logo-dark` — dark-theme logo URL
- `--sv-brand-favicon` — favicon URL

These are set at `:root` by `BrandProvider` and available in plugin CSS without any import.
