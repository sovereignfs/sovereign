import { defineConfig } from 'tsup';

/**
 * Two files, each with its dependencies inside, so the package installs with none: the library (`validate` and the rest) with its types,
 * and the command. The schemas are read from `contracts/schemas` at build time, where they are the one copy.
 */
const shared = {
  format: ['esm'] as ['esm'],
  platform: 'node' as const,
  target: 'node22',
  noExternal: [/.*/],
  banner: {
    js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);",
  },
};

export default defineConfig([
  { ...shared, entry: { index: 'src/index.ts' }, dts: true, clean: true },
  // `src/cli.ts` starts with `#!/usr/bin/env node`, which the bundle keeps as its first line and marks the file executable for.
  { ...shared, entry: { cli: 'src/cli.ts' }, clean: false },
]);
