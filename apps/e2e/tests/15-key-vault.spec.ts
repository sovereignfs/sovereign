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
