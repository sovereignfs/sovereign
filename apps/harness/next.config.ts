import { resolve } from 'node:path';
import { loadEnvConfig } from '@next/env';
import type { NextConfig } from 'next';

// Load the single monorepo-root .env (no per-app .env files) — same as apps/auth/apps/relay.
loadEnvConfig(resolve(process.cwd(), '../..'), process.env.NODE_ENV !== 'production');

// Static security response headers. No CSP here — this service serves no HTML,
// only JSON/SSE API responses, so there is no inline-script surface to
// constrain the way apps/auth's per-request CSP does (matches apps/relay).
const isProd = process.env.NODE_ENV === 'production';
const securityHeaders = [
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-DNS-Prefetch-Control', value: 'off' },
  ...(isProd
    ? [{ key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' }]
    : []),
];

const nextConfig: NextConfig = {
  // Self-contained production server (`.next/standalone`) for the Docker image,
  // matching apps/auth/apps/relay.
  output: 'standalone',
  outputFileTracingRoot: resolve(process.cwd(), '../..'),
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default nextConfig;
