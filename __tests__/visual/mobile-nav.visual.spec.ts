import { test, expect } from '../e2e/fixtures';

/**
 * Tier 2 (RFC 0059): cross-runtime smoke suite — mobile apps drawer. Only
 * rendered below the shell's mobile breakpoint (see MobileNav.tsx).
 */
test('mobile apps drawer — open', async ({ adminPage: page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/launcher');
  await page.getByRole('button', { name: 'Apps' }).click();
  const drawer = page.getByRole('dialog', { name: 'App navigation' });
  await drawer.waitFor();
  await expect(page).toHaveScreenshot('mobile-apps-drawer-open.png', { fullPage: true });
});
