import type { PluginRouteInfo } from './route-guard';

export type RootPluginValidation =
  | { ok: true }
  | { ok: false; reason: 'not-installed' | 'disabled' | 'admin-only' | 'overlay' };

/**
 * Whether a plugin may be configured as the root plugin (SRS CON-11): it must
 * be installed, enabled, not adminOnly (every signed-in user lands on `/`, so an
 * admin-gated root would 403 regular users), and not an `overlay` plugin (the
 * root serves `/` as a full page, which overlay plugins cannot — RFC 0001).
 */
export function validateRootPlugin(
  pluginId: string,
  plugins: readonly PluginRouteInfo[],
  disabledIds: ReadonlySet<string>,
): RootPluginValidation {
  const plugin = plugins.find((p) => p.id === pluginId);
  if (!plugin) return { ok: false, reason: 'not-installed' };
  if (disabledIds.has(pluginId)) return { ok: false, reason: 'disabled' };
  if (plugin.adminOnly) return { ok: false, reason: 'admin-only' };
  if (plugin.shell === 'overlay') return { ok: false, reason: 'overlay' };
  return { ok: true };
}

/**
 * The `routePrefix` the platform root `/` should serve in place (SRS PLT-14):
 * the configured root plugin's prefix when it is a valid root, else null (the
 * caller falls back to the placeholder home page). Resolved at request time so
 * an admin's CON-11 change takes effect without a rebuild.
 */
export function resolveRootRoutePrefix(
  rootPluginId: string,
  plugins: readonly PluginRouteInfo[],
  disabledIds: ReadonlySet<string>,
): string | null {
  if (!validateRootPlugin(rootPluginId, plugins, disabledIds).ok) return null;
  return plugins.find((p) => p.id === rootPluginId)?.routePrefix ?? null;
}
