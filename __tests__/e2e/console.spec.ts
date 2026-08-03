import { test, expect } from './fixtures';

test.describe('Console plugin — golden paths', () => {
  test('admin can access /console', async ({ adminPage: page }) => {
    await page.goto('/console');
    // The console layout renders an h1 "Console" heading.
    await expect(page.locator('h1')).toBeVisible();
  });

  test('regular user is redirected to /forbidden from /console', async ({ userPage: page }) => {
    const response = await page.goto('/console');
    // Page routes redirect (303) to /forbidden rather than returning a raw
    // 403, so page.goto()'s terminal response is the /forbidden page's own
    // 200 — assert on the redirect target instead of the final status.
    expect(response?.status()).toBe(200);
    expect(page.url()).toContain('/forbidden');
    await expect(page.getByText("You don't have access to this")).toBeVisible();
  });

  test('plugin list page shows installed plugins', async ({ adminPage: page }) => {
    await page.goto('/console/plugins');
    // The plugins page has no dedicated heading; the plugin table identifies it.
    await expect(page.locator('tbody tr').first()).toBeVisible();
  });

  test('user list page shows both seeded test users', async ({ adminPage: page }) => {
    await page.goto('/console/users');
    await expect(page.getByRole('heading', { name: 'Users' })).toBeVisible();
    // Scope to the table to avoid matching the mobile card list or any open dialogs.
    await expect(page.getByRole('table').getByText('admin@sovereign.local').first()).toBeVisible();
    await expect(page.getByRole('table').getByText('user@sovereign.local').first()).toBeVisible();
  });

  test('groups page renders', async ({ adminPage: page }) => {
    await page.goto('/console/groups');
    await expect(page.getByRole('heading', { name: 'Groups' })).toBeVisible();
  });

  test('entitlements page renders', async ({ adminPage: page }) => {
    await page.goto('/console/entitlements');
    await expect(page.getByRole('heading', { name: 'Plugin entitlements' })).toBeVisible();
  });

  test('broadcast page renders', async ({ adminPage: page }) => {
    await page.goto('/console/broadcast');
    await expect(page.getByRole('heading', { name: 'Broadcast Notification' })).toBeVisible();
  });
});
