import { defineConfig } from 'tsup';

export default defineConfig({
  entry: { create: 'src/main.ts' },
  format: ['esm'],
  platform: 'node',
  target: 'node24',
  clean: true,
  sourcemap: false,
  splitting: false,
  outExtension: () => ({ js: '.mjs' }),
});
