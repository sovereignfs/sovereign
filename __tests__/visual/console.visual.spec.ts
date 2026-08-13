import { test, expect } from '../e2e/fixtures';

/**
 * Tier 2 (RFC 0059): cross-runtime smoke suite — Console plugin. Behavior
 * (access control, list contents) is e2e's job
 * (__tests__/e2e/console.spec.ts) — this just guards layout.
 */
test('console — settings', async ({ adminPage: page }) => {
  await page.goto('/console/settings');
  await page.getByRole('heading').first().waitFor();
  await expect(page).toHaveScreenshot('console-settings.png', { fullPage: true });
});

test('console — system health', async ({ adminPage: page }) => {
  await page.goto('/console/health');
  await page.getByRole('heading').first().waitFor();
  await expect(page).toHaveScreenshot('console-health.png', { fullPage: true });
});
