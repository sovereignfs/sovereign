/**
 * Per-plugin installable PWA manifest (RFC 0081). Pure decision/builder
 * logic, kept free of Next.js and database imports so it's unit-testable —
 * mirrors `manifest-icons.ts`'s shape; `runtime/app/api/manifest/[pluginId]/route.ts`
 * stays a thin wrapper (DB lookup, response headers) with no dedicated test,
 * consistent with `route-guard.ts`/`route-lock.ts`/`api-namespace.ts`.
 */

import { DEFAULT_MANIFEST_ICONS } from './manifest-icons';

/** The subset of a plugin manifest the per-plugin manifest route needs. */
export interface InstallablePluginInfo {
  id: string;
  name: string;
  description?: string;
  routePrefix: string;
  icon?: string;
  installable?: boolean;
  /** Author-supplied raster icon set (RFC 0081) — see `packages/manifest/src/schema.ts`'s `icons` field doc comment. */
  icons?: {
    png192?: string;
    png512?: string;
    maskable512?: string;
  };
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
 * The plugin's own generated/author-supplied raster icon set (RFC 0081 §3),
 * or the platform default set when the plugin declares neither `icon` nor
 * `icons` — an installable plugin should still install with a *working*
 * icon rather than a broken manifest (in practice unreachable for
 * `installable: true`, since schema validation already requires one; kept
 * as a safe fallback for `installable` left `false`/absent, where no icon
 * requirement applies).
 *
 * References `runtime/public/plugin-icons/<id>-{192,512,maskable-512}.png` —
 * `scripts/generate-registry.ts`'s `copyPluginIcons()` is the single source
 * of truth for what actually exists on disk at each of those three paths,
 * so this function's existence check must mirror its fallback logic
 * exactly: a variant exists if the plugin declares `icon` (generation
 * fallback covers every variant) **or** that specific `icons.*` path
 * (an author-supplied override for just that one variant, mixable with
 * generated ones). Omitting a variant this function isn't sure exists,
 * rather than guessing, is deliberate — a manifest `icons` entry pointing
 * at a 404 is worse than a shorter icons array.
 */
export function buildPluginManifestIcons(
  plugin: InstallablePluginInfo,
): Array<Record<string, string>> {
  if (!plugin.icon && !plugin.icons) return DEFAULT_MANIFEST_ICONS;
  const hasFallback = Boolean(plugin.icon);
  const entries: Array<Record<string, string>> = [];
  if (hasFallback || plugin.icons?.png192) {
    entries.push({
      src: `/plugin-icons/${plugin.id}-192.png`,
      sizes: '192x192',
      type: 'image/png',
      purpose: 'any',
    });
  }
  if (hasFallback || plugin.icons?.png512) {
    entries.push({
      src: `/plugin-icons/${plugin.id}-512.png`,
      sizes: '512x512',
      type: 'image/png',
      purpose: 'any',
    });
  }
  if (hasFallback || plugin.icons?.maskable512) {
    entries.push({
      src: `/plugin-icons/${plugin.id}-maskable-512.png`,
      sizes: '512x512',
      type: 'image/png',
      purpose: 'maskable',
    });
  }
  return entries.length > 0 ? entries : DEFAULT_MANIFEST_ICONS;
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
