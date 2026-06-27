import { test, expect } from './fixtures';

test.describe('Console plugin — golden paths', () => {
  test('admin can access /console', async ({ adminPage: page }) => {
    await page.goto('/console');
    // The console layout renders an h1 "Console" heading.
    await expect(page.locator('h1')).toBeVisible();
  });

  test('regular user gets a 403 response on /console', async ({ userPage: page }) => {
    const response = await page.goto('/console');
    expect(response?.status()).toBe(403);
  });

  test('plugin list page shows installed plugins', async ({ adminPage: page }) => {
    await page.goto('/console/plugins');
    // The plugins page has no dedicated heading; the install panel and table identify it.
    await expect(page.getByText('Add a plugin')).toBeVisible();
    await expect(page.locator('tbody tr').first()).toBeVisible();
  });

  test('user list page shows both seeded test users', async ({ adminPage: page }) => {
    await page.goto('/console/users');
    await expect(page.getByRole('heading', { name: 'Users' })).toBeVisible();
    // Scope to the table to avoid matching the mobile card list or any open dialogs.
    await expect(page.getByRole('table').getByText('admin@sovereign.local').first()).toBeVisible();
    await expect(page.getByRole('table').getByText('user@sovereign.local').first()).toBeVisible();
  });
});
