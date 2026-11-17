import { expect, test, type Page } from '@playwright/test';
import { openDatabase } from '../support/database';
import { person } from '../support/env';
import { join, newPerson, signIn, signOut } from '../support/ui';

const owner = person('Olive');
const keeper = person('Kristin');

/** Whether this browser keeps an unlocked account key for its session (core-app §5.4), read from core's own IndexedDB. */
const keepsKey = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<boolean>((resolve) => {
        const request = indexedDB.open('sovereign-keys', 1);
        request.onupgradeneeded = () => request.result.createObjectStore('keys');
        request.onsuccess = () => {
          const read = request.result.transaction('keys').objectStore('keys').get('account');
          read.onsuccess = () => resolve(read.result !== undefined);
          read.onerror = () => resolve(false);
        };
        request.onerror = () => resolve(false);
      }),
  );

async function vaultOf(email: string) {
  const database = await openDatabase();
  try {
    const user = (await database.run('select id from users where email = ?', [email])).rows[0];
    const accounts = await database.run(
      'select kit_confirmed from key_accounts where user_id = ?',
      [user?.id],
    );
    const wraps = await database.run('select way from key_wraps where user_id = ?', [user?.id]);
    return { accounts: accounts.rows, ways: wraps.rows.map((row) => String(row.way)) };
  } finally {
    await database.close();
  }
}

/**
 * Keys are set up silently at the first sign-in and opened by the password on any browser (core-app §5.3, §5.4). The server keeps
 * one account and one way in by the password, with the kit not yet confirmed; each browser keeps the key it opened, for its session.
 */
test('§5.10.2: a person’s keys are set up silently, and a second browser is unlocked by the password alone', async ({
  browser,
}) => {
  const operator = await newPerson(browser);
  await signIn(operator.page, owner, '/console/invites');
  const joined = await join(browser, operator.page, keeper);
  await operator.context.close();

  // Signing up opened a session at once: the keys are made then, and this browser keeps them.
  await expect.poll(async () => (await vaultOf(keeper.email)).accounts.length).toBe(1);
  expect(await vaultOf(keeper.email)).toEqual({
    accounts: [expect.objectContaining({ kit_confirmed: expect.anything() })],
    ways: ['password'],
  });
  expect(Number((await vaultOf(keeper.email)).accounts[0]?.kit_confirmed)).toBe(0);
  expect(await keepsKey(joined.page)).toBe(true);
  await joined.context.close();

  // Another browser, the password alone: unlocked, and nothing new is made.
  const second = await newPerson(browser);
  await signIn(second.page, keeper);
  await expect.poll(() => keepsKey(second.page)).toBe(true);
  expect((await vaultOf(keeper.email)).ways).toEqual(['password']);

  // Signing out forgets it.
  await signOut(second.page);
  await expect(second.page).toHaveURL(/\/sign-in/);
  expect(await keepsKey(second.page)).toBe(false);
  await second.context.close();
});

/** A device the browser makes up, which answers the PRF extension or does not. */
async function addDevice(page: Page, prf: boolean) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('WebAuthn.enable');
  const { authenticatorId } = await cdp.send('WebAuthn.addVirtualAuthenticator', {
    options: {
      protocol: 'ctap2',
      ctap2Version: 'ctap2_1',
      transport: 'internal',
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
      hasPrf: prf,
    },
  });
  return () => cdp.send('WebAuthn.removeVirtualAuthenticator', { authenticatorId });
}

/**
 * A passkey that unlocks opens the keys with the touch that signs in; one that cannot still signs in, and opens nothing (core-app §5.5).
 * The PRF output never reaches the server: better-auth's client leaves the extension's results out of what it sends.
 */
test('§5.10.2: a passkey that unlocks opens the keys with the same touch, and one that cannot still signs in', async ({
  browser,
}) => {
  const operator = await newPerson(browser);
  await signIn(operator.page, owner, '/console/invites');
  const lender = person('Lena');
  const joined = await join(browser, operator.page, lender);
  await operator.context.close();
  const page = joined.page;
  await expect.poll(() => keepsKey(page)).toBe(true);

  const bodies: string[] = [];
  page.on('request', (request) => {
    const body = request.postData();
    if (body) bodies.push(body);
  });

  // Added while this browser is unlocked: it gets its way in.
  const removeDevice = await addDevice(page, true);
  await page.goto('/security/passkeys');
  await page.getByLabel('Name').fill('Phone');
  await page.getByRole('button', { name: 'Add a passkey' }).click();
  await expect(page.getByText(/Also unlocks your encrypted data/)).toBeVisible();
  expect((await vaultOf(lender.email)).ways.sort()).toEqual(['passkey', 'password']);

  // Signing out forgets the key; the passkey alone opens it again.
  await signOut(page);
  expect(await keepsKey(page)).toBe(false);
  await page.getByRole('button', { name: 'Sign in with a passkey' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Apps');
  await expect.poll(() => keepsKey(page)).toBe(true);

  // A device that cannot answer the extension: its passkey signs in, and the browser stays locked, with no error.
  await removeDevice();
  await addDevice(page, false);
  await page.goto('/security/passkeys');
  await page.getByLabel('Name').fill('Key');
  await page.getByRole('button', { name: 'Add a passkey' }).click();
  await expect(page.getByText(/Doesn’t unlock your encrypted data/)).toBeVisible();
  await signOut(page);
  await page.getByRole('button', { name: 'Sign in with a passkey' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Apps');
  expect(await keepsKey(page)).toBe(false);

  // No request carried an extension's results.
  expect(bodies.length).toBeGreaterThan(0);
  for (const body of bodies) {
    expect(body).not.toContain('clientExtensionResults');
    expect(body).not.toMatch(/"results"\s*:/);
  }
  await joined.context.close();
});
