import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Two projects. `unit` needs nothing but Node and runs everywhere. `db` holds the
// tests that need a real database (`*.db.test.ts`); it runs once per dialect in
// CI, with SV_DB_DIALECT naming the one under test and the matching URL set.
// The workspace packages are consumed from their built `dist`. Tests read their source
// instead, so a test run needs no build first (CI runs the tests without one).
const source = (name: string, file: string) => ({
  find: new RegExp(`^@sovereignfs/${name}$`),
  replacement: fileURLToPath(new URL(file, import.meta.url)),
});

export default defineConfig({
  // Component tests are .tsx. Use Vite's own JSX transform for every package, so a
  // test does not depend on which tsconfig.json happens to be nearest to it.
  oxc: { jsx: { runtime: 'automatic' } },
  resolve: {
    alias: [
      source('config', './packages/config/src/index.ts'),
      source('database', './packages/database/src/index.ts'),
      {
        find: /^@sovereignfs\/database\/testing$/,
        replacement: fileURLToPath(new URL('./packages/database/src/testing.ts', import.meta.url)),
      },
    ],
  },
  test: {
    // Node by default; a component test opts into jsdom with a
    // `// @vitest-environment jsdom` pragma at the top of the file.
    environment: 'node',
    css: {
      // Resolve CSS Module class names to their literal names so tests can assert
      // on them (styles.ghost === 'ghost').
      modules: { classNameStrategy: 'non-scoped' },
    },
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          include: [
            'scripts/**/*.test.ts',
            'packages/*/src/**/*.test.{ts,tsx}',
            'apps/*/src/**/*.test.{ts,tsx}',
          ],
          exclude: ['**/node_modules/**', '**/*.db.test.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'db',
          include: ['**/*.db.test.ts'],
          exclude: ['**/node_modules/**'],
          testTimeout: 30_000,
        },
      },
    ],
  },
});
