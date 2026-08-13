import { test, expect } from '../e2e/fixtures';

/**
 * Tier 2 (RFC 0059): cross-runtime smoke suite — shell + Launcher. Behavior
 * (tile click navigates, chrome plugins excluded, …) is e2e's job
 * (__tests__/e2e/launcher.spec.ts, navigation.spec.ts) — this just guards
 * layout, desktop and mobile.
 */
test('launcher grid — desktop', async ({ adminPage: page }) => {
  await page.goto('/launcher');
  await page.locator('ul li a').first().waitFor();
  await expect(page).toHaveScreenshot('launcher-desktop.png', { fullPage: true });
});

test('shell — mobile viewport (header + footer nav)', async ({ adminPage: page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/launcher');
  await page.locator('ul li a').first().waitFor();
  await expect(page).toHaveScreenshot('shell-mobile.png', { fullPage: true });
});
