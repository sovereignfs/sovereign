import { expect, test } from '@playwright/test';
import { CORE_URL, freshAddress, person } from '../support/env';
import { newPerson, signIn } from '../support/ui';

const owner = person('Olive');

const get = (path: string) =>
  fetch(`${CORE_URL}${path}`, {
    redirect: 'manual',
    headers: { 'x-forwarded-for': freshAddress() },
  });

type Manifest = {
  id: string;
  name: string;
  short_name: string;
  start_url: string;
  scope: string;
  display: string;
  icons: { src: string; sizes: string; type: string; purpose: string }[];
};

/**
 * Core installs as an app (RFC 0001): a browser finds a manifest with no session, the page tells a device how to
 * meet its screen, and what an installed core is called follows what the operator calls the instance.
 */
test.describe.configure({ mode: 'serial' });

test('the manifest is public, parses, and names the instance, its start and its icons', async () => {
  const response = await get('/manifest.webmanifest');
  expect(response.status).toBe(200);
  expect(response.headers.get('content-type')).toContain('application/manifest+json');
  const manifest = (await response.json()) as Manifest;
  expect(manifest).toMatchObject({
    id: '/',
    name: 'Sovereign',
    start_url: '/',
    scope: '/',
    display: 'standalone',
  });
  // Every icon it names is served, to a browser with no session, as the type and kind it says.
  expect(manifest.icons.map((icon) => icon.sizes).sort()).toEqual([
    '192x192',
    '512x512',
    '512x512',
  ]);
  expect(manifest.icons.map((icon) => icon.purpose).sort()).toEqual(['any', 'any', 'maskable']);
  for (const icon of manifest.icons) {
    const served = await get(icon.src);
    expect(served.status, icon.src).toBe(200);
    expect(served.headers.get('content-type'), icon.src).toBe(icon.type);
  }
});

test('every page links the manifest and tells a device how to meet its screen', async ({
  page,
}) => {
  const response = await page.goto('/sign-in');
  // The manifest is core's own, so the policy allows it and nothing else.
  expect(response?.headers()['content-security-policy']).toContain("manifest-src 'self'");
  expect(await page.locator('link[rel="manifest"]').getAttribute('href')).toBe(
    '/manifest.webmanifest',
  );
  const themeColours = await page
    .locator('meta[name="theme-color"]')
    .evaluateAll((tags) =>
      tags.map((tag) => [tag.getAttribute('media'), tag.getAttribute('content')]),
    );
  expect(themeColours).toEqual([
    ['(prefers-color-scheme: light)', '#ffffff'],
    ['(prefers-color-scheme: dark)', '#09090b'],
  ]);
  expect(await page.locator('meta[name="viewport"]').getAttribute('content')).toContain(
    'viewport-fit=cover',
  );
  expect(await page.locator('meta[name="mobile-web-app-capable"]').getAttribute('content')).toBe(
    'yes',
  );
  expect(
    await page.locator('meta[name="apple-mobile-web-app-title"]').getAttribute('content'),
  ).toBe('Sovereign');
});

test('an installed core takes the instance’s name when the operator renames it, and the default when they stop', async ({
  browser,
}) => {
  const { context, page } = await newPerson(browser);
  await signIn(page, owner, '/console/settings');
  await page.locator('input[name="name"]').fill('Acme Family Cloud');
  await page.getByRole('button', { name: 'Save name' }).click();
  await expect(page.getByText(/name is saved|saved/i).first()).toBeVisible();

  const manifestNow = async () => (await (await get('/manifest.webmanifest')).json()) as Manifest;
  await expect.poll(async () => (await manifestNow()).name).toBe('Acme Family Cloud');
  expect((await manifestNow()).short_name).toBe('Acme Family');
  await page.goto('/sign-in');
  expect(
    await page.locator('meta[name="apple-mobile-web-app-title"]').getAttribute('content'),
  ).toBe('Acme Family Cloud');

  await page.goto('/console/settings');
  await page.getByRole('button', { name: 'Use the default' }).first().click();
  await expect(page.locator('input[name="name"]')).toHaveValue('Sovereign');
  await expect.poll(async () => (await manifestNow()).name).toBe('Sovereign');
  await context.close();
});
