import type { NextConfig } from 'next';

const config: NextConfig = {
  // The design system ships its TypeScript and CSS Modules as source; Next compiles it.
  transpilePackages: ['@sovereignfs/ui'],
  poweredByHeader: false,
  reactStrictMode: true,
};

export default config;
