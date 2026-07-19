/**
 * Pure route-protection decisions for the middleware. Kept free of Next.js
 * and database imports so the logic is unit-testable; the middleware supplies
 * the disabled-plugin set (fetched from the Node-runtime status route) and
 * the verified user's role.
 */

import { hasCapability } from './capabilities';

/** The subset of a plugin manifest the route decision needs. */
export interface PluginRouteInfo {
  id: string;
  routePrefix: string;
  adminOnly?: boolean;
  shell?: string;
  publicRoutes?: readonly { prefix: string }[];
}

export type RouteDecision = 'ok' | 'not-found' | 'forbidden' | 'paywall';

/** Whether a request path falls under a plugin's routePrefix. */
export function underPrefix(pathname: string, routePrefix: string): boolean {
  return pathname === routePrefix || pathname.startsWith(`${routePrefix}/`);
}

/**
 * Decide how a request path is handled relative to installed plugins:
 * - under a disabled plugin's prefix → 'not-found' (404, SRS CON-07/PLT-04)
 * - under a plugin whose access policy (RFC 0065) denies the current user →
 *   'not-found' (404 — denial must not disclose the plugin's existence to a
 *   user who isn't allowed to open it, so this is deliberately not 'forbidden')
 * - under an adminOnly plugin's prefix without console:access → 'forbidden'
 *   (403, SRS §3.4/PLT-03; RFC 0021 capability gate — a static manifest flag,
 *   independent of the operator-set access policy above)
 * - under a paid plugin's prefix with no active entitlement → 'paywall'
 *   (redirect to /paywall/<pluginId>, RFC 0003)
 * - otherwise → 'ok'
 * Disabled and access-policy denial both win over adminOnly, which wins over paywall.
 */
export function decidePluginRoute(
  pathname: string,
  plugins: readonly PluginRouteInfo[],
  disabledIds: ReadonlySet<string>,
  userRole: string,
  paywallIds?: ReadonlySet<string>,
  restrictedIds?: ReadonlySet<string>,
): RouteDecision {
  const matched = plugins.find((plugin) => underPrefix(pathname, plugin.routePrefix));
  if (!matched) return 'ok';
  if (disabledIds.has(matched.id)) return 'not-found';
  if (restrictedIds?.has(matched.id)) return 'not-found';
  if (matched.adminOnly && !hasCapability(userRole, 'console:access')) return 'forbidden';
  if (paywallIds?.has(matched.id)) return 'paywall';
  return 'ok';
}

/** Returns the plugin ID matched by the pathname, or null if none matched. */
export function matchedPluginId(
  pathname: string,
  plugins: readonly PluginRouteInfo[],
): string | null {
  return plugins.find((plugin) => underPrefix(pathname, plugin.routePrefix))?.id ?? null;
}

/**
 * Returns the ID of the plugin whose manifest-declared public route (RFC 0042)
 * covers this path, or null if the path isn't under any declared public route.
 * A `publicRoutes[].prefix` is relative to the plugin's own `routePrefix` — the
 * exempt path is always `<routePrefix><prefix>`, so it can never escape the
 * plugin's own namespace.
 */
export function matchedPublicPluginRouteId(
  pathname: string,
  plugins: readonly PluginRouteInfo[],
): string | null {
  for (const plugin of plugins) {
    for (const route of plugin.publicRoutes ?? []) {
      if (underPrefix(pathname, `${plugin.routePrefix}${route.prefix}`)) return plugin.id;
    }
  }
  return null;
}
