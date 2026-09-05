import { defineConfig, devices } from '@playwright/test';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadRootEnv, resolveAppPort } from './scripts/dev-ports.mjs';

// A local `.env` AUTH_PORT/RUNTIME_PORT override (read by
// scripts/next-server.mjs, which the webServer commands below spawn) must
// be visible here too — otherwise this config silently keeps polling the
// *default* 3001/3000 while the real dev servers come up on whatever this
// machine's .env actually configured, and every webServer entry times out
// waiting for a server that was listening the whole time, just not where
// this file was looking.
loadRootEnv(dirname(fileURLToPath(import.meta.url)));
const AUTH_PORT = resolveAppPort('auth');
const RUNTIME_PORT = resolveAppPort('runtime');

const isCI = !!process.env.CI;
const e2eAuthSecret =
  process.env.E2E_AUTH_SECRET ?? process.env.AUTH_SECRET ?? 'sovereign-e2e-auth-secret';
const e2eAdminKey =
  process.env.E2E_ADMIN_KEY ?? process.env.SOVEREIGN_ADMIN_KEY ?? 'sovereign-e2e-admin-key';
const e2eServerEnv = {
  AUTH_SECRET: e2eAuthSecret,
  SOVEREIGN_AUTH_SECRET: process.env.SOVEREIGN_AUTH_SECRET ?? e2eAuthSecret,
  SOVEREIGN_ADMIN_KEY: e2eAdminKey,
  // The webServer env is fixed for the whole suite (one process, can't toggle
  // per-spec) — most existing specs (password-reset, auth) register a fresh
  // user and expect an immediate session, so verification stays off here.
  // The default-on (required) path is covered by apps/auth's own unit tests
  // (getAuthOptions() config assertions) and the manual verification
  // checklist; email-verification.spec.ts covers the opt-out path itself.
  AUTH_REQUIRE_EMAIL_VERIFICATION: 'false',
  // paywall.spec.ts exercises the example-monetized plugin directly
  // (/example-monetized) — without this, example-plugins/ never composes and
  // that route 404s (SOVEREIGN_EXAMPLES_ENABLED is off by default; see
  // scripts/generate-registry.ts and docs/self-hosting.md's "Reference
  // example plugins"). Runtime-visibility default too, so the plugin also
  // isn't hidden by Console's example toggle.
  SOVEREIGN_EXAMPLES_ENABLED: '1',
};

export default defineConfig({
  testDir: './__tests__/e2e',
  testMatch: '**/*.spec.ts',
  outputDir: './test-results',
  reporter: isCI
    ? [['list'], ['html', { open: 'never' }]]
    : [['list'], ['html', { open: 'on-failure' }]],
  use: {
    baseURL: `http://localhost:${RUNTIME_PORT}`,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  retries: isCI ? 1 : 0,
  // Serialise in CI: specs share one sqld instance/namespace, and aren't
  // written to tolerate concurrent runs against the same data.
  workers: isCI ? 1 : undefined,
  globalSetup: './__tests__/e2e/global-setup.ts',
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      // Auth server — polled at /login (statically rendered, always reachable, no /api/health).
      command: 'pnpm --filter @sovereignfs/auth dev',
      url: `http://localhost:${AUTH_PORT}/login`,
      reuseExistingServer: !isCI,
      timeout: 120_000,
      env: e2eServerEnv,
      // Suppress Next.js dev-server output from the terminal; errors surface via test failures.
      stdout: 'ignore',
      stderr: 'ignore',
    },
    {
      // Runtime — polled at /api/health (public liveness probe, no session required).
      // Longer timeout: the generate step (compose plugin routes) runs before next dev.
      command: 'pnpm --filter @sovereignfs/runtime dev',
      url: `http://localhost:${RUNTIME_PORT}/api/health`,
      reuseExistingServer: !isCI,
      timeout: 180_000,
      env: e2eServerEnv,
      stdout: 'ignore',
      stderr: 'ignore',
    },
  ],
});
