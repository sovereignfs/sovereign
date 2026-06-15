/**
 * Pure logic for the public `/api/*` namespace delegation (PLT-16). Kept free of
 * Next.js and database imports so it is unit-testable; the middleware supplies
 * the installed plugins and the disabled-plugin set and acts on the decision.
 *
 * The runtime owns part of `/api/*` for its own routes, so the namespace is
 * split: requests to a reserved segment keep their normal (session-gated)
 * handling, while `/api/<slug>/*` for any other slug is the public namespace —
 * exempt from the session gate and delegated to the single registered provider
 * plugin (or 404 when there is none).
 */
import { findApiProvider, type SovereignManifest } from '@sovereignfs/manifest';

/**
 * First-level `/api/*` segments the runtime serves itself. Keep in sync with the
 * top-level directories under `runtime/app/api/` — a parity test enforces this so
 * a new runtime API route can never silently become delegatable. Reserved
 * segments are NOT part of the public namespace; the provider plugin is
 * responsible for rejecting them as slugs.
 */
export const RESERVED_API_SEGMENTS: ReadonlySet<string> = new Set([
  'account',
  'admin',
  'health',
  'plugins',
]);

/** The first path segment after `/api/`, or '' when there is none. */
function apiSlug(pathname: string): string {
  if (pathname === '/api' || pathname === '/api/') return '';
  if (!pathname.startsWith('/api/')) return '';
  return pathname.slice('/api/'.length).split('/')[0] ?? '';
}

/**
 * Whether a path is in the *public* `/api/*` namespace — under `/api/` with a
 * non-empty, non-reserved first segment. Reserved segments and non-`/api` paths
 * return false (they keep their normal middleware handling).
 */
export function isPublicApiPath(pathname: string): boolean {
  const slug = apiSlug(pathname);
  return slug !== '' && !RESERVED_API_SEGMENTS.has(slug);
}

export type ApiNamespaceDecision =
  | { kind: 'pass' }
  | { kind: 'not-found' }
  | { kind: 'rewrite'; target: string };

/**
 * Decide how a public `/api/*` request is delegated:
 * - not a public api path → 'pass' (caller continues normal handling)
 * - no installed provider, provider disabled, or no slug → 'not-found' (404)
 * - otherwise → 'rewrite' to `<provider.routePrefix>/serve/<slug>/<rest>`
 *
 * The target preserves the slug and the remaining path so the provider's
 * `serve/[slug]/[...path]` route receives them intact. Query strings are the
 * caller's concern (carried on the request URL).
 */
export function decideApiNamespace(
  pathname: string,
  plugins: readonly SovereignManifest[],
  disabledIds: ReadonlySet<string>,
): ApiNamespaceDecision {
  if (!isPublicApiPath(pathname)) return { kind: 'pass' };

  const { provider } = findApiProvider(plugins);
  if (!provider || disabledIds.has(provider.id)) return { kind: 'not-found' };

  const rest = pathname.slice('/api/'.length); // "<slug>" or "<slug>/<path…>"
  const prefix = provider.routePrefix.replace(/\/+$/, '');
  return { kind: 'rewrite', target: `${prefix}/serve/${rest}` };
}
