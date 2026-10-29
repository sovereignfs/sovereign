import { defineConfig, devices } from '@playwright/test';
import { CORE_URL } from './support/env';

/**
 * Phase 1 acceptance (core-app §3.17): one serial run, in order, against a built core on a database of its own. The
 * database is the one SV_DB_DIALECT names (sqlite by default), with its URL variables as the database tests read
 * them, so CI runs this once for each of sqld, PostgreSQL and a SQLite file.
 */
process.env.SV_DB_DIALECT ??= 'sqlite';
// The test database helper wants a URL to name the dialect's settings; for SQLite it makes a file of its own.
process.env.SV_SQLITE_URL ??= 'file:/tmp/sovereign-e2e.db';

export default defineConfig({
  testDir: './tests',
  // The steps depend on the ones before them (the owner exists before the owner invites), so they run in order.
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 90_000,
  expect: { timeout: 10_000 },
  reporter: [['list']],
  globalSetup: './support/global-setup.ts',
  use: {
    ...devices['Desktop Chrome'],
    baseURL: CORE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  outputDir: './test-results',
});
