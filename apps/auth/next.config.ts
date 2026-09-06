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
  // sibling) — the bundler never touches this chain (Turbopack externalizes
  // the native loader; webpack needed an alias to avoid a build-time parse
  // failure), so the tracer is the only thing that can find these files, and
  // it can't see this dynamic require. Force-include every platform
  // variant pnpm-workspace.yaml's `supportedArchitectures` now installs.
  outputFileTracingIncludes: {
    '/**': [
      '../../node_modules/.pnpm/@libsql+linux-*/node_modules/@libsql/linux-*/**',
      '../../node_modules/.pnpm/@libsql+darwin-*/node_modules/@libsql/darwin-*/**',
    ],
  },
  // Turbopack (Next 16's default). The webpack-era `resolve.alias` that
  // stubbed out `libsql` (the native addon chain `@libsql/client` and
  // `@libsql/kysely-libsql` import statically but only construct for
  // `file:` URLs — this app only connects to sqld over http(s), RFC 0091) is
  // not needed: Turbopack externalizes the native loader cleanly instead of
  // parsing the `.node` binaries and READMEs it pulls in. Mirrors
  // runtime/next.config.ts. The `outputFileTracingIncludes` above is still
  // required — that is the standalone file tracer, not the bundler.
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default nextConfig;
