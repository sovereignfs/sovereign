import { defineConfig } from 'tsup';

/**
 * The entry points the specification names (sdk §12): the root, `/next`, `/testing`, `/keys` (the one browser entry) and `/vault` (an app's own vault, on its server). The
 * browser guard is the root's `browser` condition. `@sovereignfs/api-client`, `@sovereignfs/config` and `@sovereignfs/crypto`
 * are private today, so they are bundled in and a published package needs none of them; publishing them is a later decision.
 */
export default defineConfig({
  entry: {
    index: 'src/index.ts',
    browser: 'src/browser.ts',
    testing: 'src/testing/index.ts',
    next: 'src/next/index.ts',
    keys: 'src/keys.ts',
    vault: 'src/vault.ts',
  },
  format: ['esm'],
  // The private packages' types are inlined, as their code is, so nothing in the published types names a package npm lacks.
  dts: {
    resolve: [/^@sovereignfs\//],
    // The workspace points the package at its source; its built declarations are what can be inlined.
    compilerOptions: {
      paths: {
        '@sovereignfs/api-client': ['../api-client/dist/index.d.ts'],
        '@sovereignfs/crypto/web': ['../crypto/dist/web/index.d.ts'],
        '@sovereignfs/crypto/vault': ['../crypto/dist/vault/index.d.ts'],
      },
    },
  },
  clean: true,
  noExternal: [/^@sovereignfs\//],
});
