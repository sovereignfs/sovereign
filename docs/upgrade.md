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
