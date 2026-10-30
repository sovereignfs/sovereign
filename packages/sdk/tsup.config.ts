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
  dts: true,
  clean: true,
  noExternal: [/^@sovereignfs\//],
});
