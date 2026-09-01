import { test, expect } from './fixtures';

test.describe('Launcher — golden paths', () => {
  test('authenticated user sees the plugin grid', async ({ adminPage: page }) => {
    await page.goto('/launcher');
    // At least one plugin tile link must be present. The grid is populated
    // entirely client-side (LauncherOfflineView's post-mount fetch of
    // /api/plugins, per RFC 0078's offline-capable, user-neutral page.tsx
    // shell) — global-setup's own page.goto('/') closes its browser context
    // right after the SSR shell appears, before hydration fires that fetch,
    // so this is typically the first real hit to /api/plugins in the whole
    // suite. Against `next dev` (not a production build), Next compiles API
    // routes on demand on their first request, which can outlast the default
    // 5s assertion timeout on a cold CI runner. A generous timeout here (like
    // auth.test.ts's own cold-import timeout bump) avoids that false negative
    // without weakening the assertion once the grid is actually up.
    const tiles = page.locator('ul li a');
    await expect(tiles.first()).toBeVisible({ timeout: 15_000 });
    expect(await tiles.count()).toBeGreaterThan(0);
  });

  test('clicking a plugin tile navigates to its route', async ({ adminPage: page }) => {
    await page.goto('/launcher');
    const tile = page.locator('ul li a').first();
    // Same cold /api/plugins compile risk as the previous test if this spec
    // ever runs standalone/first — wait for the grid before reading it.
    await expect(tile).toBeVisible({ timeout: 15_000 });
    const href = await tile.getAttribute('href');
    // tile.click() returns before Next.js <Link> navigation commits — wait for the URL change.
    await Promise.all([page.waitForURL(`**${href}**`, { timeout: 10_000 }), tile.click()]);
    expect(page.url()).toContain(href ?? '/');
  });

  test('chrome plugins (Console, Account) are not in the grid', async ({ adminPage: page }) => {
    await page.goto('/launcher');
    // Chrome plugins are reached via sidebar / avatar menu, never via the grid.
    const gridLinks = page.locator('ul li a');
    // Same cold /api/plugins compile risk as the first test above.
    await expect(gridLinks.first()).toBeVisible({ timeout: 15_000 });
    const count = await gridLinks.count();
    for (let i = 0; i < count; i++) {
      const text = await gridLinks.nth(i).textContent();
      expect(text).not.toMatch(/^Console$/i);
      expect(text).not.toMatch(/^Account$/i);
    }
  });
});
