import { defineConfig, devices } from '@playwright/test';

const isCI = !!process.env.CI;

// Deliberately a separate copy of playwright.config.ts's e2e server env, not
// a shared import — the two suites' server lifecycles (and the values each
// one needs) are meant to stay independently editable. See
// docs/testing-visual.md for why this suite reuses e2e's global-setup.ts and
// fixtures.ts directly (pre-authenticated storage state) rather than driving
// its own login flow, which would put non-deterministic UI transitions in
// front of every screenshot.
const e2eAuthSecret =
  process.env.E2E_AUTH_SECRET ?? process.env.AUTH_SECRET ?? 'sovereign-e2e-auth-secret';
const e2eAdminKey =
  process.env.E2E_ADMIN_KEY ?? process.env.SOVEREIGN_ADMIN_KEY ?? 'sovereign-e2e-admin-key';
const visualServerEnv = {
  AUTH_SECRET: e2eAuthSecret,
  SOVEREIGN_AUTH_SECRET: process.env.SOVEREIGN_AUTH_SECRET ?? e2eAuthSecret,
  SOVEREIGN_ADMIN_KEY: e2eAdminKey,
  AUTH_REQUIRE_EMAIL_VERIFICATION: 'false',
  // Pin explicitly: a local .env may set RUNTIME_PORT/AUTH_PORT to something
  // other than the framework defaults (e.g. to avoid colliding with another
  // checkout's native dev servers on the same machine) — this suite's
  // webServer URLs and baseURL below are hardcoded to 3000/3001, so it must
  // not inherit an ambient override. playwright.config.ts (e2e) has the same
  // implicit assumption but doesn't pin it; out of scope to fix here.
  RUNTIME_PORT: '3000',
  AUTH_PORT: '3001',
};

// Tier 2 only (RFC 0059) — the cross-runtime smoke suite (auth, shell,
// first-party plugins, overlays, mobile nav). Tier 1 (packages/ui's own
// curated component baseline set) lives in packages/ui/playwright.visual.config.ts
// with its own Storybook-only webServer — kept as a separate config rather
// than a second `projects` entry here so a components-only run never depends
// on the full runtime/auth/DB stack coming up (and vice versa).
export default defineConfig({
  testDir: './__tests__/visual',
  testMatch: '**/*.visual.spec.ts',
  outputDir: './test-results-visual',
  reporter: isCI
    ? [['list'], ['html', { open: 'never', outputFolder: 'playwright-report-visual' }]]
    : [['list']],
  use: {
    ...devices['Desktop Chrome'],
    baseURL: 'http://localhost:3000',
    viewport: { width: 1280, height: 800 },
    trace: 'off',
    screenshot: 'off',
  },
  expect: {
    // Above the 5s default — see packages/ui/playwright.visual.config.ts's
    // matching comment.
    timeout: 15_000,
    toHaveScreenshot: {
      // Playwright's built-in animation/transition freeze — covers RFC 0059's
      // "disable or reduce motion during visual tests" requirement without a
      // per-component opt-out.
      animations: 'disabled',
      // Small tolerance for cross-run anti-aliasing/font-hinting noise, not a
      // real visual regression. Cross-platform (macOS dev vs Linux CI) font
      // rendering is NOT covered by this tolerance — see
      // docs/testing-visual.md's "Known limitation" note; baselines must be
      // (re)generated in the same OS that will compare against them.
      maxDiffPixelRatio: 0.02,
    },
  },
  retries: isCI ? 1 : 0,
  // Serialise in CI, matching playwright.config.ts's e2e suite — this suite
  // shares the same sqld-backed runtime/auth servers.
  workers: isCI ? 1 : undefined,
  globalSetup: './__tests__/e2e/global-setup.ts',
  webServer: [
    {
      // Auth server — polled at /login (statically rendered, always reachable, no /api/health).
      command: 'pnpm --filter @sovereignfs/auth dev',
      url: 'http://localhost:3001/login',
      reuseExistingServer: !isCI,
      timeout: 120_000,
      env: visualServerEnv,
      stdout: 'ignore',
      stderr: 'ignore',
    },
    {
      // Runtime — polled at /api/health (public liveness probe, no session required).
      command: 'pnpm --filter @sovereignfs/runtime dev',
      url: 'http://localhost:3000/api/health',
      reuseExistingServer: !isCI,
      timeout: 180_000,
      env: visualServerEnv,
      stdout: 'ignore',
      stderr: 'ignore',
    },
  ],
});
