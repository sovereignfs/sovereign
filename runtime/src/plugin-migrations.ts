import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  dbEncryptionKeyFromEnv,
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
import {
  manifestDatabaseDialect,
  manifestDatabaseIsolation,
  manifestRequiresEncryption,
} from '@sovereignfs/manifest';
import { registry } from '../generated/registry';

/**
 * Enforce a plugin's `database.requireEncryption` (RFC 0071) before its
 * migrations run. **Raise-only and never silent**:
 *
 * - SQLite + no instance key configured → throws, aborting startup. This is
 *   deliberately not caught by the per-plugin try/catch below (a migration
 *   failure logs and continues; a broken security promise must not).
 * - Postgres → warns (there is no SQLCipher equivalent for Postgres; at-rest
 *   protection falls back to disk encryption + `sslmode`), does not throw.
 * - Not required, or `shared` isolation → no-op (manifest validation already
 *   rejects `requireEncryption` on a `shared` plugin).
 */
export function assertPluginEncryptionRequirement(
  pluginId: string,
  database: unknown,
  pluginDialect: 'sqlite' | 'postgres',
): void {
  if (!manifestRequiresEncryption(database)) return;

  if (pluginDialect === 'postgres') {
    console.warn(
      `[sovereign] Plugin "${pluginId}" requires database encryption, but its isolated ` +
        'database resolved to Postgres — there is no SQLCipher equivalent there. At-rest ' +
        'protection falls back to disk/volume encryption + `sslmode` for this plugin.',
    );
    return;
  }

  if (dbEncryptionKeyFromEnv() === undefined) {
    throw new Error(
      `Plugin "${pluginId}" requires database encryption — set SOVEREIGN_DB_ENCRYPTION_KEY ` +
        'to enable it, or remove the plugin.',
    );
  }
}

/**
 * Run pending schema migrations for all installed plugins (RFC 0004).
 *
 * Two database modes are supported:
 * - `isolated` — plugin owns a dedicated SQLite file / Postgres schema; migrations
 *   run there and never touch the platform DB.
 * - `shared` (or omitted) — plugin writes into the platform DB; migrations run
 *   there after the platform's own migrations have already applied (enforced by
 *   the call order in instrumentation.ts). Trusted first-party plugins only.
 *
 * Plugins with no `migrations/{sqlite,postgres}/` folder are skipped silently.
 * A failed plugin migration is logged but does not abort startup — the
 * compatibility check that follows will gate access to the broken plugin.
 *
 * Called from `instrumentation.ts` register() at Node.js server startup.
 */
export async function runAllPluginMigrations(): Promise<void> {
  const { dialect: platformDialect } = resolveDialect(process.env);

  // Build a map from manifest id → actual on-disk directory name.
  // `sv plugin add` names dirs after the manifest id (plugins/<id>/), but local
  // development dirs may use a different name (e.g. plugins/sovereign-tasks.local/).
  // Scanning lets both cases resolve correctly without assuming dir === id.
  const idToDir = buildIdToDirMap();

  for (const manifest of registry) {
    const isolation = manifestDatabaseIsolation(manifest.database);
    const isIsolated = isolation === 'isolated';
    const isShared = isolation === 'shared';
    if (!isIsolated && !isShared) continue;

    const dirName = idToDir.get(manifest.id) ?? manifest.id;
    const pluginDir = `plugins/${dirName}`;
    const pluginDialect = isIsolated
      ? (manifestDatabaseDialect(manifest.database) ?? platformDialect)
      : platformDialect;

    if (isIsolated) {
      assertPluginEncryptionRequirement(manifest.id, manifest.database, pluginDialect);
    }

    const folder = pluginMigrationsFolder(pluginDir, pluginDialect);
    if (!existsSync(folder)) continue;

    try {
      if (isIsolated) {
        await provisionPluginDb(manifest.id, pluginDialect);
        const pluginDb = getPluginDb(manifest.id, pluginDialect);
        await runPluginMigrations(pluginDb, folder);
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

function buildIdToDirMap(): Map<string, string> {
  const map = new Map<string, string>();
  const pluginsRoot = join(findWorkspaceRoot(), 'plugins');
  if (!existsSync(pluginsRoot)) return map;

  for (const entry of readdirSync(pluginsRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const manifestPath = join(pluginsRoot, entry.name, 'manifest.json');
    if (!existsSync(manifestPath)) continue;
    try {
      const m = JSON.parse(readFileSync(manifestPath, 'utf8')) as { id?: string };
      if (typeof m.id === 'string') map.set(m.id, entry.name);
    } catch {
      // ignore unreadable manifests — generate-registry.ts will catch them
    }
  }
  return map;
}
