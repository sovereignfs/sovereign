---
docSection: app-developers
docType: reference
audiences:
  - app-developer
---

# Plugin database guide

Sovereign gives every plugin access to a Drizzle client through `sdk.db.getClient()`.
Every plugin gets its own **dedicated store** — an sqld namespace or a Postgres schema.
There is no per-plugin choice to make, and no `database` field left in the manifest at
all — see [Database](#database).

`type: "platform"` plugins (`account`, `console`, `launcher`) are the one exception —
see [Platform-type plugins](#platform-type-plugins).

---

## Database

### What the platform does

On the **first request** where a plugin route calls `sdk.db.getClient()`, the runtime:

1. Checks the plugin's manifest `type` — anything other than `platform` gets a
   dedicated store.
2. Provisions the store (idempotent — safe to call repeatedly).
3. Returns a dedicated Drizzle client.

**Provisioning by dialect:**

| Dialect  | What gets created                                                                                                                                                                                                                                                                                                                    |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| SQLite   | A dedicated **sqld namespace** (RFC 0091, workstream 0009 leg 3), created via sqld's admin API. Namespace name: same slug rules as the Postgres schema below — e.g. `io.example.tasks` → `plugin_io_example_tasks`. sqld is a required part of a SQLite deployment, not an optional extra — no plain-file fallback.                  |
| Postgres | `CREATE SCHEMA IF NOT EXISTS "plugin_<slug>"` on the same server as the platform DB (`POSTGRES_DB_URL`). Schema name: plugin id with `.`/`-` → `_`, prefixed with `plugin_` — e.g. `io.example.tasks` → `plugin_io_example_tasks`. The runtime pool sets `search_path` on connection (startup option, not a `SET` after connecting). |

Subsequent `sdk.db.getClient()` calls return the same cached client — provisioning only
runs once per process.

### SDK usage

```ts
import { sdk } from '@sovereignfs/sdk';

const db = await sdk.db.getClient();
```

You do NOT need to pass the plugin ID — the runtime reads the `x-sovereign-plugin-id`
header that the middleware injects on every plugin route.

**Outside a request context** (e.g. background scripts, server startup hooks): the
header is absent and the platform DB is returned as a fallback. If you need the
dedicated client outside a request, provision it explicitly using the internal
`packages/db` helpers — but this is an unusual case.

### No slug prefix required

Table names don't need a slug prefix. Your schema can use simple names:

```ts
// db/schema.ts
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

export const lists = sqliteTable('lists', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  userId: text('user_id').notNull(),
  tenantId: text('tenant_id').notNull(), // still required
  createdAt: integer('created_at').notNull(),
});
```

### Rules

- **`tenant_id` on every user-scoped table** (multi-tenancy readiness). v1 is
  single-tenant, but the column is required from day one — tables without it will need
  a migration later.
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

There is currently no application-level at-rest encryption option for a plugin's store,
on either dialect — a prior SQLite-only opt-in (`database.requireEncryption`, RFC 0071) For protecting sensitive _fields_ against a database operator, use app-level field encryption (RFC 0092) — see `docs/plugin-development.md`'s "Adopting field encryption" checklist and the `example-plugins/example-encrypted` reference.
was retired along with the rest of the `database` manifest field. Rely on disk/volume-level
encryption if this matters for your deployment.

### Migrations

Place migration files at:

```
plugins/<id>/migrations/sqlite/    # SQLite migration SQL files
plugins/<id>/migrations/postgres/  # Postgres migration SQL files
```

This is the same layout as `packages/db/migrations/`. The platform runs these at
startup (before handling any requests) via Drizzle's migrator, routed to the plugin's
dedicated store.

**Each store tracks its own applied migrations** in a `__drizzle_migrations` table
inside that store — completely independent of the platform DB's migration log. Version
state is per-database.

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

`sv plugin remove <id>` drops the plugin directory **and** its dedicated store:

```bash
pnpm sv plugin remove io.example.tasks        # remove + drop store
pnpm sv plugin remove io.example.tasks --keep-data  # remove, keep the store
```

What "drop" means by dialect:

- **SQLite** — drops the plugin's sqld namespace via sqld's admin API
  (`DELETE /v1/namespaces/<ns>`). There is no file on disk to delete.
- **Postgres** — runs `DROP SCHEMA "plugin_io_example_tasks" CASCADE`, which deletes all
  tables and indexes in that schema.

**`--keep-data`** retains the store. Useful when you want to inspect the data before
deleting, migrate it elsewhere, or reinstall the plugin with its history intact. The
namespace/schema itself is retained on the server (see
[self-hosting.md's sqld section](self-hosting.md#sqld-libsql-server-rfc-0091) for how
sqld's data is backed up).

### Reinstall

If you reinstall a plugin after removing it **with `--keep-data`**, the existing store is
reused automatically. Migrations that have already been applied are skipped (tracked in
the store's `__drizzle_migrations`).

---

## Backup and restore

### SQLite

Every plugin's data lives in sqld, backed up and restored as part of its own named
volume (`sovereign_sqld_data`), not per-namespace — see
[self-hosting.md's sqld section](self-hosting.md#sqld-libsql-server-rfc-0091). `data/`
now holds only uploaded files (avatars), no databases.

### Postgres

Plugin schemas (`plugin_*`) live in the **same Postgres database** as the platform. A
full `pg_dump` of the database captures them. To dump only one plugin's schema:

```bash
pg_dump \
  --schema "plugin_io_example_tasks" \
  "$POSTGRES_DB_URL" \
  > io_example_tasks_backup.sql

# Restore
psql "$POSTGRES_DB_URL" < io_example_tasks_backup.sql
```

---

## Cross-plugin data

Dedicated stores make SQL joins across plugins **impossible** — each plugin has its own
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

## Platform-type plugins

`account`, `console`, and `launcher` (`type: "platform"`) are the one exception to
everything above. They administer the platform's own core data directly — the same as
`apps/auth` — rather than owning data of their own: Console owns no tables at all (it
reads and writes existing platform tables like `users`/`plugin_status` through
`@sovereignfs/db` directly, not `sdk.db.getClient()`); Account's `account_prefs` table is
defined in the platform's own schema file (`packages/db/src/schema/*/platform.ts`), not a
plugin-owned one; Launcher has no database code at all. `manifestDatabaseIsolation()`
resolves `type: "platform"` to `"shared"` — the platform DB is returned instead of a
dedicated store — but in practice this branch is unreachable today, since none of the
three declare a `migrations/` folder. This isn't something a third-party plugin author
configures; it only applies to first-party plugins in this monorepo.

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
  - manifest.type !== 'platform'? → provisionPluginDb() + return getPluginDb().db
  - otherwise (type: "platform") → return platform DB
```

### Per-plugin client registry

`packages/db/src/plugin-client.ts` maintains an in-process Map keyed by plugin ID.
`getPluginDb(pluginId)` creates the client on first call and returns the cached instance
on subsequent calls. The registry is reset on server restart (which is fine — the store
persists on disk; the client is reconstructed on next access).

### Postgres `search_path`

For a plugin's Postgres store, the runtime creates a separate `pg.Pool` pointing at the
same `POSTGRES_DB_URL` but with `search_path` pinned to `"plugin_<slug>"` via the
connection's startup options (`-c search_path=...`) — part of the connection handshake
itself, not a `SET` issued after connecting from a `pool.on('connect', ...)` handler
(that pattern has a real race: the handler fires when the socket connects, but the pool
doesn't wait for its callback to finish before handing the connection to whichever query
is waiting). This means all unqualified table names in queries resolve to the plugin's
schema from the first statement. The platform pool is unaffected.

### Migration runner

`runtime/src/plugin-migrations.ts` (called from `instrumentation.ts`) iterates the
registry, finds every plugin with a `migrations/<dialect>/` folder, and calls
`runPluginMigrations(pluginDb, folder, migrationsTable?)` from
`packages/db/src/migrate.ts`. That function calls Drizzle's built-in `migrate()` for the
appropriate dialect, which creates the migrations-tracking table on first run and tracks
applied files.

For SQLite plugins, `migrationsTable` is omitted — Drizzle's default
`__drizzle_migrations` is fine since each store is already its own dedicated database
file, with no collision risk. For **Postgres** plugins, the runner also passes
`pluginMigrationsTableName(manifest.id)` — Drizzle's node-postgres migrator tracks
applied migrations in a table living in a _fixed_ `drizzle` schema regardless of the
connecting pool's `search_path`, so every Postgres plugin left on the default table name
would otherwise share one tracking table across _all_ of them (see task 8.26 — a real
incident where a second plugin's migrations were silently skipped as "already applied").
This matters because Drizzle's migrator (`drizzle-orm/*/migrator`) tracks "already
applied" by comparing a migration's own timestamp against only the single most recent
`created_at` row in the table — not a per-migration or per-plugin hash lookup. Two
independent migration histories sharing one table would let whichever has later
timestamps make the other look already-applied and skip silently, forever.

### Foreign keys in a Postgres schema

`drizzle-kit generate --dialect postgresql` always qualifies a generated `FOREIGN KEY`
constraint's target table with the schema the `pgTable()` was declared in — which is
`public` by default, since `db/schema.postgres.ts` never declares an explicit
`pgSchema()` (see "You still need a genuine, separate Postgres schema file" above). At
runtime a plugin's tables never live in `public` — they live in `plugin_<slug>`, reached
only via the connection's `search_path` (see above) — so a generated
`ALTER TABLE ... REFERENCES "public"."other_table"(...)` will always fail with
`relation "public.other_table" does not exist` the first time a plugin's schema has a
foreign key between two of its own tables. Drizzle wraps each migration file in one
transaction, so this failure rolls back every statement in the same file, including any
`CREATE TABLE`s that came before it — no partial state, but no tables either. Fix: after
generating, manually strip the schema qualifier from any `REFERENCES "public"."..."`
down to an unqualified `REFERENCES "..."` — the unqualified name resolves correctly
through `search_path` for both the plugin's own runtime queries and the migration
itself. Re-check this by hand after every `drizzle-kit generate` that touches a foreign
key; the generator has no schema awareness and will keep re-adding the qualifier.
