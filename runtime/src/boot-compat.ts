/**
 * Boot-time compatibility check — runs once at startup (called from
 * `runtime/instrumentation.ts`) before any request is served.
 *
 * Iterates installed plugins and checks each against the current platform
 * version. Incompatible plugins are disabled in `plugin_status` (so the
 * middleware gate treats them as disabled) and their reasons are stored in the
 * in-memory `plugin-compat.ts` module (read by the health + admin API routes).
 */
import { getPlatformDb, setPluginEnabled } from '@sovereignfs/db';
import { checkCompatibility } from '@sovereignfs/manifest';
import { getInstalledPlugins } from './registry';
import { markIncompatible, recordWarnings } from './plugin-compat';
import { getPlatformVersion } from './platform-version';

export async function checkBootCompatibility(): Promise<void> {
  const platformVersion = getPlatformVersion();
  const pdb = await getPlatformDb();

  for (const manifest of getInstalledPlugins()) {
    const result = checkCompatibility(manifest, platformVersion);

    if (!result.compatible && result.reason) {
      console.warn(
        `[boot-compat] Disabling incompatible plugin "${manifest.id}": ${result.reason}`,
      );
      markIncompatible(manifest.id, result.reason);
      await setPluginEnabled(pdb, manifest.id, false);
    } else {
      recordWarnings(manifest.id, result.warnings);
      for (const w of result.warnings) {
        console.warn(`[boot-compat] ${w}`);
      }
    }
  }
}
