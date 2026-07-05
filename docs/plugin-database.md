# Plugin database guide

Sovereign gives every plugin access to a Drizzle client through `sdk.db.getClient()`.
By default that client is the **shared platform database** — a single SQLite file (or
Postgres database) that all plugins write into, with isolation by table-name prefix.
For plugins that need stronger boundaries, `database: "isolated"` provisions a
**dedicated store** per plugin: a separate SQLite file or a Postgres schema.

This document covers both modes in full. Start with
[Choosing a mode](#choosing-a-mode), then jump to
[Shared (default)](#shared-default) or [Isolated](#isolated-databaseisolated) as needed.

---

## Choosing a mode

|                           | Shared                                  | Isolated                                        |
| ------------------------- | --------------------------------------- | ----------------------------------------------- |
| Default                   | ✅                                      | opt-in                                          |
| Setup cost                | Zero (just use slug-prefixed tables)    | Add `"database": "isolated"` to manifest        |
| Table prefix required     | Yes — slug (e.g. `tasks_lists`)         | No — own namespace                              |
| Cross-plugin SQL joins    | Possible (same DB)                      | Not possible; use `sdk.data`                    |
| Uninstall                 | Tables remain — manual cleanup          | Entire store dropped automatically              |
| Per-plugin backup/restore | Not directly                            | `data/plugins/<id>.db` (SQLite) or named schema |
| Migration tracking        | Own `__drizzle_migrations_<slug>` table | Per-store `__drizzle_migrations`                |
| Blast-radius isolation    | Tables only                             | Full store                                      |

**Use shared** (the default) unless you have a specific reason:

- Plugin doesn't need a clean uninstall or per-plugin backup.
- You want to join against platform tables or other plugin data.
- Simplest operational footprint — one database, one backup.

**Use isolated** when:

- Users have a right to cleanly delete all data for a specific plugin (GDPR / plugin uninstall).
- The plugin has its own backup/export/restore story independent of the platform.
- You want schema freedom (no prefix, no risk of name collision).
- You're shipping a plugin that stores large or sensitive data you want blast-radius-contained.

---

## Shared (default)

```jsonc
// manifest.json
{
  "id": "io.example.tasks",
  // "database" omitted = "shared"
}
```

### Rules

- **Prefix every table with your plugin slug.** Slug = plugin id with `.` and `-` replaced by
  `_` (e.g. `io.example.tasks` → `io_example_tasks`). Tables: `io_example_tasks_lists`,
  `io_example_tasks_items`. This is the only namespace mechanism — there is no query-level
  auto-scoping.
- **Application code queries through one dialect's schema — usually `sqlite-core` —
  and that's fine.** `sdk.db.getClient()` returns a client whose query-builder dialect
  (`node-postgres` vs `better-sqlite3`) is bound to the connection, not to the table
  object passed to `.from()`/`.insert()`. A `sqliteTable()`-defined table works
  correctly against a Postgres-backed client at query time (verified empirically)
  **as long as the physical Postgres columns use types that serialize identically**:
  plain `integer` for booleans, IDs, and timestamps — never native Postgres `boolean`
  or `bigint` — matching what Drizzle's SQLite column mappers already produce.
  Reaching for a native Postgres type here breaks writes at runtime the first time a
  boolean or bigint column round-trips through the mismatched serializer.
- **You still need a genuine, separate Postgres schema file to generate Postgres
  migrations from.** `drizzle-kit generate --dialect postgresql` cannot read a
  `sqliteTable()`-based schema file — it silently reports zero tables found. Keep a
  second file (e.g. `db/schema.postgres.ts`, using `pgTable`/`integer`, a structural
  mirror of your real schema) whose only job is driving migration generation;
  application code never imports it. See `packages/db/src/schema/{sqlite,postgres}/platform.ts`
  for the platform's own reference pair — note the platform's own Postgres schema uses
  native `boolean`/`bigint` because the platform's _own_ query code is dialect-aware
  (`packages/db/src/exec.ts`); a plugin whose application code is not dialect-aware
  must not copy that part of the pattern.
- **Add `tenant_id` to user-scoped tables.** v1 is single-tenant but the column is required
  from day one — multi-tenancy is a future concern and tables without `tenant_id` will need
  a migration later.

### Getting a client

```ts
import { sdk } from '@sovereignfs/sdk';

// In a Server Component, Route Handler, or Server Action:
const db = await sdk.db.getClient();
```

The returned client is a Drizzle instance. Pass your schema tables to it:

```ts
import { sdk } from '@sovereignfs/sdk';
import { tasks } from '../db/schema'; // your Drizzle table definitions

const db = await sdk.db.getClient();
const rows = await db.select().from(tasks).where(eq(tasks.userId, session.user.id));
```

### Migrations (shared)

Shared plugins place migration files at `plugins/<id>/migrations/sqlite/` and
`plugins/<id>/migrations/postgres/`. The platform migration runner applies them at startup
against the platform database, after platform-level migrations have already run.

**Each shared-mode plugin tracks its applied migrations in its own
`__drizzle_migrations_<slug>` table** (e.g. `__drizzle_migrations_fs_sovereign_tasks`),
not the platform's own `__drizzle_migrations` table. Drizzle's migrator decides
"already applied" purely by comparing a migration's timestamp against the single
most recent row in whatever table it's given — reusing the platform's table would let
the newer of the two histories make the older one look already-applied and silently
skip it forever. This is handled automatically by the migration runner
(`pluginMigrationsTableName()` in `packages/db`); plugin authors don't need to do
anything beyond following the standard layout above.

Generate migrations with drizzle-kit — **from your plugin's own repo**, once per
dialect, each against its own schema file:

```bash
# SQLite — from db/schema.ts (the schema application code queries against):
pnpm drizzle-kit generate --schema db/schema.ts --out migrations/sqlite --dialect sqlite

# Postgres — from a separate db/schema.postgres.ts (see the rules above):
pnpm drizzle-kit generate --schema db/schema.postgres.ts --out migrations/postgres --dialect postgresql
```

Review the generated SQL before committing — migration files are committed to your
plugin's own source repository, not this one.

---

## Isolated database (`"isolated"`)

```jsonc
// manifest.json
{
  "id": "io.example.tasks",
  "database": "isolated",
}
```

### What the platform does

On the **first request** where a plugin route calls `sdk.db.getClient()`, the runtime:

1. Checks the plugin's manifest: `database === 'isolated'`.
2. Provisions the store (idempotent — safe to call repeatedly).
3. Returns a dedicated Drizzle client.

**Provisioning by dialect:**

| Dialect  | What gets created                                                                                                                                                                                                                                                                                                 |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SQLite   | `data/plugins/<pluginId>.db` opened with WAL mode and foreign keys enabled. Parent `data/plugins/` directory is created if absent.                                                                                                                                                                                |
| Postgres | `CREATE SCHEMA IF NOT EXISTS "plugin_<slug>"` on the same server as the platform DB (`DATABASE_URL`). Schema name: plugin id with `.`/`-` → `_`, prefixed with `plugin_` — e.g. `io.example.tasks` → `plugin_io_example_tasks`. The runtime pool sets `SET search_path TO "plugin_slug"` on every new connection. |

Subsequent `sdk.db.getClient()` calls return the same cached client — provisioning only
runs once per process.

### SDK usage (unchanged from shared)

```ts
import { sdk } from '@sovereignfs/sdk';

const db = await sdk.db.getClient(); // returns the dedicated client, transparently
```

Your plugin code does not need to know which mode it's in. You do NOT need to pass
the plugin ID — the runtime reads the `x-sovereign-plugin-id` header that the
middleware injects on every plugin route.

**Outside a request context** (e.g. background scripts, server startup hooks): the
header is absent and the platform DB is returned as a fallback. If you need the
isolated client outside a request, provision it explicitly using the internal
`packages/db` helpers — but this is an unusual case.

### No slug prefix required

Inside an isolated store, table names don't need a slug prefix. Your schema can use
simple names:

```ts
// db/schema.ts — for an isolated plugin
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

export const lists = sqliteTable('lists', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  userId: text('user_id').notNull(),
  tenantId: text('tenant_id').notNull(), // still required
  createdAt: integer('created_at').notNull(),
});
```

### Still required in isolated stores

- **`tenant_id` on user-scoped tables.** Even though the store is dedicated to your
  plugin, multi-tenancy readiness applies across the whole platform. Every table that
  scopes data to a user must carry `tenant_id`.
- **Application code stays on one schema file (typically `sqlite-core`); Postgres
  columns must serialize identically to it.** Same rule as shared mode above: never
  use native Postgres `boolean`/`bigint` if your application code keeps querying
  through the SQLite-typed schema, or writes will fail at runtime.

### Migrations for isolated plugins

Place migration files at:

```
plugins/<id>/migrations/sqlite/    # SQLite migration SQL files
plugins/<id>/migrations/postgres/  # Postgres migration SQL files
```

This is the same layout as `packages/db/migrations/`. The platform runs these at
startup (before handling any requests) via Drizzle's migrator, routed to the plugin's
dedicated store.

**Each isolated store tracks its own applied migrations** in a `__drizzle_migrations`
table inside that store — completely independent of the platform DB's migration log.
Version state is per-database.

**Generating migrations with drizzle-kit:** run from your plugin's own repo, once
per dialect, **each against its own schema file** — `drizzle-kit generate --dialect
postgresql` cannot read a `sqliteTable()`-based schema (it silently reports zero
tables found), so a genuine second `pgTable`-based file is required:

```bash
# SQLite — from db/schema.ts (the schema application code queries against):
pnpm drizzle-kit generate --schema db/schema.ts --out migrations/sqlite --dialect sqlite

# Postgres — from a separate db/schema.postgres.ts, structurally mirroring
# db/schema.ts but never using native Postgres boolean/bigint (see above):
pnpm drizzle-kit generate --schema db/schema.postgres.ts --out migrations/postgres --dialect postgresql
```

Review the generated SQL before committing. Migration files are committed
to your plugin's own source repository.

**Startup order:** platform migrations run first, then per-plugin migrations in
registry order. A failed plugin migration is logged but does not abort startup —
the compatibility check still gates access to the plugin's routes.

---

## Lifecycle

### Provision

The store is provisioned **lazily on first `sdk.db.getClient()` call** from within a
plugin route. Provisioning is also run explicitly at startup by `instrumentation.ts` for
plugins with a `migrations/` folder (so migrations land before the first request).

### Uninstall

`sv plugin remove <id>` drops the plugin directory **and** its isolated store:

```bash
pnpm sv plugin remove io.example.tasks        # remove + drop store
pnpm sv plugin remove io.example.tasks --keep-data  # remove, keep the store
```

What "drop" means by dialect:

- **SQLite** — deletes `data/plugins/io.example.tasks.db`, plus the WAL sidecar files
  (`-wal`, `-shm`) if present.
- **Postgres** — runs `DROP SCHEMA "plugin_io_example_tasks" CASCADE`, which deletes all
  tables and indexes in that schema.

**`--keep-data`** retains the store on disk. Useful when you want to inspect the data
before deleting, migrate it elsewhere, or reinstall the plugin with its history intact.
The retained SQLite file at `data/plugins/<id>.db` is a fully valid SQLite database
you can open with any SQLite tool.

### Reinstall

If you reinstall a plugin after removing it **with `--keep-data`**, the existing store is
reused automatically. Migrations that have already been applied are skipped (tracked in
the store's `__drizzle_migrations`).

---

## Backup and restore

### SQLite

`sv backup` archives the entire `data/` directory, which includes `data/plugins/`:

```
data/
  sovereign.db          # platform DB
  auth.db               # auth DB
  avatars/              # user avatars
  plugins/
    io.example.tasks.db # isolated plugin DB
    io.example.tasks.db-wal
```

A full `sv restore` restores all plugin stores in one operation. To back up or restore
a single plugin's database:

```bash
# Backup one plugin store
cp data/plugins/io.example.tasks.db /backup/

# Restore (plugin must be uninstalled or not running)
cp /backup/io.example.tasks.db data/plugins/
```

### Postgres

Isolated plugin schemas (`plugin_*`) live in the **same Postgres database** as the
platform. A full `pg_dump` of the database captures them. To dump only one plugin's
schema:

```bash
pg_dump \
  --schema "plugin_io_example_tasks" \
  "$DATABASE_URL" \
  > io_example_tasks_backup.sql

# Restore
psql "$DATABASE_URL" < io_example_tasks_backup.sql
```

---

## Cross-plugin data

Isolated stores make SQL joins across plugins **impossible** — each plugin has its own
database or schema and cannot reference another plugin's tables directly. This reinforces
the SDK boundary.

If one plugin needs data from another, use the consent-gated `sdk.data` mechanism
(RFC 0002):

```ts
// Provider plugin registers a resolver:
sdk.data.provide('io.example.tasks:summary', async (params) => { ... });

// Consumer plugin queries it (user must have granted consent):
const rows = await sdk.data.query(
  { providerId: 'io.example.tasks', contract: 'summary', version: '1.0' },
  params,
);
```

See [`docs/plugin-development.md`](plugin-development.md) → Cross-plugin data sharing.

---

## Internals

This section is for contributors and advanced plugin authors who want to understand
how the plumbing works.

### How `sdk.db.getClient()` routes requests

```
Plugin route handler calls sdk.db.getClient()
  ↓
packages/sdk/src/db.ts reads x-sovereign-plugin-id from Next.js headers()
  ↓
Passes pluginId to SdkHost.db.getClient(pluginId)
  ↓
runtime/src/sdk-host.ts:
  - pluginId is null? → return platform DB
  - manifest.database === 'isolated'? → provisionPluginDb() + return getPluginDb().db
  - otherwise → return platform DB
```

### Per-plugin client registry

`packages/db/src/plugin-client.ts` maintains an in-process Map keyed by plugin ID.
`getPluginDb(pluginId)` creates the client on first call and returns the cached instance
on subsequent calls. The registry is reset on server restart (which is fine — the store
persists on disk; the client is reconstructed on next access).

### Postgres `search_path`

For Postgres isolated plugins, the runtime creates a separate `pg.Pool` pointing at the
same `DATABASE_URL` but with `SET search_path TO "plugin_<slug>"` run on every new
connection (via a `pool.on('connect', ...)` handler). This means all unqualified table
names in queries resolve to the plugin's schema. The platform pool is unaffected.

### Migration runner

`runtime/src/plugin-migrations.ts` (called from `instrumentation.ts`) iterates the
registry, finds every plugin (isolated or shared) with a `migrations/<dialect>/` folder,
and calls `runPluginMigrations(pluginDb, folder, migrationsTable?)` from
`packages/db/src/migrate.ts`. That function calls Drizzle's built-in `migrate()` for the
appropriate dialect, which creates the migrations-tracking table on first run and tracks
applied files.

For isolated plugins, `migrationsTable` is omitted — Drizzle's default
`__drizzle_migrations` is fine since each isolated store is already its own dedicated
database. For shared plugins, the runner passes
`pluginMigrationsTableName(manifest.id)` (`packages/db/src/plugin-client.ts`), giving
each one its own uniquely-named table in the platform DB. This matters because
Drizzle's migrator (`drizzle-orm/*/migrator`) tracks "already applied" by comparing a
migration's own timestamp against only the single most recent `created_at` row in
the table — not a per-migration or per-plugin hash lookup. Two independent migration
histories (the platform's own, and a plugin's) sharing one table would let whichever
has later timestamps make the other look already-applied and skip silently, forever.
