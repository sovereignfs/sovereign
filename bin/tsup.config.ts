import { defineConfig } from 'tsup';

// Bundles bin/sv-backup-cli.ts (epic task 8.16) into a single, dependency-free
// artifact the production `runner` Docker image can run with plain `node` —
// no `pnpm`/`tsx`/full `node_modules` needed there. Output goes under
// `runtime/dist-cli/` (not `bin/dist/`) so the Dockerfile's existing
// `runtime/`-rooted COPY conventions can pick it up alongside the traced
// Next.js standalone output, in the same stage.
//
// `citty`/`consola` are both genuinely zero-dependency, pure-JS packages
// (verified against their own package.json files) — inlining them via
// `noExternal` is exactly what tsup's default `skipNodeModulesBundle`
// behavior would otherwise mark external. `backup-restore.ts` itself
// deliberately has no other npm dependency (see its own doc comment) — no
// native addon, so no further Dockerfile COPY is needed for this bundle.
// Paths are relative to the invocation cwd (the repo root — this config is
// run via the root package.json's "build:cli" script, `tsup --config
// bin/tsup.config.ts`, not from inside bin/ itself), not relative to this
// file's own location.
export default defineConfig({
  entry: ['bin/sv-backup-cli.ts'],
  outDir: 'runtime/dist-cli',
  format: ['esm'],
  platform: 'node',
  target: 'node24',
  noExternal: ['citty', 'consola'],
  clean: true,
  dts: false,
});
