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
  /** Path-relative URL to the plugin's icon, e.g. `/plugin-icons/<id>.svg`. Absent when the plugin ships no icon. */
  iconUrl?: string;
}

/** A plugin manifest with the fields the Launcher projection needs. */
export interface LauncherPluginInput extends PluginRouteInfo {
  name: string;
  description?: string;
  icon?: string;
}

/**
 * Select the plugins a user should see in the Launcher (SRS LCH-01/03/04):
 * installed, enabled (not in `disabledIds`), and not platform chrome. Admin-only
 * plugins are included only for `platform:admin` — non-admins never receive
 * them. Each result carries `adminOnly` so the Launcher can render the admin
 * tiles in their own section.
 */
export function selectLauncherPlugins(
  plugins: readonly LauncherPluginInput[],
  disabledIds: ReadonlySet<string>,
  role: string,
): LauncherPlugin[] {
  const isAdmin = role === 'platform:admin';
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
      ...(p.icon ? { iconUrl: `/plugin-icons/${p.id}.svg` } : {}),
    }));
}
