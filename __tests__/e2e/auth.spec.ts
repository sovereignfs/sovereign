import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect } from '@playwright/test';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RUNTIME = 'http://localhost:3000';
const ADMIN_STATE = path.join(__dirname, '../../.auth/admin.json');

test.describe('Auth — golden paths', () => {
  test('unauthenticated visit shows the login page at /', async ({ page }) => {
    // Unauthenticated GET / is rewritten (not redirected) to the login
    // document — the URL stays "/" (see runtime/middleware.ts's iOS PWA
    // splash rewrite; also covered directly by a middleware unit test).
    await page.goto(`${RUNTIME}/`);
    await page.waitForSelector('#login-email');
    await expect(page).toHaveURL(`${RUNTIME}/`);
  });

  test('login with valid credentials lands on the runtime', async ({ page }) => {
    await page.goto(`${RUNTIME}/`);
    await page.waitForSelector('#login-email');
    await page.fill('#login-email', 'admin@sovereign.local');
    await page.fill('#login-password', 'admin-dev-password');
    await page.click('button[type="submit"]');
    // Can't wait for a URL change: the page is already at RUNTIME/ before
    // submitting (see above), so waitForURL(RUNTIME/) would resolve instantly
    // without confirming sign-in actually completed. Wait for the
    // authenticated shell to render instead.
    await page.getByRole('button', { name: 'Account' }).first().waitFor({ timeout: 15_000 });
    await expect(page).toHaveURL(`${RUNTIME}/`);
  });

  test('wrong password shows an error message and stays on the login page', async ({ page }) => {
    await page.goto(`${RUNTIME}/login`);
    await page.fill('#login-email', 'admin@sovereign.local');
    await page.fill('#login-password', 'this-is-the-wrong-password');
    await page.click('button[type="submit"]');
    // The form stays on the login page and shows an error.
    await expect(page).toHaveURL(`${RUNTIME}/login`);
    // CSS Module class names are hashed; the only <p> inside <form> is the error message.
    await expect(page.locator('form p')).toBeVisible();
  });

  test('logout returns to /login with signed-out notice', async ({ browser }) => {
    // Use a fresh authenticated context (admin state loaded in global-setup).
    const ctx = await browser.newContext({
      storageState: ADMIN_STATE,
    });
    const page = await ctx.newPage();
    await page.goto(`${RUNTIME}/`);
    // Open the avatar menu.
    await page.getByRole('button', { name: 'Account' }).first().focus();
    await page.keyboard.press('Enter');
    // Click the Log out form submit button.
    await page.click('button[role="menuitem"]:has-text("Sign out")');
    // Expect redirect to runtime login page with signedout param.
    await page.waitForURL(`${RUNTIME}/login**`);
    await expect(page).toHaveURL(/signedout=1/);
    await expect(page.locator('[role="status"]')).toContainText('signed out');
    await ctx.close();
  });
});
