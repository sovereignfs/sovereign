import { test, expect } from '@playwright/test';
import { gotoStory, type Theme } from './support/storybook';

/**
 * Tier 1 (RFC 0059): curated `@sovereignfs/ui` baseline set. Deliberately not
 * exhaustive — one representative state per component family, not every
 * prop permutation. Add a story here only when a component's visual contract
 * is stable enough to be worth protecting; see docs/testing-visual.md.
 */
const CURATED_STORIES: Array<{ id: string; name: string }> = [
  { id: 'overview--design-system', name: 'design-system-overview' },
  { id: 'design-tokens-token-gallery--all-tokens', name: 'token-gallery' },
  { id: 'components-navtabs--default', name: 'navtabs' },
  { id: 'components-pageheader--with-action', name: 'pageheader' },
  { id: 'components-card--interactive', name: 'card-interactive' },
  { id: 'components-formfield--with-error', name: 'formfield-error' },
  { id: 'components-checkbox--disabled-checked', name: 'checkbox-disabled-checked' },
  { id: 'components-emptystate--with-action', name: 'emptystate' },
  { id: 'components-avatar--all-sizes', name: 'avatar' },
];

const THEMES: Theme[] = ['light', 'dark'];

for (const theme of THEMES) {
  test.describe(`${theme} theme`, () => {
    for (const story of CURATED_STORIES) {
      test(story.name, async ({ page }) => {
        await gotoStory(page, story.id, theme);
        await expect(page.locator('#storybook-root')).toHaveScreenshot(
          `${story.name}-${theme}.png`,
        );
      });
    }
  });
}

// NavTabs' own mobile-viewport behavior (horizontal scroll, masked overflow) —
// only screenshotted at the one viewport where it actually differs, per RFC
// 0059's "viewports where component behavior changes" guidance.
test('navtabs many-tabs — mobile viewport', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await gotoStory(page, 'components-navtabs--many-tabs', 'light');
  await expect(page.locator('#storybook-root')).toHaveScreenshot('navtabs-many-tabs-mobile.png');
});
