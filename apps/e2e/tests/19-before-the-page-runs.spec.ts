import { expect, test, type Browser, type BrowserContextOptions } from '@playwright/test';
import { lockNewestSession, resetLinkFor } from '../support/database';
import { CORE_URL, freshAddress, person } from '../support/env';
import { invite, newPerson, signIn } from '../support/ui';

const owner = person('Olive');

/** Typed into the boxes in place of a password: nothing here is anyone's. */
const TYPED = 'typed-before-the-page-ran';

type Cookies = BrowserContextOptions['storageState'];

/**
 * A page of core with a form its script sends, as someone quicker than that script finds it. A browser sends a form itself while
 * nothing has taken it over: a GET, with every named box in the address, the password too, and core is never to receive one
 * (core-app §5.2). So the form's button is off until the page runs, which stops the Enter key as well.
 */
async function holdsUntilThePageRuns(
  browser: Browser,
  path: string,
  options: { box?: string; cookies?: Cookies; lands?: string } = {},
): Promise<void> {
  const { box = 'input[type=password]', cookies, lands } = options;
  const open = async (javaScriptEnabled: boolean) => {
    const context = await browser.newContext({
      baseURL: CORE_URL,
      javaScriptEnabled,
      storageState: cookies,
      extraHTTPHeaders: { 'x-forwarded-for': freshAddress() },
    });
    const page = await context.newPage();
    await page.goto(path);
    // The page asked for, not one core sent the browser on to instead.
    expect(new URL(page.url()).pathname).toBe(lands ?? new URL(path, CORE_URL).pathname);
    const form = page.locator('form').filter({ has: page.locator(box) });
    await expect(form).toHaveCount(1);
    return { context, page, form, button: form.locator('button[type=submit]') };
  };

  const early = await open(false);
  // Every box a browser would want filled before it sends the form, so that only the button stands in the way.
  for (const field of await early.form.locator('input:not([readonly])').all()) {
    const type = (await field.getAttribute('type')) ?? 'text';
    if (type === 'password') await field.fill(TYPED);
    else if (type === 'email') await field.fill('early@sovereign.local');
    else if (type === 'checkbox') await field.check();
    else if ((await field.getAttribute('name')) === 'name') await field.fill('Early');
  }
  const sent: string[] = [];
  early.page.on('request', (request) => {
    if (request.isNavigationRequest()) sent.push(request.url());
  });
  await early.form.locator(box).last().press('Enter');
  // Nothing happens when it holds, so there is nothing to wait for: long enough for a navigation to have started.
  await early.page.waitForTimeout(1000);
  expect(sent).toEqual([]);
  await expect(early.button).toBeDisabled();
  await early.context.close();

  const running = await open(true);
  await expect(running.button).toBeEnabled();
  await running.context.close();
}

test('§5.2: sign-in sends nothing before the page runs', async ({ browser }) => {
  await holdsUntilThePageRuns(browser, '/sign-in');
});

test('§5.2: asking for a reset link sends nothing before the page runs', async ({ browser }) => {
  await holdsUntilThePageRuns(browser, '/forgot-password', { box: 'input[type=email]' });
});

test('§5.2: a new password from a reset link is not sent before the page runs', async ({
  browser,
}) => {
  await holdsUntilThePageRuns(browser, await resetLinkFor(owner.email));
});

test('§5.2: signing up from an invitation sends nothing before the page runs', async ({
  browser,
}) => {
  const operator = await newPerson(browser);
  await signIn(operator.page, owner, '/console/invites');
  const link = await invite(operator.page, 'early@sovereign.local');
  await operator.context.close();
  await holdsUntilThePageRuns(browser, link, { lands: '/sign-up' });
});

test('§5.2: no password is sent from Security or the mail settings before the page runs', async ({
  browser,
}) => {
  const operator = await newPerson(browser);
  await signIn(operator.page, owner, '/security');
  const cookies = await operator.context.storageState();
  await operator.context.close();
  await holdsUntilThePageRuns(browser, '/security', { cookies });
  await holdsUntilThePageRuns(browser, '/console/settings', { cookies });
});

test('§5.2: the lock page sends nothing before the page runs', async ({ browser }) => {
  const operator = await newPerson(browser);
  await signIn(operator.page, owner, '/security');
  const cookies = await operator.context.storageState();
  await operator.context.close();
  await lockNewestSession(owner.email);
  await holdsUntilThePageRuns(browser, '/lock', { cookies });
});
