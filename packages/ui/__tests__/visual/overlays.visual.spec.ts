import { test, expect } from '@playwright/test';
import { gotoStory, type Theme } from './support/storybook';

/**
 * Tier 1 (RFC 0059): overlay/open states for Dialog, Drawer, and Popover —
 * these only render their interesting visual state on user interaction, so
 * a plain default-args screenshot (as used in components.visual.spec.ts)
 * would just capture the closed trigger button. All three demos live in the
 * Component Gallery section of DesignSystemOverview.stories.tsx (they have
 * no standalone story files of their own).
 */
const THEMES: Theme[] = ['light', 'dark'];

for (const theme of THEMES) {
  test.describe(`${theme} theme`, () => {
    test('dialog open', async ({ page }) => {
      await gotoStory(page, 'overview--design-system', theme);
      await page.getByRole('button', { name: 'Open dialog' }).click();
      const dialog = page.getByRole('dialog', { name: 'Example dialog' });
      await expect(dialog).toBeVisible();
      await expect(dialog).toHaveScreenshot(`dialog-open-${theme}.png`);
    });

    test('drawer open', async ({ page }) => {
      await gotoStory(page, 'overview--design-system', theme);
      // "Open drawer" also labels the MobileAppsDrawer demo further down the
      // gallery — .first() is the Drawer component's own trigger.
      await page.getByRole('button', { name: 'Open drawer' }).first().click();
      const drawer = page.getByRole('dialog', { name: 'Navigation' });
      await expect(drawer).toBeVisible();
      await expect(drawer).toHaveScreenshot(`drawer-open-${theme}.png`);
    });

    test('popover open', async ({ page }) => {
      await gotoStory(page, 'overview--design-system', theme);
      await page.getByRole('button', { name: 'Options' }).click();
      const popover = page.getByRole('dialog', { name: 'Options menu' });
      await expect(popover).toBeVisible();
      await expect(popover).toHaveScreenshot(`popover-open-${theme}.png`);
    });
  });
}
