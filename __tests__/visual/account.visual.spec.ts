import { test, expect } from '../e2e/fixtures';

/**
 * Tier 2 (RFC 0059): cross-runtime smoke suite — Account plugin. Behavior
 * (display name update, theme toggle) is e2e's job
 * (__tests__/e2e/account.spec.ts) — this just guards layout, both the
 * full-page fallback and the overlay presentation.
 */
test('account profile — full-page fallback', async ({ adminPage: page }) => {
  await page.goto('/account/profile');
  await page.locator('#name').waitFor();
  await expect(page).toHaveScreenshot('account-profile-fullpage.png', { fullPage: true });
});

test('account — overlay presentation', async ({ adminPage: page }) => {
  await page.goto('/');
  // Reached via the avatar menu (client-side <Link replace>) rather than a
  // direct goto — that's what actually triggers the overlay-shell dialog
  // instead of the full-page fallback captured above.
  await page.getByRole('button', { name: 'Account' }).first().focus();
  await page.keyboard.press('Enter');
  await page.locator('[role="menuitem"]:has-text("Account")').click();
  await page.getByRole('dialog').waitFor();
  await expect(page).toHaveScreenshot('account-overlay.png', { fullPage: true });
});
