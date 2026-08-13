import { test, expect } from '@playwright/test';

/**
 * Tier 2 (RFC 0059): cross-runtime smoke suite — auth. Unauthenticated only;
 * login behavior itself (credentials, errors, redirects) is e2e's job
 * (__tests__/e2e/auth.spec.ts) — this just guards the page's layout.
 */
test('login page', async ({ page }) => {
  await page.goto('/');
  await page.waitForSelector('#login-email');
  await expect(page).toHaveScreenshot('login.png', { fullPage: true });
});
