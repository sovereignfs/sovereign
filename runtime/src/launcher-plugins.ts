import type { SidebarPluginEntry } from '@sovereignfs/db';
import { hasCapability } from './capabilities';
import type { PluginRouteInfo } from './route-guard';

/**
 * Platform chrome plugins — reachable through the sidebar chrome (home `/`,
 * Console ⚙, Account avatar), never listed among the Launcher tiles or the
 * sidebar's middle plugin-icon section (SRS LCH-04, PLT-12).
 */
export const CHROME_PLUGIN_IDS: ReadonlySet<string> = new Set([
  'fs.sovereign.launcher',
  'fs.sovereign.account',
  'fs.sovereign.console',
]);

/** The Launcher-visible projection of a plugin manifest. */
export interface LauncherPlugin {
  id: string;
  name: string;
  description: string;
  routePrefix: string;
  adminOnly: boolean;
  type?: string;
  /** Path-relative URL to the plugin's icon, e.g. `/plugin-icons/<id>.svg`. Absent when the plugin ships no icon. */
  iconUrl?: string;
}

/** A plugin manifest with the fields the Launcher projection needs. */
export interface LauncherPluginInput extends PluginRouteInfo {
  name: string;
  description?: string;
  icon?: string;
  type?: string;
}

/**
 * The non-chrome, enabled plugins shown in the sidebar's middle icon section
 * (and the mobile Drawer), preserving input order. Disabled plugins — including
 * example plugins hidden by the `SOVEREIGN_EXAMPLES_ENABLED` default — are
 * excluded so no sidebar icon points at a route the middleware 404s. Generic so
 * the shell can pass full manifest objects through untouched.
 */
export function selectSidebarPlugins<T extends { id: string }>(
  plugins: readonly T[],
  disabledIds: ReadonlySet<string>,
): T[] {
  return plugins.filter((p) => !CHROME_PLUGIN_IDS.has(p.id) && !disabledIds.has(p.id));
}

/**
 * Select the plugins a user should see in the Launcher (SRS LCH-01/03/04):
 * installed, enabled (not in `disabledIds`), and not platform chrome. Admin-only
 * plugins are included only for users with `console:access` — non-admins never
 * receive them. Each result carries `adminOnly` so the Launcher can render the
 * admin tiles in their own section.
 */
export function selectLauncherPlugins(
  plugins: readonly LauncherPluginInput[],
  disabledIds: ReadonlySet<string>,
  role: string,
): LauncherPlugin[] {
  const isAdmin = hasCapability(role, 'console:access');
  return plugins
    .filter((p) => !CHROME_PLUGIN_IDS.has(p.id))
    .filter((p) => !disabledIds.has(p.id))
    .filter((p) => isAdmin || !p.adminOnly)
    .map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description ?? '',
      routePrefix: p.routePrefix,
      adminOnly: p.adminOnly ?? false,
      ...(p.type ? { type: p.type } : {}),
      ...(p.icon ? { iconUrl: `/plugin-icons/${p.id}.svg` } : {}),
    }));
}

/**
 * Apply a user's saved sidebar order (Task 2.13) to an already-filtered plugin
 * list, shared by the sidebar chrome and the Launcher grid (Task 2.22) so both
 * surfaces present a consistent order. `plugins` must already reflect the
 * caller's own visibility rules (chrome exclusion, disabled plugins, and for
 * the Launcher, role/admin filtering) — an id present in `saved` but absent
 * from `plugins` is silently dropped, so a saved order can never resurrect a
 * plugin the caller has already decided this request shouldn't see.
 *
 * `dropHidden` distinguishes the two callers' visibility semantics: the
 * sidebar strip excludes entries the user marked hidden (`true`); the
 * Launcher grid is the "see everything" view, so hidden entries stay in the
 * result and are only reordered (`false`).
 *
 * Plugins not yet present in `saved` (newly installed since the user last
 * customised their order) are appended at the end in their original order —
 * matching the previous sidebar-only behavior this replaces.
 */
export function applySidebarOrder<T extends { id: string }>(
  plugins: readonly T[],
  saved: readonly SidebarPluginEntry[] | null,
  options: { dropHidden: boolean },
): T[] {
  if (!saved) return [...plugins];
  const idMap = new Map(plugins.map((p) => [p.id, p]));
  const ordered = saved
    .filter((e) => idMap.has(e.id) && !(options.dropHidden && e.hidden))
    .flatMap((e) => {
      const p = idMap.get(e.id);
      return p ? [p] : [];
    });
  const knownIds = new Set(saved.map((e) => e.id));
  for (const p of plugins) {
    if (!knownIds.has(p.id)) ordered.push(p);
  }
  return ordered;
}
