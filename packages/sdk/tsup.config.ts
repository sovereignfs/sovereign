import { defineConfig } from 'tsup';

/**
 * Two entry points, as the specification says (sdk §12): the root, and `/testing`. The browser guard is the root's
 * `browser` condition. `@sovereignfs/api-client` and `@sovereignfs/config` are private today, so they are bundled in and
 * a published package needs neither; publishing them is a later task's decision.
 */
export default defineConfig({
  entry: { index: 'src/index.ts', browser: 'src/browser.ts', testing: 'src/testing/index.ts' },
  format: ['esm'],
  dts: true,
  clean: true,
  noExternal: [/^@sovereignfs\//],
});
