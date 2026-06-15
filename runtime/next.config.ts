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
  // Compile all workspace packages from source — package edits trigger HMR.
  transpilePackages: [
    '@sovereignfs/sdk',
    '@sovereignfs/ui',
    '@sovereignfs/db',
    '@sovereignfs/manifest',
    '@sovereignfs/mailer',
  ],
  // better-sqlite3 uses native bindings — Webpack cannot bundle it.
  serverExternalPackages: ['better-sqlite3'],
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

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
});

export default withPWA(nextConfig);
