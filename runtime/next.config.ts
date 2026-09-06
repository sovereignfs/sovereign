import { resolve } from 'node:path';
import { loadEnvConfig } from '@next/env';
import type { NextConfig } from 'next';

// Load the single monorepo-root .env (mirrors apps/auth). No per-app .env files.
loadEnvConfig(resolve(process.cwd(), '..'), process.env.NODE_ENV !== 'production');

// Static security response headers (RFC 0008 Tier 0). The Content-Security-Policy
// is set per-request in proxy.ts (it needs a fresh nonce), so it is not
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
  // better-sqlite3-multiple-ciphers (RFC 0071) uses native bindings — never bundle it.
  serverExternalPackages: ['better-sqlite3-multiple-ciphers'],
  // Turbopack (Next 16's default). The webpack-era `resolve.alias` that
  // stubbed out `better-sqlite3` and `libsql` (native addon chains that
  // drizzle-orm and @libsql/client import statically but this codebase never
  // constructs — every SQLite open goes through sqld over http(s), RFC 0091)
  // is not needed here: Turbopack externalizes those packages' native
  // loaders cleanly instead of trying to parse the `.node` binaries and
  // READMEs they pull in. Verified by `next build` on the Next 16 upgrade.
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

// Installable PWA (SRS §3.11, PLT-09). The service worker is built by
// `scripts/build-sw.ts` after `next build` (see `worker/index.ts` and
// `worker/routes.ts` for the route table and the never-cache-a-per-user-page
// guarantee) and registered by `app/_components/ServiceWorkerRegistration.tsx`.
// Nothing about it lives in this file any more — that decoupling is what let
// the runtime move to Turbopack.
export default nextConfig;
