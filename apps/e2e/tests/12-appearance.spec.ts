import { expect, test, type Page } from '@playwright/test';
import { person } from '../support/env';
import { newPerson, signIn } from '../support/ui';

const owner = person('Olive');

const theme = (page: Page) => page.evaluate(() => document.documentElement.dataset.theme);
const bars = (page: Page) =>
  page
    .locator('meta[name="theme-color"]')
    .evaluateAll((tags) =>
      tags.map((tag) => [tag.getAttribute('media'), tag.getAttribute('content')]),
    );

/**
 * A person chooses light, dark or the system's for core on this device, in Preferences; it applies at once, is
 * there from the first paint on the next visit, and goes no further than this browser.
 */
test('light, dark or the system’s: chosen in Preferences, applied at once, and kept on this device', async ({
  browser,
}) => {
  const { context, page } = await newPerson(browser);
  await page.emulateMedia({ colorScheme: 'light' });
  await signIn(page, owner, '/preferences');
  const choice = (name: string) => page.getByRole('radio', { name, exact: true });

  // Nothing chosen: the system's, which is light here.
  await expect(choice('System')).toHaveAttribute('aria-checked', 'true');
  expect(await theme(page)).toBe('light');

  // Dark, over a light system: at once, with nothing to save, and in the browser's bar too.
  await choice('Dark').click();
  await expect(choice('Dark')).toHaveAttribute('aria-checked', 'true');
  expect(await theme(page)).toBe('dark');
  expect(await bars(page)).toEqual([
    [null, '#09090b'],
    [null, '#09090b'],
  ]);

  // On the next visit it is there from the first paint, before the page has run, as the choice and not the system.
  await page.reload();
  expect(await theme(page)).toBe('dark');
  await expect(choice('Dark')).toHaveAttribute('aria-checked', 'true');
  await page.goto('/');
  expect(await theme(page)).toBe('dark');

  // Light, over a dark system: the choice wins.
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/preferences');
  await choice('Light').click();
  expect(await theme(page)).toBe('light');
  expect(await bars(page)).toEqual([
    [null, '#ffffff'],
    [null, '#ffffff'],
  ]);

  // System: it follows the system, and goes on following it as the system changes.
  await choice('System').click();
  expect(await theme(page)).toBe('dark');
  expect(await bars(page)).toEqual([
    ['(prefers-color-scheme: light)', '#ffffff'],
    ['(prefers-color-scheme: dark)', '#09090b'],
  ]);
  await page.emulateMedia({ colorScheme: 'light' });
  await expect.poll(() => theme(page)).toBe('light');
  // Nothing is left saved.
  expect(await page.evaluate(() => localStorage.getItem('sv-theme'))).toBeNull();

  // It is this browser's: another person's browser has its own.
  const other = await newPerson(browser);
  await other.page.emulateMedia({ colorScheme: 'light' });
  await choice('Dark').click();
  await other.page.goto('/sign-in');
  expect(await theme(other.page)).toBe('light');
  await other.context.close();
  await context.close();
});
