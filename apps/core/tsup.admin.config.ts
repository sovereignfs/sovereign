import { defineConfig } from 'tsup';

/**
 * `sovereign-admin` as one file (core-app §3.7.4). The image holds the traced Next server and nothing to run
 * TypeScript with, so the command is bundled here: everything it imports from core and its dependencies goes in,
 * except `libsql`, which holds native code, and `pg`, which the image carries in `node_modules` for the server. The
 * Dockerfile links `libsql` to where the admin file finds it.
 */
export default defineConfig({
  entry: { 'sovereign-admin': 'src/admin/main.ts' },
  format: ['esm'],
  platform: 'node',
  target: 'node24',
  outDir: 'dist',
  clean: true,
  sourcemap: false,
  splitting: false,
  noExternal: [/^(?!libsql(\/|$)|pg(-native)?(\/|$))/],
  outExtension: () => ({ js: '.mjs' }),
  external: [/^libsql(\/|$)/, /^pg(-native)?(\/|$)/],
  // Some bundled packages still `require` a Node built-in, which an ES module has to be given.
  banner: {
    js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);",
  },
});
