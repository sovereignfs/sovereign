import { resolve } from 'node:path';
import withPWAInit from '@ducanh2912/next-pwa';
import { loadEnvConfig } from '@next/env';
import type { NextConfig } from 'next';
import { getOfflineRoutePrefixes } from './src/registry';

// Load the single monorepo-root .env (mirrors apps/auth). No per-app .env files.
loadEnvConfig(resolve(process.cwd(), '..'), process.env.NODE_ENV !== 'production');

// Static security response headers (RFC 0008 Tier 0). The Content-Security-Policy
// is set per-request in middleware.ts (it needs a fresh nonce), so it is not
// here. HSTS is production-only — it must never be sent over plain-http dev.
const isProd = process.env.NODE_ENV === 'production';
const securityHeaders = [
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-DNS-Prefetch-Control', value: 'off' },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), browsing-topics=()',
  },
  ...(isProd
    ? [{ key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' }]
    : []),
];

const nextConfig: NextConfig = {
  // Self-contained production server (`.next/standalone`) for the Docker image.
  // In a pnpm monorepo, file tracing must be rooted at the repo root or the
  // traced output misses workspace package files.
  output: 'standalone',
  outputFileTracingRoot: resolve(process.cwd(), '..'),
  // Next's own dev-mode indicator badge overlaps the shell sidebar's brand
  // logo/link in the same corner, silently swallowing clicks meant for it
  // (reproduced manually and in __tests__/e2e/navigation.spec.ts's "brand
  // link returns to /" test). Dev-only chrome has no business intercepting
  // the app's own UI, so it's off rather than repositioned.
  devIndicators: false,
  // Compile all workspace packages from source — package edits trigger HMR.
  transpilePackages: [
    '@sovereignfs/sdk',
    '@sovereignfs/bridge',
    '@sovereignfs/ui',
    '@sovereignfs/db',
    '@sovereignfs/manifest',
    '@sovereignfs/mailer',
  ],
  // better-sqlite3-multiple-ciphers (RFC 0071) uses native bindings — Webpack cannot bundle it.
  serverExternalPackages: ['better-sqlite3-multiple-ciphers'],
  webpack: (config) => {
    // Drop plain `better-sqlite3` from the server graph. `drizzle-orm/better-sqlite3`
    // statically imports it at the top of its driver, but only ever constructs it in
    // the connection-string overloads (`drizzle(':memory:')`, `drizzle({ connection })`).
    // We never take those paths: every SQLite open goes through `openKeyedSqlite` for
    // RFC 0071 keying + marker checks, and both call sites hand Drizzle an already-open
    // handle from the multiple-ciphers fork (packages/db's client.ts, plugin-client.ts).
    //
    // Without this alias the module is bundled rather than externalized, and Webpack
    // then parses its `require(path.resolve(nativeBinding) + '.node')` addon loader and
    // warns "Critical dependency: require function is used in a way in which
    // dependencies cannot be statically extracted" on every route that touches the DB.
    // `serverExternalPackages` cannot fix that: Next already lists better-sqlite3 in its
    // own defaults, but it refuses to externalize a package that does not resolve
    // identically from the project root (handle-externals.ts's base-resolve check —
    // bundled server code is relocated without its node_modules tree). Under pnpm's
    // strict layout better-sqlite3 is only reachable from inside drizzle-orm's own
    // .pnpm directory — it is an auto-installed optional peer that nothing here
    // declares — so the check fails and Next bundles it. Declaring it instead would
    // mean shipping a native package we deliberately never build (see
    // pnpm-workspace.yaml's `allowBuilds: better-sqlite3: false`).
    //
    // NOTE: this applies to Webpack only. Moving the runtime to Turbopack silently
    // drops it — port it to `turbopack.resolveAlias` at the same time.
    config.resolve.alias = { ...config.resolve.alias, 'better-sqlite3': false };
    return config;
  },
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

// Manifest-declared offline-capable route prefixes (RFC 0078), e.g.
// "/shopper" — a plugin's bare routePrefix. That route renders a user-neutral
// shell and hydrates its data client-side via sdk.offline (see
// docs/plugin-development.md's "offline" section) — that's what makes it
// safe to cache-first, unlike the per-user SSR "pages" entry below.
const offlineRoutePrefixes = getOfflineRoutePrefixes();

// Bare `/` deliberately has no entry here — `@ducanh2912/next-pwa`'s
// `dynamicStartUrl`/`cacheStartUrl` options (both default `true`) already
// `unshift` an automatic `NetworkFirst` route for `/` ("start-url" cache)
// ahead of this file's entire `runtimeCaching` array, so a custom match for
// `/` here would never actually be reached by Workbox regardless of array
// order. That built-in route already does what's needed — serve the network
// response, fall back to the cached one when offline — so `/` gets working
// offline access "for free", on the same terms as the "pages" entry below:
// `middleware.ts` deliberately does *not* flag `/` as an offline route, so
// it renders the normal per-user SSR shell (avatar, name, sidebar order) on
// every live request, exactly like any other authenticated page. The
// tradeoff is identical to the one already accepted for "pages": a device
// used genuinely offline can replay whichever user's shell was cached from
// their last online visit, until the next successful online request
// refreshes it.
// Exact match only, not "this path or anything under it" — RFC 0078's
// single-entry-point model guarantees a user-neutral shell (and CI-scans)
// only for a plugin's bare routePrefix page itself. A nested route is an
// ordinary per-user SSR page; matching it here would let the service worker
// precache-and-replay it as if it were safe to share across users.
function underOfflineRoutePrefix(pathname: string): boolean {
  return offlineRoutePrefixes.includes(pathname);
}

// Installable PWA (SRS §3.11, PLT-09). The service worker is generated into
// `public/` at build time and is disabled in development so it never
// interferes with HMR. A failed navigation falls back to the cached `/offline`
// shell instead of a blank page.
const withPWA = withPWAInit({
  dest: 'public',
  disable: process.env.NODE_ENV === 'development',
  register: true,
  reloadOnOnline: true,
  fallbacks: { document: '/offline' },
  // Bound the "pages" document cache entry with a network timeout, falling
  // back to the cached `/offline` shell instead of hanging on a stalled
  // request. Sovereign's pages are per-user SSR (nav, plugin list, etc.), so
  // this intentionally stays NetworkFirst rather than switching to a
  // stale-while-revalidate document cache — caching and replaying a
  // rendered authenticated shell risks showing a stale/different user's
  // content after logout/login on a shared device. This only bounds the
  // worst case (a stalled request now falls back after 4s instead of
  // hanging blank); it does not change typical-case latency on a fast
  // network. See docs/research/0011-ios-pwa-inspection-findings.md #5.
  extendDefaultRuntimeCaching: true,
  workboxOptions: {
    runtimeCaching: [
      // Offline-capable routes (RFC 0078) — must be listed before the
      // general "pages" matcher below so it wins for these specific paths.
      // StaleWhileRevalidate is safe here (and only here) because these
      // documents are declared user-neutral shells, not per-user SSR: the
      // cached response serves instantly (works with no network) while a
      // background fetch refreshes the cache for next time. This matters
      // for staying current, not just for offline: CacheFirst (the original
      // choice) never revalidates against network while an entry is still
      // within maxAgeSeconds, so a deployed change to an offline route's
      // shell — including a content-hashed JS chunk the stale HTML still
      // references, no longer served after the deploy — would stay
      // invisible to a returning user for up to 30 days even though they're
      // fully online. SWR still serves the fast cached response immediately,
      // but the background revalidation means the *next* visit already has
      // the update, deploy or not.
      {
        urlPattern: ({ url, sameOrigin }: { url: URL; sameOrigin: boolean }) =>
          sameOrigin && underOfflineRoutePrefix(url.pathname),
        handler: 'StaleWhileRevalidate',
        options: {
          cacheName: 'offline-shells',
          expiration: { maxEntries: 64, maxAgeSeconds: 30 * 86400 },
        },
      },
      {
        // Same matcher as the library's default "pages" entry (same-origin,
        // non-API GET) — this only adds networkTimeoutSeconds to it.
        urlPattern: ({ url, sameOrigin }: { url: URL; sameOrigin: boolean }) =>
          sameOrigin && !url.pathname.startsWith('/api/') && !underOfflineRoutePrefix(url.pathname),
        handler: 'NetworkFirst',
        options: {
          cacheName: 'pages',
          expiration: { maxEntries: 32, maxAgeSeconds: 86400 },
          networkTimeoutSeconds: 4,
          plugins: [
            {
              // Per-user cache partitioning (research 0012, epic task 2.31).
              // Documents cached here are per-user SSR, so a cached entry must
              // never be replayed for a different user on a shared device.
              // Keying each entry by the *signature-verified* user id from the
              // offline session assertion makes that structurally impossible
              // rather than merely unlikely.
              //
              // This function is stringified into the generated sw.js by
              // workbox-build, so it cannot import anything — it delegates to
              // a global installed by runtime/worker/offline-session.ts, which
              // IS properly bundled and is importScripts-ed ahead of any fetch
              // event. If that global is somehow absent the request falls back
              // to an explicitly anonymous key, never the bare URL: an
              // unidentified request then gets a cache miss and goes to
              // network, which cannot leak across users.
              cacheKeyWillBeUsed: async ({ request }: { request: Request }) => {
                const partition = (
                  self as unknown as { __sovereignCacheKey?: (url: string) => Promise<string> }
                ).__sovereignCacheKey;
                if (!partition) {
                  const separator = request.url.includes('?') ? '&' : '?';
                  return `${request.url}${separator}__sv_u=anon`;
                }
                return partition(request.url);
              },
              // Cold-start offline routing (research 0012, epic task 2.32).
              // Reached only after BOTH the network fetch and the cache
              // lookup under the key above have already failed — so there is
              // definitely nothing to serve for this request under this
              // partition, and the only question left is which offline
              // fallback document explains that.
              //
              // Adding a `handlerDidError` here means next-pwa will NOT also
              // inject its own default one for this cache entry (it only does
              // so when an entry's plugins have none — see
              // @ducanh2912/next-pwa's dist/index.js), so this must reproduce
              // that default itself for the "valid session, nothing cached
              // yet" branch by delegating to the same `self.fallback` global
              // next-pwa's own handler would have called.
              handlerDidError: async ({ request }: { request: Request }) => {
                const hasSession = (
                  self as unknown as { __sovereignHasOfflineSession?: () => Promise<boolean> }
                ).__sovereignHasOfflineSession;
                // No valid offline session → the device cannot prove who it
                // is, so there is nothing safe to show but the sign-in
                // prompt, regardless of what might otherwise be cached.
                if (!hasSession || !(await hasSession())) {
                  return caches.match('/offline/session-required', { ignoreSearch: true });
                }
                // A verified user, just nothing cached at this URL yet (e.g.
                // the very first offline launch before any page was visited
                // online). Same generic fallback as every other cache group.
                const fallback = (
                  self as unknown as { fallback?: (req: Request) => Promise<Response> }
                ).fallback;
                return fallback ? fallback(request) : Response.error();
              },
            },
          ],
        },
      },
    ],
    // /offline/session-required is never linked to or navigated in the
    // ordinary course of using the app (see the route's own doc comment), so
    // unlike an actually-visited page it would never end up in the "pages"
    // cache on its own — it has to be precached explicitly, the same way
    // next-pwa precaches /offline itself via the `fallbacks` option above.
    // Manually maintained revision (Workbox's own documented convention for
    // hand-added entries not produced by a build-time content hash): bump it
    // whenever this page's content changes so installed clients refetch it.
    additionalManifestEntries: [{ url: '/offline/session-required', revision: '2026-08-08' }],
  },
});

export default withPWA(nextConfig);
