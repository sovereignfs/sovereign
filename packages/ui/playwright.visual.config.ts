import { defineConfig, devices } from '@playwright/test';

const isCI = !!process.env.CI;

export default defineConfig({
  testDir: './__tests__/visual',
  testMatch: '**/*.visual.spec.ts',
  outputDir: './test-results-visual',
  reporter: isCI
    ? [['list'], ['html', { open: 'never', outputFolder: 'storybook-visual-report' }]]
    : [['list']],
  use: {
    ...devices['Desktop Chrome'],
    viewport: { width: 1280, height: 800 },
    trace: 'off',
    screenshot: 'off',
  },
  expect: {
    // Above the 5s default — a slow/loaded machine can make the internal
    // "wait for fonts to load" check alone take longer than that, which
    // otherwise surfaces as a false-positive diff rather than a real one.
    timeout: 15_000,
    toHaveScreenshot: {
      // Playwright's built-in animation/transition freeze — covers RFC 0059's
      // "disable or reduce motion during visual tests" requirement.
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
  workers: isCI ? 1 : undefined,
  webServer: {
    command: 'pnpm storybook:visual',
    url: 'http://localhost:6100',
    reuseExistingServer: !isCI,
    timeout: 60_000,
    stdout: 'ignore',
    stderr: 'ignore',
  },
});
