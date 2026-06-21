import { test, expect } from './fixtures';

test.describe('Console plugin — golden paths', () => {
  test('admin can access /console', async ({ adminPage: page }) => {
    await page.goto('/console');
    // The console page (full-page, not interception) renders the plugin content.
    await expect(page.locator('h2')).toBeVisible();
  });

  test('regular user gets a 403 response on /console', async ({ userPage: page }) => {
    const response = await page.goto('/console');
    expect(response?.status()).toBe(403);
  });

  test('plugin list page shows installed plugins', async ({ adminPage: page }) => {
    await page.goto('/console/plugins');
    await expect(page.getByRole('heading', { name: 'Plugins' })).toBeVisible();
    // At least one table row (a plugin entry) must be present.
    await expect(page.locator('tbody tr').first()).toBeVisible();
  });

  test('user list page shows both seeded test users', async ({ adminPage: page }) => {
    await page.goto('/console/users');
    await expect(page.getByRole('heading', { name: 'Users' })).toBeVisible();
    await expect(page.getByText('admin@sovereign.local')).toBeVisible();
    await expect(page.getByText('user@sovereign.local')).toBeVisible();
  });
});
