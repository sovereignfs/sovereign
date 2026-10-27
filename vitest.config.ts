import { defineConfig } from 'vitest/config';

// Two projects. `unit` needs nothing but Node and runs everywhere. `db` holds the
// tests that need a real database (`*.db.test.ts`); it runs once per dialect in
// CI, with SV_DB_DIALECT naming the one under test and the matching URL set.
export default defineConfig({
  // Component tests are .tsx. Use Vite's own JSX transform for every package, so a
  // test does not depend on which tsconfig.json happens to be nearest to it.
  oxc: { jsx: { runtime: 'automatic' } },
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
          include: ['scripts/**/*.test.ts', 'packages/*/src/**/*.test.{ts,tsx}'],
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
