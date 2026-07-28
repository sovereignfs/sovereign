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
    '@sovereignfs/ui',
    '@sovereignfs/db',
    '@sovereignfs/manifest',
    '@sovereignfs/mailer',
  ],
  // better-sqlite3-multiple-ciphers (RFC 0071) uses native bindings — Webpack cannot bundle it.
  serverExternalPackages: ['better-sqlite3-multiple-ciphers'],
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

// Manifest-declared offline-capable route prefixes (RFC 0072), e.g.
// "/wallet/cards". A plugin route under one of these renders a user-neutral
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
function underOfflineRoutePrefix(pathname: string): boolean {
  return offlineRoutePrefixes.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
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
  // network. See docs/adhoc/ios-pwa-inspection-findings.md #5.
  extendDefaultRuntimeCaching: true,
  workboxOptions: {
    runtimeCaching: [
      // Offline-capable routes (RFC 0072) — must be listed before the
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
        },
      },
    ],
  },
});

export default withPWA(nextConfig);
