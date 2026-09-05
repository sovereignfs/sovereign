import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect } from './fixtures';
import { loadRootEnv, resolveAppPort } from '../../scripts/dev-ports.mjs';

loadRootEnv(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..'));
const RUNTIME = `http://localhost:${resolveAppPort('runtime')}`;

test.describe('Platform shell navigation — golden paths', () => {
  test('root URL / stays at / (middleware rewrite) and shows launcher content', async ({
    adminPage: page,
  }) => {
    await page.goto('/');
    // URL must remain / — middleware rewrites to the root plugin without redirecting.
    await expect(page).toHaveURL(`${RUNTIME}/`);
    // Launcher grid (the default root plugin) renders at least one tile.
    await expect(page.locator('ul li a').first()).toBeVisible();
  });

  test('brand link returns to / from any page', async ({ adminPage: page }) => {
    await page.goto('/launcher');
    await Promise.all([
      page.waitForURL(`${RUNTIME}/`),
      page.getByRole('link', { name: 'Sovereign home' }).click(),
    ]);
    await expect(page).toHaveURL(`${RUNTIME}/`);
  });

  test('avatar menu opens and can be dismissed with Escape', async ({ adminPage: page }) => {
    await page.goto('/');
    const trigger = page.getByRole('button', { name: 'Account' }).first();
    await trigger.focus();
    await page.keyboard.press('Enter');
    // Menu items must be visible after opening.
    await expect(page.locator('[role="menuitem"]:has-text("Account")')).toBeVisible();
    await expect(page.locator('[role="menuitem"]:has-text("Sign out")')).toBeVisible();
    // Escape should close the menu.
    await page.keyboard.press('Escape');
    await expect(page.locator('[role="menuitem"]:has-text("Sign out")')).not.toBeVisible();
  });
});
