import { expect, test, type Page } from '@playwright/test';
import { CORE_URL, freshAddress, person } from '../support/env';
import { newPerson, signIn } from '../support/ui';

const owner = person('Olive');

/** What the service worker may keep (core-app §3.5): files that are the same for everyone. */
const KEPT = [/^\/_next\/static\//, /^\/icons\//];

test.describe.configure({ mode: 'serial' });

/** The address of everything in every cache the page's origin has. */
const cached = (page: Page) =>
  page.evaluate(async () => {
    const found: string[] = [];
    for (const name of await caches.keys()) {
      const cache = await caches.open(name);
      for (const request of await cache.keys())
        found.push(new URL(request.url).pathname + new URL(request.url).search);
    }
    return found;
  });

const controlled = (page: Page) =>
  page.evaluate(async () => {
    const registration = await navigator.serviceWorker.ready;
    return {
      scope: registration.scope,
      active: registration.active?.state,
      controller: !!navigator.serviceWorker.controller,
    };
  });

test('core serves its service worker to anyone, afresh every time, and it registers for the whole origin', async ({
  page,
}) => {
  const response = await fetch(`${CORE_URL}/sw.js`, {
    headers: { 'x-forwarded-for': freshAddress() },
  });
  expect(response.status).toBe(200);
  expect(response.headers.get('content-type')).toBe('text/javascript; charset=utf-8');
  expect(response.headers.get('cache-control')).toBe('no-cache');
  expect(response.headers.get('service-worker-allowed')).toBe('/');
  // Under the same policy as every page, and the hardening headers with it.
  expect(response.headers.get('x-content-type-options')).toBe('nosniff');
  expect(response.headers.get('content-security-policy')).toContain("worker-src 'self'");

  await page.goto('/sign-in');
  expect((await controlled(page)).scope).toBe(`${CORE_URL}/`);
  await expect.poll(async () => (await controlled(page)).active).toBe('activated');
});

test('a signed-in session leaves nothing in any cache but files that are the same for everyone', async ({
  browser,
}) => {
  const { context, page } = await newPerson(browser);
  await signIn(page, owner);
  // Every kind of page there is: the launcher, the account, the Console, an app's consent, the API.
  for (const path of [
    '/',
    '/profile',
    '/security',
    '/connected-apps',
    '/console',
    '/console/accounts',
    '/console/permissions',
    '/api/auth/get-session',
    '/api/v1/directory/users?q=ol',
    '/.well-known/openid-configuration',
  ]) {
    await page.goto(path);
  }
  // The worker is in control from the first page, and keeps what a page loaded as it loads; a reload reads it back.
  await page.goto('/');
  await page.reload();
  expect((await controlled(page)).controller).toBe(true);

  const found = await cached(page);
  expect(found.length).toBeGreaterThan(0);
  for (const path of found) {
    expect(
      KEPT.some((pattern) => pattern.test(path)),
      `${path} is kept`,
    ).toBe(true);
  }
  // Nothing of the person is in what is kept: not a page, not a name.
  expect(found.join(' ')).not.toMatch(/profile|console|accounts|api\/|Olive|sovereign\.local/i);
  await context.close();
});

test('with no network, a navigation says so in a page of core’s own, and shows nothing of a person', async ({
  browser,
}) => {
  const { context, page } = await newPerson(browser);
  await signIn(page, owner);
  await page.goto('/profile');
  await expect(page.getByText('Your account').first()).toBeVisible();
  await page.reload();
  expect((await controlled(page)).controller).toBe(true);

  await context.setOffline(true);
  const offline = await page.goto('/console/accounts', { waitUntil: 'domcontentloaded' });
  expect(offline?.status()).toBe(503);
  await expect(page.getByRole('heading', { name: 'You’re offline' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Try again' })).toBeVisible();
  // Nothing of the page it was going to, or of the person who was signed in.
  const text = await page.locator('body').innerText();
  expect(text).not.toMatch(/Olive|sovereign\.local|Accounts|Console|Permissions/);
  // It is its own page, with its own policy: nothing else may run or load there.
  expect(offline?.headers()['content-security-policy']).toBe(
    "default-src 'none'; style-src 'unsafe-inline'",
  );

  // Back online, the same address is the real page again, and nothing was left of the offline one.
  await context.setOffline(false);
  await page.goto('/console/accounts');
  await expect(page.getByRole('heading', { name: 'Accounts' })).toBeVisible();
  await context.close();
});
