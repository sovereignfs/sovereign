/**
 * Plugin catalog and install-time activation (RFC 0065, epic task 3.28).
 *
 * Splits "which plugins are bundled in the image" (every plugin present in
 * the generated registry) from "which plugins an admin has turned on for this
 * instance" (has a `plugin_status` row). Migrations for every registry plugin
 * already run unconditionally at every boot (`./plugin-migrations.ts`'s
 * `runAllPluginMigrations`), independent of activation state — so activating
 * a plugin here only needs to create its `plugin_status` row; migrations are
 * already current by the time an admin can reach this action.
 */
import {
  createPluginStatusRowIfAbsent,
  getPlatformSetting,
  setPlatformSetting,
  type PlatformDb,
} from '@sovereignfs/db';
import type { SovereignManifest } from '@sovereignfs/manifest';
import { CHROME_PLUGIN_IDS } from './launcher-plugins';

/** Platform-settings key marking the one-time catalog backfill as complete. */
const CATALOG_BACKFILL_SETTING = 'plugin_catalog_backfilled';

export interface PluginCatalogEntry {
  id: string;
  name: string;
  description: string;
  /** Has an explicit `plugin_status` row — i.e. an admin has activated it. */
  active: boolean;
}

/**
 * One-time backfill: create an explicit `access_policy = 'everyone'` row for
 * every plugin currently in the registry that has no row yet, so "absent row"
 * unambiguously means "cataloged but never activated" from this point
 * forward. Gated by a platform setting so it runs exactly once per instance —
 * a plugin added to the catalog *after* this has already run legitimately
 * starts uncataloged/inactive, requiring explicit activation. Idempotent and
 * safe to call on every boot; the flag check makes repeat calls a no-op.
 */
export async function backfillPluginCatalogOnce(
  pdb: PlatformDb,
  installedPlugins: readonly SovereignManifest[],
): Promise<void> {
  const done = await getPlatformSetting(pdb, CATALOG_BACKFILL_SETTING);
  if (done === 'true') return;

  for (const manifest of installedPlugins) {
    if (CHROME_PLUGIN_IDS.has(manifest.id)) continue;
    await createPluginStatusRowIfAbsent(pdb, manifest.id, {
      enabled: true,
      accessPolicy: 'everyone',
      selfService: false,
    });
  }
  await setPlatformSetting(pdb, CATALOG_BACKFILL_SETTING, 'true');
}

/**
 * The full plugin catalog — every non-chrome plugin bundled in the image,
 * annotated with whether it's currently active (has a `plugin_status` row,
 * per the caller's own `listPluginStatus` lookup — "active" is precisely
 * "has an explicit row", the same signal `createPluginStatusRowIfAbsent`
 * checks). Pure/sync — no DB access of its own.
 */
export function getPluginCatalog(
  installedPlugins: readonly SovereignManifest[],
  activePluginIds: ReadonlySet<string>,
): PluginCatalogEntry[] {
  return installedPlugins
    .filter((manifest) => !CHROME_PLUGIN_IDS.has(manifest.id))
    .map((manifest) => ({
      id: manifest.id,
      name: manifest.name,
      description: manifest.description ?? '',
      active: activePluginIds.has(manifest.id),
    }));
}

export type ActivatePluginResult =
  | { activated: true }
  | { activated: false; reason: 'already-active' };

/**
 * Activate a cataloged-but-inactive plugin: create its `plugin_status` row
 * with `access_policy = 'disabled'` (the operator sets a real policy from
 * Console next — Task 13.7). No-op if already active. Chrome plugins are
 * always active by construction and cannot be activated through this path.
 */
export async function activatePlugin(
  pdb: PlatformDb,
  pluginId: string,
): Promise<ActivatePluginResult> {
  const inserted = await createPluginStatusRowIfAbsent(pdb, pluginId, {
    enabled: true,
    accessPolicy: 'disabled',
    selfService: false,
  });
  return inserted ? { activated: true } : { activated: false, reason: 'already-active' };
}
