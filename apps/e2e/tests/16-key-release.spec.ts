import { expect, test } from '@playwright/test';
import { registerApp } from '../support/console';
import { openDatabase } from '../support/database';
import { appPage, myKeysOf, release, subOf } from '../support/keys';
import { MINIMAL_URL, person } from '../support/env';
import { join, newPerson, signIn } from '../support/ui';

const owner = person('Olive');

/**
 * The ids of the apps that hold a key for the person, sorted here: an `order by` would sort in the database's collation, which on
 * PostgreSQL (en_US) is not JavaScript's code-unit order, so random ids that differ in case came back in another order.
 */
async function appKeyRows(sub: string): Promise<string[]> {
  const database = await openDatabase();
  try {
    return (await database.run('select client_id from key_apps where user_id = ?', [sub])).rows
      .map((row) => String(row.client_id))
      .sort();
  } finally {
    await database.close();
  }
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

  // The first release makes the app's keys.
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

/**
 * Sharing (core-app §5.7, RFC 0005 §3.1): with the keys core's pages made for three people, the first shares a document key with the
 * second, who opens it; the third cannot; a public key the server changed is refused in the browser.
 */
test('§5.10.6: a person shares a document with a second, who opens it; a third cannot; a public key the server changed is refused', async ({
  browser,
}) => {
  const operator = await newPerson(browser);
  await signIn(operator.page, owner, '/console/apps');
  const returnTo = `${MINIMAL_URL}/keys/album`;
  const album = await registerApp(operator.page, {
    name: 'Album',
    launchUrl: `${MINIMAL_URL}/album`,
    redirectUri: `${MINIMAL_URL}/album/callback`,
    kind: 'public',
    scopes: [],
    keyReturnUri: returnTo,
  });

  // Each person opens the app once, which is when core makes their keys for it, and their page gets the app key.
  const opened = [];
  for (const name of ['Sana', 'Tomas', 'Uri']) {
    const who = person(name);
    const joined = await join(browser, operator.page, who);
    const sub = await subOf(who.email);
    const page = appPage(album.id, returnTo, sub);
    page.bar.hash = await release(joined.page, page, returnTo);
    expect((await page.keys.receive()).ok).toBe(true);
    const key = await page.keys.open();
    if (key.state !== 'open') throw new Error('locked');
    const identity = await page.keys.identity(key.key, await myKeysOf(sub, album.id));
    if (!identity.ok) throw new Error(identity.reason);
    opened.push({ sub, page, identity: identity.identity, keys: await myKeysOf(sub, album.id) });
    await joined.context.close();
  }
  await operator.context.close();
  const [sana, tomas, uri] = opened as [
    (typeof opened)[number],
    (typeof opened)[number],
    (typeof opened)[number],
  ];

  // Sana shares with Tomas, having checked his keys.
  const toTomas = await sana.page.keys.checkPerson(tomas.keys);
  if (!toTomas.ok) throw new Error(toTomas.reason);
  const documentKey = sana.page.keys.newDocumentKey();
  const record = await sana.page.keys.share({
    documentKey,
    documentId: 'photo-1',
    to: toTomas.person,
    identity: sana.identity,
  });

  // Tomas opens it.
  const fromSana = await tomas.page.keys.checkPerson(sana.keys);
  if (!fromSana.ok) throw new Error(fromSana.reason);
  expect(
    await tomas.page.keys.openShared({
      record,
      documentId: 'photo-1',
      me: tomas.keys,
      from: fromSana.person,
      identity: tomas.identity,
    }),
  ).toEqual(documentKey);

  // Uri, who was not shared with, cannot.
  const uriFromSana = await uri.page.keys.checkPerson(sana.keys);
  if (!uriFromSana.ok) throw new Error(uriFromSana.reason);
  await expect(
    uri.page.keys.openShared({
      record,
      documentId: 'photo-1',
      me: uri.keys,
      from: uriFromSana.person,
      identity: uri.identity,
    }),
  ).rejects.toThrow();

  // A server that gives Uri's receiving key as Tomas's is refused before anything is sealed to it.
  expect(
    await sana.page.keys.checkPerson({ ...tomas.keys, receivingKey: uri.keys.receivingKey }),
  ).toEqual({
    ok: false,
    reason: 'signature',
  });
});
