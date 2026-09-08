/**
 * Boot-time compatibility check — runs once at startup (called from
 * `runtime/instrumentation.ts`) before any request is served.
 *
 * Iterates installed plugins and checks each against the current platform
 * version. An incompatible non-chrome plugin is disabled in `plugin_status`
 * (so the middleware gate treats it as disabled); a chrome plugin is never
 * disabled this way (see the CHROME_PLUGIN_IDS check below). Every reason is
 * stored in the in-memory `plugin-compat.ts` module (read by the health +
 * admin API routes) regardless.
 */
import { getPlatformDb, setPluginEnabled } from '@sovereignfs/db';
import { checkCompatibility } from '@sovereignfs/manifest';
import { CHROME_PLUGIN_IDS } from './launcher-plugins';
import { getInstalledPlugins } from './registry';
import { markIncompatible, recordWarnings } from './plugin-compat';
import { getPlatformVersion } from './platform-version';

export async function checkBootCompatibility(): Promise<void> {
  const platformVersion = getPlatformVersion();
  const pdb = await getPlatformDb();

  for (const manifest of getInstalledPlugins()) {
    // Per-plugin isolation, mirroring runAllPluginMigrations()'s pattern
    // (plugin-migrations.ts): a single manifest's checkCompatibility() throw
    // (e.g. semver.gt() on a malformed minPlatformVersion/maxPlatformVersion
    // string) or setPluginEnabled() rejection must not stop every subsequent
    // manifest in getInstalledPlugins()'s iteration order from being
    // evaluated. A caught fault here is NOT treated as "compatible" -- the
    // plugin simply isn't marked incompatible or warned about this boot; it
    // is not silently allowed past a check that would have caught it.
    try {
      const result = checkCompatibility(manifest, platformVersion);

      if (!result.compatible && result.reason) {
        markIncompatible(manifest.id, result.reason);
        // Chrome plugins (Console/Launcher/Account/Inbox) are "always enabled
        // and cannot be toggled" (see the PATCH /api/admin/plugins/[id] guard)
        // -- that route refuses to flip their plugin_status row in either
        // direction, and Console's Apps catalog excludes them entirely
        // (getPluginCatalog), so a chrome plugin has no admin-reachable way
        // back from an explicit `enabled: false` row. Writing one here would
        // 404 its routes platform-wide (e.g. the shell's own Inbox bell) with
        // no recovery short of a direct DB edit. Still marked incompatible
        // above so the reason surfaces in the health/admin routes.
        if (CHROME_PLUGIN_IDS.has(manifest.id)) {
          console.warn(
            `[boot-compat] Chrome plugin "${manifest.id}" is incompatible but ` +
              `cannot be disabled (chrome plugins are always enabled): ${result.reason}`,
          );
        } else {
          console.warn(
            `[boot-compat] Disabling incompatible plugin "${manifest.id}": ${result.reason}`,
          );
          await setPluginEnabled(pdb, manifest.id, false);
        }
      } else {
        recordWarnings(manifest.id, result.warnings);
        for (const w of result.warnings) {
          console.warn(`[boot-compat] ${w}`);
        }
      }
    } catch (err) {
      console.error(
        `[boot-compat] Failed to check compatibility for plugin "${manifest.id}":`,
        err,
      );
    }
  }
}
