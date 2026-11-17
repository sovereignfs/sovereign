import { defineConfig, type Options } from 'tsup';

/**
 * The entry points the specification names (sdk §12): the root, `/next`, `/testing`, `/keys` and `/local-vault` (the browser
 * entries) and `/vault` (an app's own vault, on its server). The browser guard is the root's `browser` condition.
 * `@sovereignfs/api-client`, `@sovereignfs/config` and `@sovereignfs/crypto` are private today, so they are bundled in and a
 * published package needs none of them; publishing them is a later decision.
 *
 * `/local-vault` is built on its own: it alone loads the password derivation (Argon2id, libsodium's WebAssembly), and built with
 * the others it would share a chunk with `/keys` that names libsodium, since the crypto package is one barrel. Built apart, `/keys`
 * reaches no libsodium file and `/local-vault` loads it only when a key is derived (a check in `pnpm packages:check` holds both).
 */
const common: Options = {
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
  noExternal: [/^@sovereignfs\//],
  // The two builds run at once, so neither cleans: the build script empties dist first.
  clean: false,
};

export default defineConfig([
  {
    ...common,
    entry: {
      index: 'src/index.ts',
      browser: 'src/browser.ts',
      testing: 'src/testing/index.ts',
      next: 'src/next/index.ts',
      keys: 'src/keys.ts',
      vault: 'src/vault.ts',
    },
    // Nothing here derives a key, but the bundler would still write libsodium's chunk for the import it drops; external, it is
    // neither written nor named.
    external: ['libsodium-wrappers-sumo'],
  },
  {
    ...common,
    entry: { 'local-vault': 'src/local-vault.ts' },
    // Its own chunks go in a folder of their own, so the two builds never write the same file.
    outDir: 'dist/local-vault',
  },
]);
