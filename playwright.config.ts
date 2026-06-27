import { defineConfig, devices } from '@playwright/test';

const isCI = !!process.env.CI;

export default defineConfig({
  testDir: './__tests__/e2e',
  testMatch: '**/*.spec.ts',
  outputDir: './test-results',
  reporter: isCI
    ? [['list'], ['html', { open: 'never' }]]
    : [['list'], ['html', { open: 'on-failure' }]],
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  retries: isCI ? 1 : 0,
  // Serialise in CI: both apps share one SQLite file — concurrent writes cause locking errors.
  workers: isCI ? 1 : undefined,
  globalSetup: './__tests__/e2e/global-setup.ts',
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      // Auth server — polled at /login (statically rendered, always reachable, no /api/health).
      command: 'pnpm --filter @sovereignfs/auth dev',
      url: 'http://localhost:3001/login',
      reuseExistingServer: !isCI,
      timeout: 120_000,
      // Suppress Next.js dev-server output from the terminal; errors surface via test failures.
      stdout: 'ignore',
      stderr: 'ignore',
    },
    {
      // Runtime — polled at /api/health (public liveness probe, no session required).
      // Longer timeout: the generate step (compose plugin routes) runs before next dev.
      command: 'pnpm --filter @sovereignfs/runtime dev',
      url: 'http://localhost:3000/api/health',
      reuseExistingServer: !isCI,
      timeout: 180_000,
      stdout: 'ignore',
      stderr: 'ignore',
    },
  ],
});
