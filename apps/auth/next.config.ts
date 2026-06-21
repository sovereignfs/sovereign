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
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default nextConfig;
