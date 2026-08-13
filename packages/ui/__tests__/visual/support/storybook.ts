import type { Page } from '@playwright/test';

export const STORYBOOK_URL = process.env.STORYBOOK_URL ?? 'http://localhost:6100';

export type Theme = 'light' | 'dark';

/**
 * Navigate directly to a story's isolated iframe (bypassing the Storybook
 * manager UI) and wait for it to finish mounting. `id` is the story id
 * Storybook derives from `${kebab(title)}--${kebab(exportName)}`, e.g.
 * `components-navtabs--default`.
 */
export async function gotoStory(page: Page, id: string, theme: Theme = 'light'): Promise<void> {
  await page.goto(`${STORYBOOK_URL}/iframe.html?id=${id}&viewMode=story&globals=theme:${theme}`);
  const root = page.locator('#storybook-root');
  await root.waitFor({ state: 'attached' });
  // Storybook's loader wrapper is only ever hidden (display: none) once the
  // story mounts, never removed from the DOM — waiting for 'detached' here
  // never resolves and silently burns the whole test timeout.
  await page.locator('.sb-preparing-story').waitFor({ state: 'hidden' });
}
