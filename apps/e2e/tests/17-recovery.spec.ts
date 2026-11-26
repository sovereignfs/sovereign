import { randomBytes } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';
import {
  appKeyData,
  formatEscrowKey,
  generateReceivingKey,
  importWrappingKey,
  openEscrowWrap,
  publicKeyBytes,
  unwrapSecret,
} from '@sovereignfs/crypto/web';
import { registerApp } from '../support/console';
import { openDatabase } from '../support/database';
import { MINIMAL_URL, person } from '../support/env';
import { join, newPerson, signIn, signOut } from '../support/ui';

const owner = person('Olive');

async function query(sql: string, args: unknown[] = []) {
  const database = await openDatabase();
  try {
    return (await database.run(sql, args)).rows;
  } finally {
    await database.close();
  }
}

const subOf = async (email: string) =>
  String((await query('select id from users where email = ?', [email]))[0]?.id);

/** A reset link, made as `sovereign-admin accounts reset-link` makes one. */
async function resetLinkFor(email: string): Promise<string> {
  const token = randomBytes(18).toString('base64url');
  const database = await openDatabase();
  try {
    const now = Date.now();
    const at = (ms: number) => (database.family === 'postgres' ? new Date(ms) : ms);
    await database.run(
      'insert into verifications (id, identifier, value, expires_at, created_at, updated_at) values (?, ?, ?, ?, ?, ?)',
      [
        `v-${token}`,
        `reset-password:${token}`,
        await subOf(email),
        at(now + 3_600_000),
        at(now),
        at(now),
      ],
    );
  } finally {
    await database.close();
  }
  return `/reset-password?token=${encodeURIComponent(token)}`;
}

/** Sends the browser to core's release for an app, as an app's page would, with a request of its own. */
async function openApp(page: Page, clientId: string, returnTo: string) {
  const pair = await generateReceivingKey();
  const query = new URLSearchParams({
    client_id: clientId,
    return_to: returnTo,
    request: Buffer.from(await publicKeyBytes(pair.publicKey)).toString('base64url'),
    state: randomBytes(16).toString('base64url'),
  });
  await page.goto(`/keys/release?${query.toString()}`, { referer: `${new URL(returnTo).origin}/` });
}

const backAt = (page: Page, returnTo: string) =>
  page.waitForURL((url) => url.href.startsWith(`${returnTo}#`), { timeout: 15_000 });

async function registerEncryptedApp(page: Page, name: string) {
  const returnTo = `${MINIMAL_URL}/keys/${name.toLowerCase()}`;
  const app = await registerApp(page, {
    name,
    launchUrl: `${MINIMAL_URL}/${name.toLowerCase()}`,
    redirectUri: `${MINIMAL_URL}/${name.toLowerCase()}/callback`,
    kind: 'public',
    scopes: [],
    keyReturnUri: returnTo,
  });
  return { id: app.id, returnTo };
}

/**
 * A reset gives back the account and not the data; the kit gives back the data (core-app §5.3): after the reset the new password opens
 * nothing, the kit opens it, and from then on the new password unlocks again.
 */
test('§5.10.3: a reset by email gives back the account and not the data; the kit gives back the data', async ({
  browser,
}) => {
  const operator = await newPerson(browser);
  await signIn(operator.page, owner, '/console/apps');
  const app = await registerEncryptedApp(operator.page, 'Diary');
  const writer = person('Wren');
  const joined = await join(browser, operator.page, writer);
  await operator.context.close();
  const { page, kit } = joined;

  // The kit was kept at sign-up, so the first encrypted app shows none.
  await openApp(page, app.id, app.returnTo);
  await backAt(page, app.returnTo);

  // A reset: a new password, and the browser forgets what it held.
  await page.goto('/');
  await signOut(page);
  const fresh = 'Reset-Password-7Kd';
  await page.goto(await resetLinkFor(writer.email));
  await page.getByLabel('New password', { exact: true }).fill(fresh);
  await page.getByLabel('Confirm new password').fill(fresh);
  await page.getByRole('button', { name: 'Set new password' }).click();
  await expect(page).toHaveURL(/\/sign-in/);
  await signIn(page, { ...writer, password: fresh });

  // The account is back; the data is not: the new password does not unlock.
  await openApp(page, app.id, app.returnTo);
  await expect(page.getByRole('button', { name: 'Use your recovery kit' })).toBeVisible();
  await page.getByLabel('Password', { exact: true }).fill(fresh);
  await page.getByRole('button', { name: 'Unlock', exact: true }).click();
  await expect(page.getByText('That password doesn’t unlock your encrypted data')).toBeVisible();

  // The kit does, and gives the new password its way in.
  await page.getByRole('button', { name: 'Use your recovery kit' }).click();
  await page.getByLabel('Recovery kit').fill(kit.toLowerCase());
  await page.getByLabel('Password', { exact: true }).fill(fresh);
  const unlocked = backAt(page, app.returnTo);
  await page.getByRole('button', { name: 'Unlock', exact: true }).click();
  await unlocked;

  // From then on, the new password alone unlocks a browser that holds nothing.
  await page.goto('/');
  await signOut(page);
  await signIn(page, { ...writer, password: fresh });
  await openApp(page, app.id, app.returnTo);
  await backAt(page, app.returnTo);
  await joined.context.close();
});

/**
 * Escrow (core-app §5.8): with it off, no account has an escrow way in; the owner turns it on, a person is told before they are covered,
 * and the owner's key, offline, opens their account key.
 */
test('§5.10.7: with escrow on, the owner recovers a person’s data offline; with it off, no account has an escrow way in', async ({
  browser,
}) => {
  const operator = await newPerson(browser);
  await signIn(operator.page, owner, '/console/apps');
  const app = await registerEncryptedApp(operator.page, 'Vault');
  expect(await query("select 1 from key_wraps where way = 'escrow'")).toEqual([]);

  // The escrow key, made where sv key escrow makes it: here, never on the server.
  const pair = await generateReceivingKey();
  const publicKey = await publicKeyBytes(pair.publicKey);
  const line = await formatEscrowKey(publicKey);
  await operator.page.goto('/console/settings');
  await operator.page.getByLabel('Recovery key').fill(line);
  await operator.page.getByRole('button', { name: 'Turn recovery on' }).click();
  await expect(operator.page.getByText('Recovery is on.', { exact: false }).first()).toBeVisible();

  const keeper = person('Yara');
  const joined = await join(browser, operator.page, keeper);
  const page = joined.page;
  const sub = await subOf(keeper.email);
  await openApp(page, app.id, app.returnTo);
  const back = backAt(page, app.returnTo);
  // Told before covered: nothing is added until the person continues.
  await expect(page.getByText(/has turned on recovery/)).toBeVisible();
  expect(
    await query("select 1 from key_wraps where way = 'escrow' and user_id = ?", [sub]),
  ).toEqual([]);
  await page.getByRole('button', { name: 'Continue' }).click();
  await back;

  // The owner, offline: the escrow way in opens the account key, which opens the app key core keeps for the person.
  const [escrow] = await query(
    "select wrap_id, record from key_wraps where way = 'escrow' and user_id = ?",
    [sub],
  );
  const accountKey = await openEscrowWrap({
    record: JSON.parse(String(escrow?.record)),
    sub,
    escrowKeyId: String(escrow?.wrap_id),
    escrow: { privateKey: pair.privateKey, publicKey },
  });
  const [appRow] = await query('select app_key from key_apps where user_id = ? and client_id = ?', [
    sub,
    app.id,
  ]);
  const appKey = await unwrapSecret(
    await importWrappingKey(accountKey),
    JSON.parse(String(appRow?.app_key)),
    appKeyData(sub, app.id),
  );
  expect(appKey).toHaveLength(32);

  // Turned off again: the Console says so, and what was covered stays covered.
  await operator.page.goto('/console/settings');
  await operator.page.getByRole('button', { name: 'Turn recovery off' }).click();
  await expect(operator.page.getByText(/Recovery is off/).first()).toBeVisible();
  expect(
    await query("select 1 from key_wraps where way = 'escrow' and user_id = ?", [sub]),
  ).toHaveLength(1);
  await operator.context.close();
  await joined.context.close();
});
