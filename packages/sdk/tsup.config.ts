import { defineConfig } from 'tsup';

/**
 * The entry points the specification names (sdk §12): the root, `/next` and `/testing`. The browser guard is the root's
 * `browser` condition. `@sovereignfs/api-client` and `@sovereignfs/config` are private today, so they are bundled in and
 * a published package needs neither; publishing them is a later task's decision.
 */
export default defineConfig({
  entry: {
    index: 'src/index.ts',
    browser: 'src/browser.ts',
    testing: 'src/testing/index.ts',
    next: 'src/next/index.ts',
  },
  format: ['esm'],
  // The private packages' types are inlined, as their code is, so nothing in the published types names a package npm lacks.
  dts: {
    resolve: [/^@sovereignfs\//],
    // The workspace points the package at its source; its built declarations are what can be inlined.
    compilerOptions: { paths: { '@sovereignfs/api-client': ['../api-client/dist/index.d.ts'] } },
  },
  clean: true,
  noExternal: [/^@sovereignfs\//],
});
