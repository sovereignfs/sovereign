import { test, expect } from '@playwright/test';

const RUNTIME = 'http://localhost:3000';
const AUTH_SERVER = 'http://localhost:3001';

test.describe('Auth — golden paths', () => {
  test('unauthenticated visit redirects to auth login page', async ({ page }) => {
    await page.goto(`${RUNTIME}/`);
    await page.waitForURL(`${AUTH_SERVER}/login**`);
    await expect(page).toHaveURL(`${AUTH_SERVER}/login`);
  });

  test('login with valid credentials lands on the runtime', async ({ page }) => {
    await page.goto(`${RUNTIME}/`);
    await page.waitForURL(`${AUTH_SERVER}/login**`);
    await page.fill('#login-email', 'admin@sovereign.local');
    await page.fill('#login-password', 'admin-dev-password');
    await page.click('button[type="submit"]');
    await page.waitForURL(`${RUNTIME}/**`, { timeout: 15_000 });
    expect(page.url()).toContain(RUNTIME);
  });

  test('wrong password shows an error message and stays on the login page', async ({ page }) => {
    await page.goto(`${AUTH_SERVER}/login`);
    await page.fill('#login-email', 'admin@sovereign.local');
    await page.fill('#login-password', 'this-is-the-wrong-password');
    await page.click('button[type="submit"]');
    // The form stays on the login page and shows an error.
    await expect(page).toHaveURL(`${AUTH_SERVER}/login`);
    await expect(page.locator('p.error')).toBeVisible();
  });

  test('logout returns to /login with signed-out notice', async ({ browser }) => {
    // Use a fresh authenticated context (admin state loaded in global-setup).
    const ctx = await browser.newContext({
      storageState: require('path').join(__dirname, '../../.auth/admin.json'),
    });
    const page = await ctx.newPage();
    await page.goto(`${RUNTIME}/`);
    // Open the avatar menu.
    await page.click('button[aria-label="Account"]');
    // Click the Log out form submit button.
    await page.click('button[role="menuitem"]:has-text("Log out")');
    // Expect redirect to auth server login page with signedout param.
    await page.waitForURL(`${AUTH_SERVER}/login**`);
    await expect(page).toHaveURL(/signedout=1/);
    await expect(page.locator('[role="status"]')).toContainText('signed out');
    await ctx.close();
  });
});
