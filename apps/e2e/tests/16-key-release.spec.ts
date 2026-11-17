import { expect, test, type Page } from '@playwright/test';
import { memoryBackend } from '@sovereignfs/crypto/web';
import { appKeys } from '@sovereignfs/sdk/keys';
import { registerApp } from '../support/console';
import { openDatabase } from '../support/database';
import { CORE_URL, MINIMAL_URL, person } from '../support/env';
import { join, newPerson, signIn } from '../support/ui';

const owner = person('Olive');

async function subOf(email: string): Promise<string> {
  const database = await openDatabase();
  try {
    return String(
      (await database.run('select id from users where email = ?', [email])).rows[0]?.id,
    );
  } finally {
    await database.close();
  }
}

async function appKeyRows(sub: string): Promise<string[]> {
  const database = await openDatabase();
  try {
    return (
      await database.run('select client_id from key_apps where user_id = ? order by client_id', [
        sub,
      ])
    ).rows.map((row) => String(row.client_id));
  } finally {
    await database.close();
  }
}

/**
 * An app's page, run here through `@sovereignfs/sdk/keys` itself: its address bar is the browser's, its server's key secret one
 * per app session, and what it keeps is in memory. The browser does what a person's would: core's release page, then the app.
 */
function appPage(clientId: string, returnTo: string, sub: string) {
  const bar = { hash: '', assigned: '' };
  const secret = Buffer.alloc(32, clientId.length).toString('base64url');
  const keys = appKeys({
    core: CORE_URL,
    clientId,
    returnTo,
    backend: memoryBackend(),
    fetch: async () => new Response(JSON.stringify({ sub, secret }), { status: 200 }),
    location: {
      get hash() {
        return bar.hash;
      },
      pathname: '/',
      search: '',
      assign: (url: string | URL) => {
        bar.assigned = String(url);
      },
    },
    history: {
      replaceState: () => {
        bar.hash = '';
      },
    },
  });
  return { keys, bar };
}

/** Takes the browser through core's release for `app`, and gives the fragment it came back with. */
async function release(page: Page, app: ReturnType<typeof appPage>, returnTo: string) {
  await app.keys.unlock();
  // As the app's page would: the browser says where the request came from.
  await page.goto(app.bar.assigned, { referer: `${new URL(returnTo).origin}/` });
  const kit = page.getByRole('checkbox', { name: /kept my recovery kit/ });
  const back = page.waitForURL((url) => url.href.startsWith(`${returnTo}#`), { timeout: 15_000 });
  // The first encrypted app shows the kit once (core-app §5.3).
  await Promise.race([
    back,
    kit.waitFor({ timeout: 15_000 }).then(async () => {
      await kit.check();
      await page.getByRole('button', { name: 'Continue' }).click();
    }),
  ]);
  await back;
  return new URL(page.url()).hash;
}

/**
 * Key release (core-app §5.7, RFC 0005 §4): an app gets its own key, the same each time, and never another app's; an answer replayed,
 * or taken by a page that did not ask, is refused; core sends a key nowhere but an app's registered return address.
 */
test('§5.10.5: an app receives its own key and never another’s; a release replayed, sent to another app, or to a page that did not ask is refused', async ({
  browser,
}) => {
  const operator = await newPerson(browser);
  await signIn(operator.page, owner, '/console/apps');
  const returnA = `${MINIMAL_URL}/keys/journal`;
  const returnB = `${MINIMAL_URL}/keys/ledger`;
  const journal = await registerApp(operator.page, {
    name: 'Journal',
    launchUrl: `${MINIMAL_URL}/journal`,
    redirectUri: `${MINIMAL_URL}/journal/callback`,
    kind: 'public',
    scopes: [],
    keyReturnUri: returnA,
  });
  const ledger = await registerApp(operator.page, {
    name: 'Ledger',
    launchUrl: `${MINIMAL_URL}/ledger`,
    redirectUri: `${MINIMAL_URL}/ledger/callback`,
    kind: 'public',
    scopes: [],
    keyReturnUri: returnB,
  });
  const reader = person('Rhea');
  const joined = await join(browser, operator.page, reader);
  await operator.context.close();
  const page = joined.page;
  const sub = await subOf(reader.email);

  // A request that does not say it came from the app is asked about, and nothing is released until the person says so.
  const a = appPage(journal.id, returnA, sub);
  await a.keys.unlock();
  await page.goto(a.bar.assigned);
  await expect(page.getByRole('button', { name: 'Continue to Journal' })).toBeVisible();
  await page.waitForTimeout(500);
  expect(page.url()).toContain('/keys/release');

  // The first release makes the app's keys; the kit is kept on the way.
  a.bar.hash = await release(page, a, returnA);
  expect(await a.keys.receive()).toEqual({ ok: true, returnPath: '/' });
  const opened = await a.keys.open();
  expect(opened.state).toBe('open');

  // The same answer again is refused: its request was used.
  const replayed = a.bar.hash;
  a.bar.hash = await release(page, a, returnA);
  const second = a.bar.hash;
  expect(await a.keys.receive()).toEqual({ ok: true, returnPath: '/' });
  a.bar.hash = second;
  expect(await a.keys.receive()).toEqual({ ok: false, reason: 'no-request' });
  expect(replayed).not.toBe(second);

  // A page of the app that did not ask holds nothing to open an answer with.
  const stranger = appPage(journal.id, returnA, sub);
  stranger.bar.hash = second;
  expect(await stranger.keys.receive()).toEqual({ ok: false, reason: 'no-request' });

  // Another app gets its own key: an answer for it opens nothing for the first.
  const b = appPage(ledger.id, returnB, sub);
  b.bar.hash = await release(page, b, returnB);
  expect(await b.keys.receive()).toEqual({ ok: true, returnPath: '/' });
  expect(await appKeyRows(sub)).toEqual([journal.id, ledger.id].sort());

  // Core sends a key only to the app's own registered address: any other is the page that is not there, and nothing is sent.
  await a.keys.unlock();
  const elsewhere = new URL(a.bar.assigned);
  elsewhere.searchParams.set('return_to', returnB);
  const answer = await page.goto(elsewhere.toString());
  expect(answer?.status()).toBe(404);
  elsewhere.searchParams.set('return_to', returnA);
  elsewhere.searchParams.set('client_id', 'no-such-app');
  expect((await page.goto(elsewhere.toString()))?.status()).toBe(404);
  expect(page.url()).toContain('/keys/release');

  await joined.context.close();
});
