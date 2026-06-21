import { getPlatformDb, insertPluginStatusIfAbsent } from '@sovereignfs/db';
import { getInstalledPlugins } from './registry';

/**
 * Seed default enabled/disabled state for example plugins.
 *
 * Example plugins (IDs containing ".example-") ship in the monorepo for
 * demonstration purposes and should be disabled by default so a fresh
 * instance doesn't expose them to end-users without a deliberate choice.
 *
 * Uses INSERT … ON CONFLICT DO NOTHING so this is idempotent: a row that
 * already exists (operator explicitly enabled or disabled the plugin) is
 * never overwritten.
 */
export async function seedBootDefaults(): Promise<void> {
  const pdb = await getPlatformDb();

  for (const manifest of getInstalledPlugins()) {
    if (manifest.id.includes('.example-')) {
      await insertPluginStatusIfAbsent(pdb, manifest.id, false);
    }
  }
}
