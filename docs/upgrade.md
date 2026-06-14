# Upgrade guide

Migration notes for breaking changes. Per NFR-04, any breaking change to a
published package (`@sovereignfs/sdk`, `@sovereignfs/ui`) ships with at least a
minor version bump and an entry here. Operators upgrading an instance should read
the platform-release notes; plugin developers should read the package notes.

## Platform releases

The platform version (root `package.json`) tracks roadmap milestones. To upgrade,
pull the new version, then `docker compose -f docker-compose.prod.yml up --build -d`
(or rebuild your deployment). Notes below call out any required configuration
changes.

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

## Published package migrations

## `@sovereignfs/sdk` 0.6.0 → 0.7.0

### `sdk.db.getClient()` is now implemented and async

`sdk.db.getClient()` previously threw `NotImplementedError` (the runtime had not
wired it). It now returns the platform's Drizzle client. For the same
dialect-agnostic reason as `getConfig()` (node-postgres has no synchronous API),
it returns a `Promise` — `getClient(): Promise<DrizzleClient>`.

**Before:**

```ts
const db = sdk.db.getClient(); // threw NotImplementedError
```

**After:**

```ts
const db = await sdk.db.getClient();
// query your plugin's slug-prefixed tables, e.g. db.select().from(tasksLists)
```

The caller must be in an async context (server components, route handlers, and
server actions all qualify).

## `@sovereignfs/sdk` 0.5.0 → 0.6.0

### `sdk.platform.getConfig()` is now async

To make the platform database **dialect-agnostic** (SQLite and Postgres — Task
0.5.03), the platform data layer can no longer assume synchronous queries:
node-postgres has no synchronous API. `sdk.platform.getConfig()` therefore now
returns a `Promise<PlatformConfig>` instead of `PlatformConfig`.

**Before:**

```ts
const config = sdk.platform.getConfig();
console.log(config.tenantName);
```

**After:**

```ts
const config = await sdk.platform.getConfig();
console.log(config.tenantName);
```

The caller must be in an async context (server components, route handlers, and
server actions all qualify). The returned `PlatformConfig` shape is unchanged.
