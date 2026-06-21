import { test, expect } from './fixtures';

test.describe('Launcher — golden paths', () => {
  test('authenticated user sees the plugin grid', async ({ adminPage: page }) => {
    await page.goto('/launcher');
    // At least one plugin tile link must be present.
    const tiles = page.locator('ul li a');
    await expect(tiles.first()).toBeVisible();
    expect(await tiles.count()).toBeGreaterThan(0);
  });

  test('clicking a plugin tile navigates to its route', async ({ adminPage: page }) => {
    await page.goto('/launcher');
    const tile = page.locator('ul li a').first();
    const href = await tile.getAttribute('href');
    await tile.click();
    expect(page.url()).toContain(href ?? '/');
  });

  test('chrome plugins (Console, Account) are not in the grid', async ({ adminPage: page }) => {
    await page.goto('/launcher');
    // Chrome plugins are reached via sidebar / avatar menu, never via the grid.
    const gridLinks = page.locator('ul li a');
    const count = await gridLinks.count();
    for (let i = 0; i < count; i++) {
      const text = await gridLinks.nth(i).textContent();
      expect(text).not.toMatch(/^Console$/i);
      expect(text).not.toMatch(/^Account$/i);
    }
  });
});
