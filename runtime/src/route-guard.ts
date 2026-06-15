/**
 * Pure route-protection decisions for the middleware. Kept free of Next.js
 * and database imports so the logic is unit-testable; the middleware supplies
 * the disabled-plugin set (fetched from the Node-runtime status route) and
 * the verified user's role.
 */

/** The subset of a plugin manifest the route decision needs. */
export interface PluginRouteInfo {
  id: string;
  routePrefix: string;
  adminOnly?: boolean;
  shell?: string;
}

export type RouteDecision = 'ok' | 'not-found' | 'forbidden';

/** Whether a request path falls under a plugin's routePrefix. */
export function underPrefix(pathname: string, routePrefix: string): boolean {
  return pathname === routePrefix || pathname.startsWith(`${routePrefix}/`);
}

/**
 * Decide how a request path is handled relative to installed plugins:
 * - under a disabled plugin's prefix → 'not-found' (404, SRS CON-07/PLT-04)
 * - under an adminOnly plugin's prefix without platform:admin → 'forbidden'
 *   (403, SRS §3.4/PLT-03)
 * - otherwise → 'ok'
 * Disabled wins over adminOnly: a disabled plugin 404s for everyone.
 */
export function decidePluginRoute(
  pathname: string,
  plugins: readonly PluginRouteInfo[],
  disabledIds: ReadonlySet<string>,
  userRole: string,
): RouteDecision {
  const matched = plugins.find((plugin) => underPrefix(pathname, plugin.routePrefix));
  if (!matched) return 'ok';
  if (disabledIds.has(matched.id)) return 'not-found';
  if (matched.adminOnly && userRole !== 'platform:admin') return 'forbidden';
  return 'ok';
}
