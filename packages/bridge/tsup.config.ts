import { defineConfig } from 'tsup';

export default defineConfig({
  // Two entries so neither side pulls the other's code (RFC 0083 §1):
  // index.ts is the page side (consumed by runtime), shell.ts is the
  // shell side (consumed by sovereign-mobile/sovereign-desktop).
  entry: ['src/index.ts', 'src/shell.ts'],
  format: ['esm'],
  dts: true,
  clean: true,
});
