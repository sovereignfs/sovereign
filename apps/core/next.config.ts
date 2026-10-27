import type { NextConfig } from 'next';

const config: NextConfig = {
  // The design system ships its TypeScript and CSS Modules as source; Next compiles it.
  transpilePackages: ['@sovereignfs/ui'],
  // Native and driver packages stay outside the bundle and load from node_modules.
  serverExternalPackages: ['@libsql/client', 'libsql', 'pg'],
  // The migrations are read from disk at start-up, so a traced (standalone) build must ship them.
  outputFileTracingIncludes: { '/*': ['./migrations/**/*.sql'] },
  poweredByHeader: false,
  reactStrictMode: true,
};

export default config;
