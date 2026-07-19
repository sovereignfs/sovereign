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
 *
 * There used to be a `backfillPluginCatalogOnce()` here that eagerly created
 * an `enabled: true, accessPolicy: 'everyone'` row for every non-chrome
 * plugin on an instance's first boot — including example plugins. It was
 * removed (2026-07-19) because it made every plugin, examples included,
 * active from the very first boot regardless of the "examples ship hidden by
 * default" setting and the "regular plugins start disabled until an admin
 * activates them" catalog model — an explicit row always wins over both, so
 * the backfill permanently defeated them. It also wasn't needed for its
 * stated purpose: the `access_policy`/`self_service` columns were added by a
 * migration (`0016_plugin_access_policy.sql`) with a SQL-level
 * `DEFAULT ... NOT NULL`, which already backfills every *existing*
 * `plugin_status` row at ALTER time — so a genuinely row-less plugin has
 * always meant "cataloged but never activated," with no app-level bootstrap
 * required. See RFC 0065's changelog for the full writeup and the one
 * narrow compatibility case this trades away.
 */
import type { PlatformDb } from '@sovereignfs/db';
import { createPluginStatusRowIfAbsent } from '@sovereignfs/db';
import type { SovereignManifest } from '@sovereignfs/manifest';
import { CHROME_PLUGIN_IDS } from './launcher-plugins';

export interface PluginCatalogEntry {
  id: string;
  name: string;
  description: string;
  /** Has an explicit `plugin_status` row — i.e. an admin has activated it. */
  active: boolean;
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
