import { defineConfig } from 'tsup';

/**
 * The toolkit as one file with its dependencies inside, so that an instance repository installs one package and nothing it
 * depends on can move under it (operator-cli §3, §5). The schemas under `contracts/` are read at build time and bundled with it.
 */
export default defineConfig({
  entry: { sv: 'src/main.ts' },
  format: ['esm'],
  platform: 'node',
  target: 'node24',
  clean: true,
  sourcemap: false,
  splitting: false,
  noExternal: [/.*/],
  outExtension: () => ({ js: '.mjs' }),
  banner: {
    js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);",
  },
});
