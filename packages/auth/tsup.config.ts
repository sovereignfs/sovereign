import { defineConfig } from 'tsup';

/**
 * The entries the specification names (auth.md §2): the root, `/server`, `/next`, `/client`, `/core`, `/postgres`, and the browser guard the server
 * entries resolve to in a page. `@sovereignfs/crypto` and `@sovereignfs/database` are private today, so they are bundled in, code and
 * types, and a published package needs neither; `@sovereignfs/config` and `@sovereignfs/sdk` are published, and are dependencies.
 */
export default defineConfig({
  entry: {
    index: 'src/index.ts',
    browser: 'src/browser.ts',
    'server/index': 'src/server/index.ts',
    'next/index': 'src/next/index.ts',
    'client/index': 'src/client/index.ts',
    'core/index': 'src/core/index.ts',
    postgres: 'src/postgres.ts',
  },
  format: ['esm'],
  dts: {
    resolve: [/^@sovereignfs\/(crypto|database)/],
    // The workspace points the packages at their source; their built declarations are what can be inlined.
    compilerOptions: {
      paths: {
        '@sovereignfs/crypto': ['../crypto/dist/index.d.ts'],
        '@sovereignfs/crypto/web': ['../crypto/dist/web/index.d.ts'],
        '@sovereignfs/database': ['../database/dist/index.d.ts'],
      },
    },
  },
  noExternal: [/^@sovereignfs\/(crypto|database)/],
  // The build script empties dist first.
  clean: false,
});
