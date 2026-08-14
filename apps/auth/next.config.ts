import { resolve } from 'node:path';
import { loadEnvConfig } from '@next/env';
import type { NextConfig } from 'next';

// Load the single monorepo-root .env (no per-app .env files). Runs before the
// app boots, so process.env is populated for both the server and migrations.
loadEnvConfig(resolve(process.cwd(), '../..'), process.env.NODE_ENV !== 'production');

// Static security response headers (RFC 0008 Tier 0); mirrors the runtime. The
// per-request CSP is set in middleware.ts. HSTS is production-only.
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
  // Tracing is rooted at the monorepo root so workspace package files are
  // included in the standalone output.
  output: 'standalone',
  outputFileTracingRoot: resolve(process.cwd(), '../..'),
  // Compile the design system from source (no watch build needed in dev).
  transpilePackages: ['@sovereignfs/mailer', '@sovereignfs/ui'],
  // Native bindings must be loaded by Node.js directly rather than bundled by Webpack.
  serverExternalPackages: ['better-sqlite3-multiple-ciphers'],
  // The standalone output's file tracer (@vercel/nft) can't see this at all —
  // @neon-rs/load's require() of the platform-specific `@libsql/<target>`
  // package is dynamic (branches on the running platform at call time), so
  // the tracer's static analysis never discovers it and silently omits it
  // from `.next/standalone/node_modules`, even when it's genuinely present
  // in the full node_modules the build ran with. Crashes
  // apps/auth/instrumentation.ts's eager `runAuthMigrations()` at boot with
  // `Cannot find module '@libsql/linux-arm64-musl'` (or the -gnu/-x64
  // sibling) despite the webpack alias below already stopping Webpack from
  // trying to bundle this chain — that alias only prevents a *build-time
  // parse failure* for statically-traceable import paths; it does nothing
  // for this dynamic, tracer-invisible one. Force-include every platform
  // variant pnpm-workspace.yaml's `supportedArchitectures` now installs.
  outputFileTracingIncludes: {
    '/**': [
      '../../node_modules/.pnpm/@libsql+linux-*/node_modules/@libsql/linux-*/**',
      '../../node_modules/.pnpm/@libsql+darwin-*/node_modules/@libsql/darwin-*/**',
    ],
  },
  webpack: (config) => {
    // Drop the native `libsql` package from the server graph (mirrors
    // runtime/next.config.ts's identical `better-sqlite3` alias). Both
    // `@libsql/client` (used directly for sqld, RFC 0091) and
    // `@libsql/kysely-libsql` (its own internally-pinned, older
    // `@libsql/client`) statically import `libsql` — a native platform
    // binding — but only ever construct it for `file:`-scheme URLs. This app
    // only ever connects to sqld over `http(s):` (`getAuthDatabase`,
    // `getAuthDb` in src/db.ts), so that path is never taken. Without this
    // alias, Webpack tries to bundle the native addon chain (`libsql` →
    // `@neon-rs/load` → the platform-specific `@libsql/<target>` binary +
    // its README) and fails to parse the non-JS files it pulls in.
    config.resolve.alias = { ...config.resolve.alias, libsql: false };
    return config;
  },
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default nextConfig;
