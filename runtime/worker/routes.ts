/// <reference lib="webworker" />
/**
 * Service-worker route table (PLT-09, SRS §3.11; research 0012; RFC 0078).
 *
 * Runs inside the real, bundled worker (`./index.ts`, built by
 * `runtime/scripts/build-sw.ts`), so every matcher below is ordinary code
 * that can import whatever it needs — there is no serialization step in
 * between any more. (Under `@ducanh2912/next-pwa`, these lived in
 * `next.config.ts` and were `Function.prototype.toString()`-copied into the
 * generated `sw.js`, which silently dropped every closure and every `async`
 * helper — two shipped production bugs. See `docs/architecture-rules.md`.)
 *
 * The guarantee this table upholds — **a cached authenticated document is
 * never served to a different user** — is met by never caching one at all:
 * see `isGatedPageNavigation` and the `NetworkOnly` handler it feeds.
 */

import {
  CacheFirst,
  ExpirationPlugin,
  NetworkOnly,
  StaleWhileRevalidate,
  type RuntimeCaching,
} from 'serwist';
import { getOfflineRoutePrefixes } from '../src/registry';

/** The subset of Serwist's route-match options the matchers below read. */
export interface RouteMatch {
  url: URL;
  request: Request;
  sameOrigin: boolean;
}

/**
 * How long a gated page navigation may wait on the network before the
 * `/offline` fallback is served instead. Bounds the worst case for a stalled
 * request (there is no cached document to fall back on — by design).
 */
export const PAGE_NETWORK_TIMEOUT_SECONDS = 4;

const THIRTY_DAYS_SECONDS = 30 * 86_400;

/** A navigation or document fetch — what the `/offline` fallback stands in for. */
export function isDocumentRequest({ request }: Pick<RouteMatch, 'request'>): boolean {
  return request.destination === 'document';
}

/**
 * Manifest-declared offline-capable shells (`offline: 'offline-first' |
 * 'device-only'`): the exact paths `getOfflineRoutePrefixes()` returns, e.g.
 * `/shopper`, plus `/` whenever Launcher (the default root) is itself
 * offline-first. Every one of these documents is required to be a
 * user-neutral shell (`runtime/src/__tests__/offline-route-neutrality.test.ts`),
 * which is the only reason it is safe to cache them.
 */
export function isOfflineShellRequest(
  { url, sameOrigin }: Pick<RouteMatch, 'url' | 'sameOrigin'>,
  offlineRoutes: readonly string[],
): boolean {
  return sameOrigin && offlineRoutes.includes(url.pathname);
}

/** Next's content-hashed build output; also precached, this is the on-demand backstop. */
export function isNextStaticAsset({
  url,
  sameOrigin,
}: Pick<RouteMatch, 'url' | 'sameOrigin'>): boolean {
  return sameOrigin && url.pathname.startsWith('/_next/static/');
}

/**
 * Everything else same-origin a user navigates to: real per-user SSR
 * (Console, Account, any plugin without an `offline` tier). There is no safe
 * cache key for these — the document is personalized, and nothing on the
 * device can prove "still the same, still-signed-in user" without a live
 * round trip — so the handler for this route never stores anything.
 *
 * Only navigations are claimed. Same-origin subresource and RSC fetches fall
 * through to the browser untouched, which is equally uncached and avoids
 * imposing the navigation timeout on them.
 */
export function isGatedPageNavigation(
  { url, request, sameOrigin }: RouteMatch,
  offlineRoutes: readonly string[],
): boolean {
  return (
    sameOrigin &&
    request.mode === 'navigate' &&
    !url.pathname.startsWith('/api/') &&
    !offlineRoutes.includes(url.pathname)
  );
}

export function createRuntimeCaching(offlineRoutes: readonly string[]): RuntimeCaching[] {
  return [
    // Listed first so it wins over the gated-page route for these exact paths.
    // StaleWhileRevalidate: the cached shell serves instantly (works with no
    // network) while a background fetch refreshes it for next time, so a
    // deployed change — including a re-hashed JS chunk the stale HTML still
    // references — reaches a returning online user on their next visit
    // rather than after `maxAgeSeconds` (which is what CacheFirst did).
    {
      matcher: (options) => isOfflineShellRequest(options, offlineRoutes),
      handler: new StaleWhileRevalidate({
        cacheName: 'offline-shells',
        plugins: [new ExpirationPlugin({ maxEntries: 64, maxAgeSeconds: THIRTY_DAYS_SECONDS })],
      }),
    },
    {
      matcher: isNextStaticAsset,
      handler: new CacheFirst({
        cacheName: 'next-static',
        plugins: [new ExpirationPlugin({ maxEntries: 256, maxAgeSeconds: THIRTY_DAYS_SECONDS })],
      }),
    },
    // NetworkOnly has no cache to write to or read from — the "never stores a
    // per-user page" guarantee is structural, not a plugin that refuses
    // writes. On any failure (offline, or the timeout) the fallback plugin
    // Serwist attaches for `fallbacks.entries` serves the precached `/offline`.
    {
      matcher: (options) => isGatedPageNavigation(options, offlineRoutes),
      handler: new NetworkOnly({ networkTimeoutSeconds: PAGE_NETWORK_TIMEOUT_SECONDS }),
    },
  ];
}

/** The route table the worker installs, resolved from the generated registry. */
export const runtimeCaching: RuntimeCaching[] = createRuntimeCaching(getOfflineRoutePrefixes());
