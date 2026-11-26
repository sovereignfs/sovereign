import { expect, test, type Browser, type Page } from '@playwright/test';
import { openDatabase } from '../support/database';
import { MINIMAL_URL, person } from '../support/env';
import { registerApp } from '../support/console';
import { signInMinimal } from '../support/minimal';
import { heading, invite, join, keepKit, newPerson, signIn, signOut, signUp } from '../support/ui';

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

/** Someone invited who signs up and leaves on the recovery kit, without keeping it. Signed in, their kit still to keep. */
async function signUpWithoutKit(browser: Browser, who: ReturnType<typeof person>) {
  const operator = await newPerson(browser);
  await signIn(operator.page, owner, '/console/invites');
  const link = await invite(operator.page, who.email);
  await operator.context.close();
  const joining = await newPerson(browser);
  await joining.page.goto(link);
  await signUp(joining.page, who, joining.page.url());
  await expect(joining.page.getByRole('checkbox', { name: /kept my recovery kit/ })).toBeVisible();
  return joining;
}

const kitConfirmed = async (email: string) =>
  Number((await vaultOf(email)).accounts[0]?.kit_confirmed);

/**
 * Keys are set up at sign-up and opened by the password on any browser (core-app §5.3, §5.4). A new account is shown its recovery
 * kit, and so is every sign-in with the password until it is kept; only then does the server keep the kit's way in.
 */
test('§5.10.2: the recovery kit is asked for at sign-up and again at sign-in until it is kept, and the password alone unlocks a second browser', async ({
  browser,
}) => {
  const joined = await signUpWithoutKit(browser, keeper);
  await expect(joined.page).toHaveURL(/\/keys\/kit/);
  // The keys were made, and this browser keeps them; nothing is a kit's way in until the person says they kept it.
  expect(await vaultOf(keeper.email)).toEqual({
    accounts: [expect.objectContaining({ kit_confirmed: expect.anything() })],
    ways: ['password'],
  });
  expect(await kitConfirmed(keeper.email)).toBe(0);
  expect(await keepsKey(joined.page)).toBe(true);
  await joined.context.close();

  // Another browser, the password alone: unlocked, shown the kit again, and sent on once it is kept.
  const second = await newPerson(browser);
  await signIn(second.page, keeper);
  await keepKit(second.page);
  await expect(heading(second.page)).toHaveText('Apps');
  expect(await keepsKey(second.page)).toBe(true);
  expect((await vaultOf(keeper.email)).ways.sort()).toEqual(['kit', 'password']);
  expect(await kitConfirmed(keeper.email)).toBe(1);

  // Signing out forgets the key. Signing in again asks nothing more.
  await signOut(second.page);
  await expect(second.page).toHaveURL(/\/sign-in/);
  expect(await keepsKey(second.page)).toBe(false);
  await signIn(second.page, keeper);
  await expect(heading(second.page)).toHaveText('Apps');
  await second.context.close();
});

/** The Security page offers the kit to someone who has not kept it, and says once they have (core-app §5.3). */
test('§5.10.2: the Security page offers the recovery kit to someone who has not kept it', async ({
  browser,
}) => {
  const joined = await signUpWithoutKit(browser, person('Sefa'));
  await joined.page.goto('/security');
  await joined.page.getByRole('link', { name: 'Keep your recovery kit' }).click();
  await keepKit(joined.page);
  await expect(joined.page).toHaveURL(/\/security$/);
  await expect(joined.page.getByText('You’ve kept your recovery kit.')).toBeVisible();
  await expect(joined.page.getByRole('link', { name: 'Keep your recovery kit' })).toHaveCount(0);
  await joined.context.close();
});

/** An app's sign-in passes through the kit and still ends in the app, with a code that works (core-app §5.3). */
test('§5.10.2: a sign-in an app asked for shows the recovery kit, then goes back to the app', async ({
  browser,
}) => {
  const operator = await newPerson(browser);
  await signIn(operator.page, owner, '/console/apps');
  const app = await registerApp(operator.page, {
    name: 'Pantry',
    launchUrl: `${MINIMAL_URL}/pantry`,
    redirectUri: `${MINIMAL_URL}/callback`,
    kind: 'public',
    scopes: ['email'],
  });
  await operator.context.close();
  const visitor = person('Vera');
  await (await signUpWithoutKit(browser, visitor)).context.close();

  const { context, page } = await newPerson(browser);
  const signedIn = await signInMinimal(page, app.id, 'openid email', async () => {
    await page.getByLabel('Email').fill(visitor.email);
    await page.getByLabel('Password').fill(visitor.password);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await keepKit(page);
  });
  expect(signedIn.claims.email).toBe(visitor.email);
  expect(await kitConfirmed(visitor.email)).toBe(1);
  await context.close();
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
  expect((await vaultOf(lender.email)).ways.sort()).toEqual(['kit', 'passkey', 'password']);

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

/** A passkey that cannot unlock signs in without being held up by a kit it could not keep (core-app §5.3, §5.5). */
test('§5.10.2: a sign-in that leaves the browser locked is not held up by the recovery kit', async ({
  browser,
}) => {
  const who = person('Pia');
  const joined = await signUpWithoutKit(browser, who);
  const page = joined.page;
  await addDevice(page, false);
  await page.goto('/security/passkeys');
  await page.getByLabel('Name').fill('Key');
  await page.getByRole('button', { name: 'Add a passkey' }).click();
  await expect(page.getByText(/Doesn’t unlock your encrypted data/)).toBeVisible();
  await signOut(page);
  await page.getByRole('button', { name: 'Sign in with a passkey' }).click();
  await expect(heading(page)).toHaveText('Apps');
  expect(await keepsKey(page)).toBe(false);
  expect(await kitConfirmed(who.email)).toBe(0);
  await joined.context.close();
});
