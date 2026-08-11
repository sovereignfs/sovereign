/**
 * Per-plugin installable PWA manifest (RFC 0081). Pure decision/builder
 * logic, kept free of Next.js and database imports so it's unit-testable —
 * mirrors `manifest-icons.ts`'s shape; `runtime/app/api/manifest/[pluginId]/route.ts`
 * stays a thin wrapper (DB lookup, response headers) with no dedicated test,
 * consistent with `route-guard.ts`/`route-lock.ts`/`api-namespace.ts`.
 */

import { DEFAULT_MANIFEST_ICONS, guessMimeType } from './manifest-icons';

/** The subset of a plugin manifest the per-plugin manifest route needs. */
export interface InstallablePluginInfo {
  id: string;
  name: string;
  description?: string;
  routePrefix: string;
  icon?: string;
  installable?: boolean;
}

/**
 * Finds the plugin this manifest request is for, or `null` when the id is
 * unknown, the plugin is disabled, or it doesn't declare `installable: true`
 * — all three collapse to the same 404 (RFC 0081 §2): a manifest for a
 * plugin the user cannot use, or was never opted into an installable
 * identity, would offer an install that leads nowhere or was never intended.
 */
export function findInstallablePlugin(
  pluginId: string,
  plugins: readonly InstallablePluginInfo[],
  disabledIds: ReadonlySet<string>,
): InstallablePluginInfo | null {
  const plugin = plugins.find((p) => p.id === pluginId);
  if (!plugin) return null;
  if (disabledIds.has(plugin.id)) return null;
  if (!plugin.installable) return null;
  return plugin;
}

/**
 * A plugin's own icon as a manifest icon entry, or the platform default set
 * when the plugin declares none — an installable plugin should still
 * install with a *working* icon rather than a broken manifest, even before
 * task 2.26 lands real per-plugin raster generation. `sizes: 'any'` since
 * the plugin's `icon` is an author-supplied SVG of unknown/arbitrary
 * dimensions, the same reasoning `buildManifestIcons` already applies to an
 * operator's uploaded instance logo.
 */
export function buildPluginManifestIcons(
  plugin: InstallablePluginInfo,
): Array<Record<string, string>> {
  if (!plugin.icon) return DEFAULT_MANIFEST_ICONS;
  const src = `/plugin-icons/${plugin.id}.svg`;
  return [{ src, sizes: 'any', type: guessMimeType(src) }];
}

/**
 * Builds the plugin's own web app manifest object (RFC 0081 §2). `name`/
 * `description` are the plugin's own, verbatim — the instance name is
 * deliberately never prepended, since the user is installing *this plugin*,
 * not "<Instance> <Plugin>". `start_url`, `scope`, and `id` are all the
 * plugin's bare `routePrefix`; an explicit `id` keeps the installed
 * identity stable if `start_url` ever gains a query parameter.
 * `theme_color`/`background_color` inherit the instance's own values (same
 * source the instance-level manifest route uses) so a white-labeled
 * instance's per-plugin apps match it.
 */
export function buildPluginManifest(
  plugin: InstallablePluginInfo,
  themeColor: string,
  backgroundColor: string,
): Record<string, unknown> {
  return {
    name: plugin.name,
    short_name: plugin.name,
    description: plugin.description ?? '',
    start_url: plugin.routePrefix,
    scope: plugin.routePrefix,
    id: plugin.routePrefix,
    display: 'standalone',
    display_override: ['standalone', 'minimal-ui'],
    background_color: backgroundColor,
    theme_color: themeColor,
    orientation: 'any',
    categories: ['productivity'],
    icons: buildPluginManifestIcons(plugin),
  };
}
