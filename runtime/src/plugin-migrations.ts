import { existsSync } from 'node:fs';
import {
  getPluginDb,
  pluginMigrationsFolder,
  provisionPluginDb,
  resolveDialect,
  runPluginMigrations,
} from '@sovereignfs/db';
import { registry } from '../generated/registry';

/**
 * Run per-plugin migrations for all installed isolated-database plugins (RFC 0004).
 *
 * Called from `instrumentation.ts` register() at Node.js server startup, after
 * the SDK host is registered and before the compatibility check. Errors are logged
 * but do not abort startup — a failed plugin migration should not take the entire
 * platform down; the compatibility check still gates plugin access afterward.
 */
export async function runIsolatedPluginMigrations(): Promise<void> {
  const { dialect } = resolveDialect(process.env);

  for (const manifest of registry) {
    if (manifest.database !== 'isolated') continue;

    // sv plugin add names the dir after the manifest id, so plugins/<id>/ is canonical.
    const pluginDir = `plugins/${manifest.id}`;
    const folder = pluginMigrationsFolder(pluginDir, dialect);
    if (!existsSync(folder)) continue;

    try {
      await provisionPluginDb(manifest.id);
      const pluginDb = getPluginDb(manifest.id);
      await runPluginMigrations(pluginDb, folder);
    } catch (err) {
      console.error(
        `[sovereign] Failed to run migrations for isolated plugin "${manifest.id}":`,
        err,
      );
    }
  }
}
