/**
 * Focused native app route lock (RFC 0082 §3). Pure decision logic, kept
 * free of Next.js imports so it's unit-testable — mirrors `route-guard.ts`'s
 * shape and reuses its `underPrefix()`.
 *
 * **Hard rule — restated from `docs/architecture-rules.md`:** the focus
 * signal this decides against comes from a client-controlled User-Agent and
 * is trivially spoofable. This redirect is a product-scoping and UX
 * mechanism, never a security boundary. A user who forges
 * `x-sovereign-focus-plugin` (or edits their User-Agent) reaches exactly the
 * routes their session, capability, and plugin-permission gates already
 * allow — those gates run entirely independently of this decision, before
 * and after it, and are the only real boundaries.
 */

import { underPrefix } from './route-guard';

export type FocusRouteDecision = { kind: 'allow' } | { kind: 'redirect'; routePrefix: string };

/**
 * Paths reachable from *any* focused app regardless of which plugin is
 * focused, beyond the focused plugin's own `routePrefix`. Each entry per
 * RFC 0082 §3's table — the entries handled by `middleware.ts`'s matcher
 * exclusion instead (`/login`, `/register`, `/forgot-password`,
 * `/reset-password`, `/offline`, PWA/static assets) are not listed here,
 * since this function never runs on them: middleware itself never executes
 * on a matcher-excluded path.
 */
const FOCUS_ALLOWLIST_PREFIXES = [
  // Password change, session revocation, and — critically — `data:provide`
  // consent (Account → Data), which a focused app with cross-plugin data
  // contracts (e.g. Tally) needs reachable even though Account is a
  // different plugin entirely.
  '/account',
  // middleware already redirects a paywalled plugin's routes here; a
  // focused app for a monetized plugin must be able to follow that redirect.
  '/paywall',
  // Route handlers, sync endpoints, and the auth proxy — shared
  // infrastructure a focused plugin's own pages call into, not just its own
  // plugin-specific routes.
  '/api',
] as const;

/** The subset of a plugin manifest the route-lock decision needs. */
export interface FocusPluginInfo {
  id: string;
  routePrefix: string;
}

/**
 * Decides whether `pathname` is reachable from a focused app, or should
 * redirect to the focused plugin's root instead. Redirects, never 404s —
 * the content exists and the user is entitled to it, it simply isn't part
 * of *this* app (RFC 0082 §3).
 *
 * Fails open (`'allow'`) when there is no focus signal, or when the focused
 * plugin ID doesn't match any installed plugin (a misconfigured or
 * uninstalled-since focus target) — there is no safe redirect target in
 * that case, so routing falls back to normal, unlocked behavior rather than
 * redirecting to a guess.
 */
export function decideFocusRoute(
  pathname: string,
  focusPluginId: string | null,
  installedPlugins: readonly FocusPluginInfo[],
): FocusRouteDecision {
  if (!focusPluginId) return { kind: 'allow' };
  const focusedPlugin = installedPlugins.find((plugin) => plugin.id === focusPluginId);
  if (!focusedPlugin) return { kind: 'allow' };
  if (underPrefix(pathname, focusedPlugin.routePrefix)) return { kind: 'allow' };
  if (FOCUS_ALLOWLIST_PREFIXES.some((prefix) => underPrefix(pathname, prefix))) {
    return { kind: 'allow' };
  }
  return { kind: 'redirect', routePrefix: focusedPlugin.routePrefix };
}
