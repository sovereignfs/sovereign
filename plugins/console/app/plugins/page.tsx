import { headers } from 'next/headers';
import { getPlatformDb } from '@/src/db';
import { CHROME_PLUGIN_IDS } from '@/src/launcher-plugins';
import { canUserOpenPlugin } from '@/src/plugin-access-server';
import { getExamplesEnabledFlag } from '@/src/plugin-status';
import { getPluginCatalogAction } from './actions';
import { PluginInstallPanel } from './PluginInstallPanel';
import { PluginsTable, type PluginRow, type PluginStatus } from './PluginsTable';
import styles from '../console.module.css';

interface RawPluginRow {
  id: string;
  name: string;
  version: string;
  description: string | null;
  type: string;
  routePrefix: string;
  adminOnly: boolean;
  example: boolean;
  enabled: boolean;
  compatibilityError: string | null;
  compatibilityWarnings: string[];
}

async function getPlugins(): Promise<RawPluginRow[]> {
  const adminKey = process.env.SOVEREIGN_ADMIN_KEY ?? '';
  const selfUrl = `http://localhost:${process.env.RUNTIME_PORT ?? '3000'}`;
  try {
    const res = await fetch(`${selfUrl}/api/admin/plugins`, {
      headers: { Authorization: `Bearer ${adminKey}` },
      cache: 'no-store',
    });
    if (!res.ok) {
      console.error(`[plugins] fetch failed: ${res.status}`);
      return [];
    }
    return res.json() as Promise<RawPluginRow[]>;
  } catch (err) {
    console.error('[plugins] fetch error:', err instanceof Error ? err.message : err);
    return [];
  }
}

/**
 * Merge the two existing data sources into one row per cataloged plugin
 * (RFC 0065 Task 13.9). `/api/admin/plugins` already returns every registry
 * plugin, not just active ones, with version/type/route/compatibility — but
 * its `enabled` flag is only meaningful once a plugin is actually active
 * (Task 3.28); `active` from the catalog is the authoritative "has a
 * plugin_status row" signal, so it decides `inactive` before `enabled` is
 * ever consulted.
 *
 * A row-less example plugin is the one exception: it counts as active when
 * the examples bulk toggle is on, even though it has no `plugin_status` row
 * — it's genuinely visible in the sidebar/Launcher in that state (see
 * `resolveAccessPolicy` in `@/src/plugin-access-server`), so Console must not
 * show it as "Inactive".
 */
async function buildPluginRows(
  examplesEnabled: boolean,
): Promise<Omit<PluginRow, 'openableByViewer'>[]> {
  const [rawPlugins, catalog] = await Promise.all([getPlugins(), getPluginCatalogAction()]);
  const activeIds = new Set(catalog.filter((e) => e.active).map((e) => e.id));

  return rawPlugins.map((p) => {
    const isChrome = CHROME_PLUGIN_IDS.has(p.id);
    const isActive = isChrome || activeIds.has(p.id) || (p.example && examplesEnabled);
    const status: PluginStatus = p.compatibilityError
      ? 'incompatible'
      : !isActive
        ? 'inactive'
        : p.enabled
          ? 'enabled'
          : 'disabled';
    return { ...p, status, isChrome };
  });
}

/**
 * Whether the viewing admin can open each plugin's app (RFC 0065) — separate
 * from Console management access. Computed server-side directly (not via the
 * `/api/admin/plugins` admin-key route, which has no per-user identity) so
 * the "Open" affordance can be disabled with a reason rather than hidden.
 */
async function withOpenability(rows: Omit<PluginRow, 'openableByViewer'>[]): Promise<PluginRow[]> {
  const h = await headers();
  const userId = h.get('x-sovereign-user-id');
  const role = h.get('x-sovereign-user-role') ?? 'platform:user';
  if (!userId) return rows.map((r) => ({ ...r, openableByViewer: false }));

  const pdb = await getPlatformDb();
  const results = await Promise.all(
    rows.map((r) => canUserOpenPlugin(pdb, userId, role, r.id, true, r.status === 'enabled')),
  );
  return rows.map((r, i) => ({ ...r, openableByViewer: results[i] ?? false }));
}

export default async function PluginsPage() {
  const examplesEnabled = await getExamplesEnabledFlag(await getPlatformDb());
  const rows = await withOpenability(await buildPluginRows(examplesEnabled));

  return (
    <div className={styles.sections}>
      <PluginInstallPanel />
      <PluginsTable rows={rows} defaultShowExamples={examplesEnabled} />
    </div>
  );
}
