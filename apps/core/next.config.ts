import { fileURLToPath } from 'node:url';
import type { NextConfig } from 'next';

const config: NextConfig = {
  // The image runs the server Next traces and copies out (`.next/standalone`), with only what it needs, so it
  // carries no source and no dev dependencies. The workspace's packages are outside this app, so the trace
  // starts at the repository's root.
  output: 'standalone',
  outputFileTracingRoot: fileURLToPath(new URL('../..', import.meta.url)),
  // The design system ships its TypeScript and CSS Modules as source; Next compiles it.
  transpilePackages: ['@sovereignfs/ui'],
  // Native and driver packages stay outside the bundle and load from node_modules.
  serverExternalPackages: ['@libsql/client', 'libsql', 'pg', 'nodemailer'],
  // The migrations are read from disk at start-up, so a traced (standalone) build must ship them.
  outputFileTracingIncludes: { '/*': ['./migrations/**/*.sql'] },
  poweredByHeader: false,
  reactStrictMode: true,
};

export default config;
