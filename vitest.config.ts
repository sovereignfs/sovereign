import { defineConfig } from 'vitest/config';

// Two projects. `unit` needs nothing but Node and runs everywhere. `db` holds the
// tests that need a real database (`*.db.test.ts`); it runs once per dialect in
// CI, with SV_DB_DIALECT naming the one under test and the matching URL set.
export default defineConfig({
  test: {
    environment: 'node',
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          include: ['scripts/**/*.test.ts'],
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
