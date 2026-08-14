import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  findWorkspaceRoot,
  getPluginDb,
  getPlatformDb,
  pluginMigrationsFolder,
  pluginMigrationsTableName,
  provisionPluginDb,
  resolveDialect,
  runPluginMigrations,
  type PluginDb,
} from '@sovereignfs/db';
import { manifestDatabaseIsolation } from '@sovereignfs/manifest';
import { registry } from '../generated/registry';

/**
 * Run pending schema migrations for all installed plugins (RFC 0004).
 *
 * Every `sovereign`/`community` plugin is unconditionally isolated — its own
 * dedicated sqld namespace / Postgres schema; migrations run there and never
 * touch the platform DB. There is no per-plugin choice anymore (the
 * `database.isolation`/`"shared"` manifest option was retired). The one
 * exception is `type: "platform"` (`account`, `console`, `launcher`): they
 * administer the platform's own core data directly, the same as
 * `apps/auth`, and are never isolated — in practice this branch is
 * currently unreachable for them anyway, since none of the three declare a
 * `migrations/` folder of their own.
 *
 * Plugins with no `migrations/{sqlite,postgres}/` folder are skipped silently,
 * as are plugins declaring manifest `disabled: true` (a hard disable — see
 * `packages/manifest/src/schema.ts`'s doc comment).
 * A failed plugin migration is logged but does not abort startup — the
 * compatibility check that follows will gate access to the broken plugin.
 * One plugin's failure must not take every *other* plugin down with it just
 * because it happens to sort before them (`registry` iterates in a fixed
 * alphabetical order, not dependency or install order) — a real production
 * incident (see `docs/incidents/2026-07-24-rfc-0071-encryption-rollout.md`)
 * came from an earlier version of this function letting one plugin's
 * uncaught throw abort the whole loop.
 *
 * Called from `instrumentation.ts` register() at Node.js server startup.
 */
export async function runAllPluginMigrations(): Promise<void> {
  const { dialect: platformDialect } = resolveDialect(process.env);

  // Build a map from manifest id → actual on-disk directory (base + name).
  // `sv plugin add` names dirs after the manifest id (plugins/<id>/), but local
  // development dirs may use a different name (e.g. plugins/sovereign-tasks.local/).
  // Scanning lets both cases resolve correctly without assuming dir === id. Also
  // scans `example-plugins/` (composed alongside `plugins/` only when
  // SOVEREIGN_EXAMPLES_ENABLED is set — see generate-registry.ts) so example
  // plugins' own migrations are found too, not just their composed routes.
  const idToDir = buildIdToDirMap();

  for (const manifest of registry) {
    // Manifest hard-disable (`disabled: true`) — an author declaration to
    // take a plugin fully out of reach, not just an admin's per-instance
    // toggle. No reason to keep provisioning/migrating an isolated DB for a
    // plugin nobody can reach.
    if (manifest.disabled) continue;

    const isIsolated = manifestDatabaseIsolation(manifest.type) === 'isolated';

    const located = idToDir.get(manifest.id);
    const pluginDir = located ? `${located.base}/${located.dir}` : `plugins/${manifest.id}`;

    const folder = pluginMigrationsFolder(pluginDir, platformDialect);
    if (!existsSync(folder)) continue;

    try {
      if (isIsolated) {
        await provisionPluginDb(manifest.id);
        const pluginDb = getPluginDb(manifest.id);
        // Postgres only: drizzle's node-postgres migrator tracks applied
        // migrations in a fixed `drizzle` schema regardless of the
        // connection's search_path, so every isolated Postgres plugin
        // sharing the untouched default table name (`__drizzle_migrations`)
        // collides in that one shared table — exactly the hazard
        // pluginMigrationsTableName() already exists to prevent for shared
        // mode, just never extended to isolated-mode Postgres because there
        // was only ever one such plugin until task 8.25's migration. SQLite
        // isolated plugins are unaffected (a genuinely separate namespace per
        // plugin) and must keep the untouched default — every existing one
        // already has real history under that name; scoping this by
        // pluginDb.dialect is load-bearing, not cosmetic.
        const migrationsTable =
          pluginDb.dialect === 'postgres' ? pluginMigrationsTableName(manifest.id) : undefined;
        await runPluginMigrations(pluginDb, folder, migrationsTable);
      } else {
        // PlatformDb is structurally identical to PluginDb ({ dialect, db }
        // discriminated union). The cast is safe: runPluginMigrations only
        // accesses .dialect and .db, both of which exist on PlatformDb.
        const pdb = await getPlatformDb();
        await runPluginMigrations(
          pdb as unknown as PluginDb,
          folder,
          pluginMigrationsTableName(manifest.id),
        );
      }
    } catch (err) {
      console.error(`[sovereign] Failed to run migrations for plugin "${manifest.id}":`, err);
    }
  }
}

function buildIdToDirMap(): Map<string, { base: string; dir: string }> {
  const map = new Map<string, { base: string; dir: string }>();
  const workspaceRoot = findWorkspaceRoot();

  for (const base of ['plugins', 'example-plugins']) {
    const root = join(workspaceRoot, base);
    if (!existsSync(root)) continue;

    for (const entry of readdirSync(root, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const manifestPath = join(root, entry.name, 'manifest.json');
      if (!existsSync(manifestPath)) continue;
      try {
        const m = JSON.parse(readFileSync(manifestPath, 'utf8')) as { id?: string };
        if (typeof m.id === 'string') map.set(m.id, { base, dir: entry.name });
      } catch {
        // ignore unreadable manifests — generate-registry.ts will catch them
      }
    }
  }
  return map;
}
