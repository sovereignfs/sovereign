---
rfc: 0036
title: Per-plugin database dialect selection
status: Accepted
date: June 2026
author: kasunben
scope: >
  packages/manifest, packages/db, runtime, bin/sv, docs/plugin-development.md
incorporated_into_plan: 'Yes — epic task 3.15'
---

# RFC 0036 — Per-plugin database dialect selection

## Summary

Extend the plugin manifest's `database` field so an isolated plugin can declare its own database
dialect — independent of the platform's dialect — subject to a **platform-as-ceiling rule**:

- If the platform runs **PostgreSQL**, an isolated plugin may declare `dialect: 'sqlite'` (or
  inherit Postgres as the default).
- If the platform runs **SQLite**, an isolated plugin **may not** declare `dialect: 'postgres'`.
  The platform does not have a Postgres server, so no plugin can use one.

In both cases, omitting the `dialect` field inherits the platform's dialect — existing behaviour is
fully preserved.

---

## Motivation

### Why a Postgres-platform plugin might want SQLite

RFC 0004 gave every isolated plugin its own schema (Postgres) or file (SQLite). The schema choice
was intentional: share the operator's existing DB server, keep ops simple. That reasoning holds for
most plugins, but a subset have genuinely different storage needs:

- **Lightweight key-value / cache stores** — a rate-limiter, a token bucket, or a local search
  index benefits from SQLite's low-latency embedded access. Routing these through PG adds
  unnecessary connection overhead.
- **Time-series / append-only logs** — WAL-mode SQLite is excellent for append-heavy workloads
  that don't need multi-reader concurrency.
- **Offline-first plugins** — a plugin that needs to operate while the Postgres server is
  temporarily unavailable (e.g. a field-use inventory tracker) can fall back to a local SQLite
  file and sync later.
- **Simpler local development** — plugin developers working on a Postgres-targeting plugin may
  still want to develop and test against a local SQLite file, keeping their dev machine free of a
  running Postgres server.

### Why the ceiling rule

SQLite (`better-sqlite3`) is an embedded library — already a production dependency in every
Sovereign deployment. A Postgres-platform instance always has `better-sqlite3` available, so
allowing a plugin to declare `dialect: 'sqlite'` requires zero new infrastructure.

The reverse is not true. A SQLite-platform deployment has no Postgres server, no `DATABASE_URL`
pointing to one, and no connection pool. Allowing a plugin to declare `dialect: 'postgres'` in
that context would require the operator to provision and expose a separate PG server just for that
one plugin — a significant, unexpected operational burden. The ceiling rule closes that trap.

---

## Current state

**Manifest schema** (`packages/manifest/src/schema.ts:67`):

```ts
database: z.enum(['shared', 'isolated']).optional(),
```

The field is a simple enum: opt into an isolated store (`'isolated'`) or share the platform DB
(`'shared'`, the default). No sub-fields exist; no dialect choice is possible.

**DB client provisioning** (`packages/db/src/plugin-client.ts`):

```ts
export function getPluginDb(pluginId: string): PluginDb;
export async function provisionPluginDb(pluginId: string): Promise<void>;
export async function dropPluginDb(pluginId: string): Promise<void>;
```

All three read the global `resolveDialect(process.env)` internally. There is no way to pass a
per-plugin dialect override — it is always the platform dialect.

**Migration runner** (`runtime/src/plugin-migrations.ts`):

```ts
const { dialect } = resolveDialect(process.env); // one global value
for (const manifest of registry) {
  if (manifest.database !== 'isolated') continue;
  const folder = pluginMigrationsFolder(pluginDir, dialect); // same for all
  // ...
}
```

**SDK host** (`runtime/src/sdk-host.ts:64–74`):

```ts
if (manifest?.database === 'isolated') {
  await provisionPluginDb(pluginId);
  return getPluginDb(pluginId).db;
}
```

No dialect information flows from the manifest to the provisioning call.

---

## Proposed design

### 5.1 — Manifest schema extension

Replace the simple enum with a union that accepts either the existing string form (for backward
compatibility) or a new object form:

```ts
// packages/manifest/src/schema.ts
database: z
  .union([
    z.enum(['shared', 'isolated']),                          // backward compat
    z.object({
      isolation: z.enum(['shared', 'isolated']).optional(),  // defaults to 'shared'
      dialect: z.enum(['sqlite']).optional(),                 // 'postgres' omitted intentionally
    }).strict(),
  ])
  .optional(),
```

Note: `'postgres'` is deliberately **not** a valid value for the manifest `dialect` field. The
platform-as-ceiling rule means a plugin can only ever request the platform's dialect (by omitting
the field) or a lesser dialect (SQLite). There is no scenario where a plugin declares `'postgres'`
and has it mean anything other than "same as the platform" — so it is excluded to avoid confusion.

A plugin that simply wants an isolated Postgres store (same as the platform) continues to write:

```json
{ "database": "isolated" }
```

A plugin that wants an isolated SQLite store regardless of the platform dialect writes:

```json
{ "database": { "isolation": "isolated", "dialect": "sqlite" } }
```

Omitting `isolation` in the object form defaults to `'shared'`, just as omitting the field itself
does.

### 5.2 — Allowed combinations

| Platform dialect | Manifest declaration                           | Resolved plugin dialect | Allowed? |
| ---------------- | ---------------------------------------------- | ----------------------- | -------- |
| SQLite           | _(omitted)_                                    | SQLite                  | ✅       |
| SQLite           | `"isolated"`                                   | SQLite                  | ✅       |
| SQLite           | `{ isolation: "isolated" }`                    | SQLite                  | ✅       |
| SQLite           | `{ isolation: "isolated", dialect: "sqlite" }` | SQLite                  | ✅       |
| Postgres         | _(omitted)_                                    | Postgres                | ✅       |
| Postgres         | `"isolated"`                                   | Postgres                | ✅       |
| Postgres         | `{ isolation: "isolated" }`                    | Postgres                | ✅       |
| Postgres         | `{ isolation: "isolated", dialect: "sqlite" }` | **SQLite**              | ✅       |

`dialect: 'postgres'` is not a valid manifest value and is rejected by the Zod schema regardless
of the platform dialect.

### 5.3 — Validation at install time

`sv plugin add` (and the runtime's manifest parser) resolve and validate the combination before
provisioning:

1. Parse the manifest with the updated Zod schema.
2. Extract the requested dialect:
   ```ts
   function resolvePluginDialect(manifest: Manifest): Dialect {
     if (typeof manifest.database === 'object' && manifest.database.dialect) {
       return manifest.database.dialect; // 'sqlite' only, per schema
     }
     return resolveDialect(process.env).dialect; // inherit platform
   }
   ```
3. If resolved plugin dialect is `'postgres'` and platform dialect is `'sqlite'`: **this cannot
   happen** under the schema (there is no `'postgres'` value in the manifest). No runtime check
   needed — the Zod schema is the enforcement point.

Validation therefore requires no new runtime logic beyond extending the Zod schema and the dialect
resolution helper. The schema itself encodes the ceiling rule.

### 5.4 — Code touch points

**`packages/manifest/src/schema.ts`** — union schema (described in §5.1). Version bump:
`@sovereignfs/manifest` → minor.

**`packages/db/src/plugin-client.ts`** — add optional `dialect?` param to the three public
functions. When omitted, falls back to `resolveDialect(process.env).dialect` as today:

```ts
export function getPluginDb(pluginId: string, dialect?: Dialect): PluginDb;
export async function provisionPluginDb(pluginId: string, dialect?: Dialect): Promise<void>;
export async function dropPluginDb(pluginId: string, dialect?: Dialect): Promise<void>;
```

Version bump: `@sovereignfs/db` → minor (new optional parameter).

**`runtime/src/sdk-host.ts`** — extract dialect from the manifest and pass it through:

```ts
const pluginDialect = typeof manifest.database === 'object' ? manifest.database.dialect : undefined;
await provisionPluginDb(pluginId, pluginDialect);
return getPluginDb(pluginId, pluginDialect).db;
```

**`runtime/src/plugin-migrations.ts`** — per-plugin dialect variable inside the loop:

```ts
const { dialect: platformDialect } = resolveDialect(process.env);
for (const manifest of registry) {
  // ...
  const pluginDialect = resolvePluginDialect(manifest) ?? platformDialect;
  const folder = pluginMigrationsFolder(pluginDir, pluginDialect);
  await provisionPluginDb(manifest.id, pluginDialect);
  const pluginDb = getPluginDb(manifest.id, pluginDialect);
  // ...
}
```

**`bin/sv.ts`** (`sv plugin remove`) — read dialect from the raw manifest JSON before dropping the
store, applying the same union-type narrowing as above.

Version bump: `runtime` → patch, `bin/sv` → patch.

### 5.5 — Migration path for existing plugins

Old manifest `"database": "isolated"` strings continue to parse as the string branch of the union.
All existing provisioning, migration, and drop logic is unchanged — the optional `dialect?` param
defaults to `undefined`, which resolves to the platform dialect as before. Zero changes needed in
existing plugin manifests.

---

## Alternatives considered

### A — Allow `dialect: 'postgres'` with a separate `PLUGIN_DB_URL` env var

A plugin could declare `dialect: 'postgres'` and the operator would supply `SV_PLUGIN_<SLUG>_DB_URL`
pointing to an arbitrary Postgres server. This would support the BYO-database use-case deferred in
RFC 0004.

**Rejected for now:** It significantly expands scope (new env var convention, per-plugin connection
pool management, operator documentation), and the use-case is niche. RFC 0004 already deferred
BYO-DB explicitly. This can be a follow-on RFC when there is concrete demand.

### B — No dialect override (platform dialect only)

Keep the current behaviour: dialect is always platform-wide. Plugins that need a different store
manage it themselves outside the SDK.

**Rejected:** Loses the SQLite-on-Postgres use-case (lightweight embedded stores, offline-first
plugins) at very low implementation cost. The ceiling rule makes the scope well-defined and safe.

### C — Allow override in both directions with a compatibility check at boot

A plugin declares `dialect: 'postgres'` and the runtime checks at boot whether a Postgres URL is
available. If not, the plugin is disabled.

**Rejected:** The ceiling rule is cleaner — it catches the incompatibility at install/parse time
rather than at boot, and it avoids the operator-surprise of a plugin silently disabling itself
because they forgot a second connection string.

---

## Open questions

1. **Plugin-scoped dialect URL (future BYO-DB path):** If a future RFC introduces
   `PLUGIN_<SLUG>_DB_URL` to support truly external databases, should the manifest's `dialect`
   field be extended to `'postgres'` at that point, or should BYO-DB use a separate manifest
   field entirely? Deferred to that RFC.

2. **WAL mode on cross-dialect SQLite files in a Postgres deployment:** The current
   `getPluginDb` for SQLite always enables WAL mode and foreign keys. Should this be configurable
   per-plugin, or is the current default always appropriate for cross-dialect plugin stores?

3. **Registry label for dialect requirement:** The public plugin registry
   (`registry/plugins.json`) currently has no field for declaring what platform dialect a plugin
   requires or prefers. If a plugin ships with only SQLite migrations, the registry should
   surface that so operators know before installing. Should `dialect` be reflected in the registry
   entry? Deferred to a registry-schema RFC.

---

## Adoption path

This is a single backward-compatible task (epic task 3.15). No existing plugin manifests or
platform deployments require any change. Plugin developers who want to opt into SQLite storage on
a Postgres platform add one field to their manifest and ship SQLite migrations alongside their
Postgres migrations.

The feature is invisible to plugins that do not opt in.

---

## Changelog

- **v0.1** (June 2026) — Initial draft.
