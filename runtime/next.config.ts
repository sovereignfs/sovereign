import { resolve } from 'node:path';
import withPWAInit from '@ducanh2912/next-pwa';
import { loadEnvConfig } from '@next/env';
import type { NextConfig } from 'next';

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
    //
    // Same treatment for `libsql` (RFC 0091's sqld driver): `@libsql/client`'s
    // `sqlite3.js` statically imports the native `libsql` package (platform
    // binary addon), but only ever constructs it when a database URL uses the
    // `file:` scheme — `_createClient` throws for anything else. This codebase
    // only ever passes `http(s):` URLs to `@libsql/client` (sqld, RFC 0091); the
    // local/embedded `file:` path is never taken. Without this alias Webpack
    // bundles the native import chain (`libsql` → `@neon-rs/load` → the
    // platform-specific `@libsql/<target>` binary + its README) and fails to
    // parse the non-JS files it pulls in.
    config.resolve.alias = { ...config.resolve.alias, 'better-sqlite3': false, libsql: false };
    return config;
  },
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

// `dynamicStartUrl`/`cacheStartUrl` (`@ducanh2912/next-pwa`, both default
// `true`) are explicitly disabled below. Left at their defaults, next-pwa
// `unshift`s its own `NetworkFirst` route for bare `/` ("start-url" cache)
// ahead of this file's entire `runtimeCaching` array — a route with no
// per-user cache key and no session check of any kind, replaying whatever
// was last fetched for `/` to anyone who asks, forever, regardless of
// whether that session has since expired or signed out. That is a real
// authentication bypass, not a hardening gap: found via live testing (sign
// out, take the device offline, reload `/` — the previous user's cached,
// fully personalized shell renders anyway). `/` now instead flows into the
// `offline-shells` matcher below like any other offline-capable route — see
// `runtime/src/registry.ts`'s `getOfflineRoutePrefixes()` for how it earns a
// place there (it renders the same neutral Launcher shell already verified
// safe at `/launcher`, since `middleware.ts` rewrites `/` to the resolved
// root plugin's route in place).
//
// Every `runtimeCaching[].urlPattern`/`.options.plugins` entry below is
// `Function.prototype.toString()`-serialized into the generated `sw.js` by
// workbox-build, which captures only that one function's own source text —
// no closures survive the trip, not even a reference to another top-level
// `const`/`function` in this same file. (This is exactly how a prior version
// of this file broke: a `ReferenceError` inside the generated worker
// silently disabled its entire custom routing, with no try/catch anywhere in
// workbox-routing's match path to surface it.) So each matcher inlines its
// own read of `self.__sovereignIsOfflineRoute` — installed synchronously by
// `runtime/worker/offline-session.ts`, which IS a properly webpack-bundled
// module and is `importScripts`-ed ahead of any `fetch` event. If that
// global is somehow absent, both matchers fail toward the always-safe path:
// "not an offline-shell route", so an unrecognized path lands on the
// `pages` handling below rather than the shared `StaleWhileRevalidate`
// cache.

/**
 * Extracted as a named export purely so
 * `src/__tests__/next-config-sw-matchers.test.ts` can import the real
 * function objects and confirm each one is genuinely self-contained —
 * exactly the property `workbox-build`'s `Function.prototype.toString()`
 * serialization silently requires and does not enforce. Passed to
 * `withPWAInit` unchanged below; this export changes nothing about the
 * production config.
 */
type PWAOptions = NonNullable<Parameters<typeof withPWAInit>[0]>;
export const runtimeCaching: NonNullable<
  NonNullable<PWAOptions['workboxOptions']>['runtimeCaching']
> = [
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
    urlPattern: ({ url, sameOrigin }: { url: URL; sameOrigin: boolean }) => {
      if (!sameOrigin) return false;
      const isOfflineRoute = (
        self as unknown as { __sovereignIsOfflineRoute?: (pathname: string) => boolean }
      ).__sovereignIsOfflineRoute;
      return isOfflineRoute ? isOfflineRoute(url.pathname) : false;
    },
    handler: 'StaleWhileRevalidate',
    options: {
      cacheName: 'offline-shells',
      expiration: { maxEntries: 64, maxAgeSeconds: 30 * 86400 },
      // Explicit and synchronous for the same reason `pages` below declares
      // its own `handlerDidError` — see that entry's comment. A miss here
      // (cache empty *and* network unreachable — e.g. the very first launch
      // happens offline) would otherwise hit next-pwa's auto-injected,
      // `async`-and-therefore-broken fallback instead of the generic
      // `/offline` page.
      plugins: [
        {
          handlerDidError: ({ request }: { request: Request }): Promise<Response> =>
            typeof self !== 'undefined'
              ? (self as unknown as { fallback: (r: Request) => Promise<Response> }).fallback(
                  request,
                )
              : Promise.resolve(Response.error()),
        },
      ],
    },
  },
  {
    // Everything else same-origin that isn't an API route or an
    // offline-capable shell: real per-user SSR (Console, Account, any
    // plugin without an `offline` tier) that this service worker must never
    // cache and replay. There is no safe cache key for these — the document
    // is personalized, and nothing on the device can currently reprove
    // "this is still the same, still-signed-in user" without a live round
    // trip to the server. So this entry never actually caches: try the
    // network (bounded by networkTimeoutSeconds so a stalled request falls
    // back promptly instead of hanging), and on any failure — offline, or a
    // timeout — fall straight to the generic `/offline` page.
    //
    // `handlerDidError` is declared explicitly here rather than left to
    // next-pwa's auto-injection (`@ducanh2912/next-pwa`'s dist/index.js adds
    // one itself for any entry whose `plugins` don't already declare it).
    // That auto-injected version — and the `cacheWillUpdate` below — must be
    // plain functions, never `async`: Next's `next.config.ts` loader
    // (`next/dist/build/next-config-ts/transpile-config.js`) transpiles this
    // file through SWC and, because the compiled source contains `require(`,
    // registers a *global* CommonJS require hook that runs every module
    // reached from here — including `@ducanh2912/next-pwa` itself — through
    // the same SWC pass. That pass lowers `async` arrow functions to
    // `_async_to_generator(...)`/`_ts_generator(...)` calls, but the helper
    // *definitions* live only in the transpiled module's own scope — they
    // are never part of the function's own source text. `workbox-build`
    // then does exactly the `Function.prototype.toString()` capture
    // documented above to embed these functions in `sw.js`, so the helper
    // calls survive but their definitions don't: every `async` plugin hook
    // here (ours or next-pwa's auto-injected one) throws `ReferenceError:
    // _async_to_generator is not defined` the instant the service worker
    // invokes it. Chrome swallows this as a bare `net::ERR_FAILED` with no
    // visible cause; Safari/WebKit surfaces the `ReferenceError` directly —
    // that's how this was actually root-caused, live on a real device,
    // after a Chromium-only automated pass had wrongly filed it as a
    // possible tooling artifact. Net effect: any offline navigation to a
    // route that isn't already cache-primed (anything outside
    // `offline-shells`, e.g. `/console` cold) fell straight through to the
    // browser's own error page instead of the generic `/offline` fallback.
    // Plain functions sidestep the transform (no `async`, nothing to
    // downlevel) and are what's used below.
    //
    // `NetworkFirst`, not `NetworkOnly`: workbox-build's schema rejects
    // `networkTimeoutSeconds` on any handler but `NetworkFirst` ("Unable to
    // generate service worker from template" build failure) even though
    // `NetworkOnly` itself supports the option at the `workbox-strategies`
    // class level — a `workbox-build` config-validation restriction, not a
    // strategy-runtime one. `cacheWillUpdate` returning `null` is the
    // standard Workbox idiom for "never actually store this response",
    // making the net effect identical to `NetworkOnly`: nothing is ever
    // written, so a cache lookup on failure is always a guaranteed miss.
    urlPattern: ({ url, sameOrigin }: { url: URL; sameOrigin: boolean }) => {
      if (!sameOrigin || url.pathname.startsWith('/api/')) return false;
      const isOfflineRoute = (
        self as unknown as { __sovereignIsOfflineRoute?: (pathname: string) => boolean }
      ).__sovereignIsOfflineRoute;
      return isOfflineRoute ? !isOfflineRoute(url.pathname) : true;
    },
    handler: 'NetworkFirst',
    options: {
      cacheName: 'pages',
      networkTimeoutSeconds: 4,
      plugins: [
        {
          cacheWillUpdate: (): Promise<null> => Promise.resolve(null),
          handlerDidError: ({ request }: { request: Request }): Promise<Response> =>
            typeof self !== 'undefined'
              ? (self as unknown as { fallback: (r: Request) => Promise<Response> }).fallback(
                  request,
                )
              : Promise.resolve(Response.error()),
        },
      ],
    },
  },
];

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
  // Both default `true` — disabled so next-pwa never registers its own
  // unpartitioned, session-blind `NetworkFirst` route for bare `/` (the
  // "start-url" cache) ahead of this file's `runtimeCaching` array. See the
  // comment above `runtimeCaching`'s declaration for why that mattered.
  cacheStartUrl: false,
  dynamicStartUrl: false,
  // "pages" (see runtimeCaching above) never caches, so there is no stale
  // document to bound the worst-case latency of — `networkTimeoutSeconds` on
  // that entry already keeps a stalled request from hanging past 4s before
  // falling to the generic `/offline` page. See
  // docs/research/0011-ios-pwa-inspection-findings.md #5.
  extendDefaultRuntimeCaching: true,
  workboxOptions: {
    runtimeCaching,
  },
});

export default withPWA(nextConfig);
