import { defineConfig } from 'tsup';

export default defineConfig({
  // Two entries so neither side pulls the other's code (RFC 0083 §1):
  // index.ts is the page side (consumed by runtime), shell.ts is the
  // shell side (consumed by sovereign-mobile/sovereign-desktop).
  entry: ['src/index.ts', 'src/shell.ts'],
  format: ['esm'],
  // tsup 8.5.1 (the newest release, pre-TypeScript 6) hardcodes
  // `baseUrl: compilerOptions.baseUrl || '.'` in its dts rollup step
  // (dist/rollup.js); TypeScript 6 rejects a set `baseUrl` with TS5101
  // (deprecated, removed in 7.0) and nothing in a tsconfig can unset it.
  // Scoped to this dts pass only — every `tsc --noEmit` typecheck stays
  // strict. Drop once tsup stops injecting baseUrl.
  dts: { compilerOptions: { ignoreDeprecations: '6.0' } },
  clean: true,
});
