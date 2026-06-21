# RFC 0004 — Per-plugin database

**Status:** Implemented\
**Date:** June 2026\
**Author:** kasunben\
**Scope:** Manifest schema (`packages/manifest`), DB layer (`packages/db`), migration runner, runtime SDK bridge (`sdk.db`), SRS\
**Incorporated into plan:** Yes — implemented in Task 0.8.02 (`@sovereignfs/db` 1.5.0, `@sovereignfs/sdk` 1.9.0, `runtime` 0.26.0).

See [`docs/plugin-database.md`](../plugin-database.md) for the operator/author reference.

---

## Summary

Let a plugin opt into a **dedicated database** instead of sharing the platform
database, via the manifest field that **already exists** but is unimplemented:

```jsonc
{ "database": "shared" | "isolated" } // default: "shared"
```

`shared` (today's behaviour) keeps the plugin's tables in the one platform
database, namespaced by slug prefix. `isolated` gives the plugin its **own
store** — a separate SQLite file, or a separate Postgres schema/database — which
the runtime hands the plugin through `sdk.db.getClient()`. This buys schema
freedom, a clean data lifecycle (uninstall drops the whole store), per-plugin
backup/export, and stronger blast-radius isolation, at the cost of extra
connections/migration runners and no cross-plugin SQL.

**Shared stays the default.** Isolation is opt-in for plugins that genuinely need
it.

## Motivation

The platform deliberately chose **one shared database with slug-prefixed tables**
for simplicity (SRS §3.7, decision log): one connection, one migration runner, no
cross-plugin query complexity. That is the right default and stays so.

But some plugins want more than a namespace:

- **Clean data lifecycle / right-to-be-forgotten.** Uninstalling a plugin (or
  purging its data) should be a single, total operation — drop a file or a
  schema — not a careful sweep of prefixed tables that risks orphans.
- **Per-plugin backup, export, and portability.** A self-contained store can be
  snapshotted, moved, or handed to the user without entangling other plugins'
  data.
- **Blast-radius isolation.** A plugin's heavy/abusive workload, a runaway
  migration, or corruption is contained to its own store.
- **Schema freedom.** Inside its own store a plugin needn't carry the slug prefix
  and can't accidentally collide with another plugin's table names.

`database: "isolated"` was reserved in the manifest from the start precisely to
leave room for this; the field exists today but is documented as "not implemented
in v1" (SRS §4.6/§5). This RFC designs it as a **post-v1** capability.

## Current state (what this builds on)

- **The manifest field already exists:** `database?: 'shared' | 'isolated'`
  (`packages/manifest/src/schema.ts`, SRS §5). `isolated` is declared but
  unimplemented (SRS §4.6).
- **The DB factory already has the seam:** `createClient({ dialect?, url? })`
  (`packages/db/src/client.ts`) accepts per-call dialect/URL overrides;
  `resolveSqlitePath` resolves relative `file:` paths against the workspace root
  into `data/`. (Postgres is recognised but not wired until Task 0.5.03.)
- **`sdk.db.getClient()`** (Task 0.5.05) is the single point where the runtime
  decides which client a plugin receives — the natural place to route an isolated
  plugin to its dedicated store.
- **Per-plugin migrations are already the model:** SRS §3.7 plans migration files
  under `plugins/[id]/migrations/`, aggregated by the `packages/db` runner.
- **Existing invariants to honour:** dialect-agnostic (SQLite default, Postgres
  via env), `tenant_id` on user-scoped tables, and the SDK boundary (plugins
  never read another plugin's data directly).

## Proposed design

### 1. `shared` (default) vs `isolated` (opt-in)

`database` is resolved at plugin-load time from the manifest. `shared` (or the
field omitted) is unchanged: prefixed tables in the platform DB. `isolated`
provisions a dedicated store on first use. **Platform/chrome plugins
(Console/Account/Launcher) are always `shared`** — they are core and co-located
with platform tables.

### 2. Isolation mechanism by dialect

- **SQLite** → a dedicated file per plugin, e.g. `data/plugins/<pluginId>.db`,
  created via `createClient({ url: 'file:./data/plugins/<id>.db' })`. The existing
  `resolveSqlitePath` + `mkdirSync` already handle the path and directory.
- **Postgres** → two candidate mechanisms (see Open questions; **schema-per-plugin
  recommended**):
  - **Schema-per-plugin (recommended):** one connection/pool; each isolated plugin
    gets its own Postgres schema (`CREATE SCHEMA`, `search_path`/qualified names).
    Light, keeps a single pool, fits the "one connection" ethos, easy to drop
    (`DROP SCHEMA … CASCADE`).
  - **Database-per-plugin (alternative):** a separate Postgres database +
    connection per plugin. Strongest isolation and the cleanest backup/drop, but a
    **connection pool per plugin** (exhaustion risk at scale) and heavier ops
    (provisioning a database needs elevated privileges).

### 3. Client routing

The runtime's `sdk.db` bridge consults the plugin's resolved `database` setting
and returns either the shared platform client or a **dedicated client** built
from `createClient({ dialect, url })`. A small **per-plugin client registry**
(keyed by plugin id) caches clients and initialises them **lazily** on first
`getClient()`. Plugins call `sdk.db.getClient()` exactly as before — isolation is
transparent to plugin code.

### 4. Migrations

Each isolated plugin runs **its own migrations against its own store**, with its
**own migration-tracking table** (so version state is per-database). The
`packages/db` runner routes per plugin: platform migrations against the platform
DB first, then each plugin's migrations against its resolved store (shared → the
platform DB; isolated → its dedicated store). This extends the §3.7 aggregation
model rather than replacing it.

### 5. Slug prefix inside an isolated store

Inside its own database a plugin **no longer needs the slug prefix** — schema
freedom is a stated benefit. The trade-off: dropping the prefix makes a later
**`shared` ↔ `isolated` switch** a table-rename data migration. Options (Open
questions): keep the prefix everywhere for switchability, or drop it in isolated
stores for cleanliness and treat the mode as fixed at install. Recommendation:
treat `database` as **fixed at install**; switching is an explicit,
migration-backed operation, not a manifest toggle.

### 6. Lifecycle

- **Provision** on first `getClient()` (create the file / `CREATE SCHEMA`).
- **Uninstall / purge** drops the whole store (delete the file / `DROP SCHEMA …
CASCADE`) — a single, total deletion.
- **Backup/export** can target one plugin's store directly.

### 7. Boundaries and multi-tenancy

- `tenant_id` still applies to user-scoped tables **inside** an isolated store
  (multi-tenancy readiness is unchanged).
- Isolated stores make cross-plugin **joins impossible**, which **reinforces the
  SDK boundary** — any cross-plugin read must go through the consent-gated
  `sdk.data` mechanism (RFC 0002), never a direct query.

## Impact when accepted (deferred — no edits yet)

| Where                                    | Change                                                                                                           |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `packages/manifest`                      | No schema change (`database` already exists); document `isolated` as supported; validation/tests as needed.      |
| `packages/db`                            | Per-plugin client factory + registry; Postgres schema (or database) provisioning + drop; reuse `createClient`.   |
| Migration runner (`packages/db/migrate`) | Route each plugin's migrations to its resolved store; per-store tracking table.                                  |
| Runtime SDK bridge                       | `sdk.db.getClient()` returns the shared or dedicated client per the plugin's `database` setting.                 |
| Plugin lifecycle (Console / install)     | Provision on first use; drop store on uninstall/purge; per-plugin backup/export hooks.                           |
| SRS §3.7 / §4.6 / §5 / decision log      | Update "no per-plugin DBs" / "not implemented" wording; record the opt-in isolated model and its default-shared. |
| `docs/roadmap.md`                        | A phased implementation task (SQLite file isolation first; Postgres schema; lifecycle/backup).                   |

## Alternatives considered

1. **Status quo — shared-only with slug prefixes.** Simplest and stays the
   **default**, but offers no clean per-plugin deletion, backup, or strong
   isolation. Rejected as the _only_ option; retained as the default.
2. **Database-per-plugin for Postgres** (instead of schema-per-plugin). Stronger
   isolation and cleanest drop/backup, but a connection pool per plugin and
   heavier provisioning. The primary Open question.
3. **Bring-your-own / external database now** (operator points a plugin at an
   external connection string, possibly a different engine). Most flexible but
   adds secret management, config surface, and dialect-divergence risk. Deferred
   to a future extension (Open questions).
4. **A different engine per plugin** (e.g. a document store for one plugin).
   Out of scope — the platform stays dialect-agnostic over SQLite/Postgres.

## Open questions

1. **Postgres mechanism — schema-per-plugin vs database-per-plugin.** The primary
   fork; recommendation is schema-per-plugin for the single-pool/light footprint.
2. **Slug prefix inside isolated stores**, and the **`shared` ↔ `isolated`
   switching** story (fixed-at-install vs migration-backed toggle).
3. **Connection pooling/limits** for Postgres; **lazy vs eager** client init;
   handling many isolated plugins on one instance.
4. **Bring-your-own external database** — operator env-config (never manifest
   secrets); whether a non-platform engine is ever allowed.
5. **Per-plugin backup/export tooling**, and the **uninstall data policy** (drop
   immediately vs retain/export-then-drop).
6. **Provisioning privileges** for Postgres (creating schemas/databases needs
   rights the runtime DB role may not have by default).

## Adoption path

1. Accept RFC → confirm `database: "isolated"` is supported (manifest already
   carries the field; no schema change) and update the SRS wording.
2. Implement **SQLite file isolation** end to end (dedicated file via
   `createClient`, per-plugin client registry, per-store migrations) — proves the
   model with zero new infrastructure.
3. Add the **Postgres** mechanism (schema-per-plugin per the resolved Open
   question) once Postgres is wired (Task 0.5.03).
4. Add lifecycle hooks (provision/drop) and per-plugin backup/export; revisit BYO
   external databases only if there is demand.

## Implementation (Task 0.8.02)

### Open questions resolved

1. **Postgres mechanism:** schema-per-plugin (`CREATE SCHEMA IF NOT EXISTS "plugin_<slug>"`).
   A separate `pg.Pool` per isolated plugin with `SET search_path TO "plugin_<slug>"` on
   every new connection. Separate pool objects (not connections) — the "no extra pool"
   intent was about not spawning a separate Postgres database; small pool objects are
   acceptable overhead.

2. **Slug prefix in isolated stores:** not required. `database` is treated as fixed at
   install — switching is a migration-backed explicit operation, not a manifest toggle.
   Slug prefix is documented as optional for isolated stores and recommended to drop.

3. **Connection pooling:** lazy per-plugin `pg.Pool`; created on first `getPluginDb()`
   call and cached in-process. Plugin pool shares the same server as the platform pool.
   No connection-count concern unless an operator installs dozens of isolated plugins.

4. **BYO external database:** deferred. The `DATABASE_URL`/`DB_DIALECT` env-config approach
   mentioned in Open question 4 is still the path if needed; not built in this task.

5. **Per-plugin backup/export:** covered by `sv backup` (all SQLite files under `data/`
   are included; Postgres schemas are in the same database captured by `pg_dump`). A
   single-plugin SQLite file can be copied directly. Fine-grained `sv backup --plugin <id>`
   is deferred.

6. **Provisioning privileges:** for Postgres, `CREATE SCHEMA` requires the runtime DB
   role to have `CREATE` privilege on the database (standard default for the database
   owner). No additional setup documented; self-hosters who use a restricted role need
   to grant `CREATE ON DATABASE` manually.

### What shipped

| Component                                | Change                                                                                                              |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `packages/db/src/plugin-client.ts` (new) | `getPluginDb`, `provisionPluginDb`, `dropPluginDb`, `pluginMigrationsFolder`, `pluginSchemaName`, `pluginSqliteUrl` |
| `packages/db/src/migrate.ts`             | `runPluginMigrations(pluginDb, folder)`                                                                             |
| `packages/db/src/index.ts`               | All new exports                                                                                                     |
| `packages/sdk/src/db.ts`                 | Reads `x-sovereign-plugin-id` header; passes `pluginId` to host                                                     |
| `packages/sdk/src/host.ts`               | `SdkHost.db.getClient(pluginId: string \| null)`                                                                    |
| `runtime/src/sdk-host.ts`                | Routes `isolated` plugins to dedicated client                                                                       |
| `runtime/src/plugin-migrations.ts` (new) | Startup migration runner for isolated plugins                                                                       |
| `runtime/instrumentation.ts`             | Calls plugin migration runner at boot                                                                               |
| `bin/sv.ts`                              | `plugin remove` reads manifest before delete; drops store; `--keep-data` flag                                       |
| `docs/plugin-database.md` (new)          | Full operator/author reference                                                                                      |
| SRS §3.7, §4.6, §5                       | Updated "not implemented" → implemented                                                                             |

## Changelog

| Version | Date     | Change                                                                                       |
| ------- | -------- | -------------------------------------------------------------------------------------------- |
| 0.1     | Jun 2026 | Initial draft.                                                                               |
| 0.2     | Jun 2026 | Added to the roadmap as exploratory Task 1.0.08 (gated on acceptance; still Draft).          |
| 0.3     | Jun 2026 | RFC accepted; status updated to Accepted; Task 1.0.08 now scheduled (no implementation yet). |
| 0.4     | Jun 2026 | Implemented in Task 0.8.02; status updated to Implemented; open questions resolved.          |
