import { expect, test } from '@playwright/test';
import { person } from '../support/env';
import { verifyEmail } from '../support/database';
import { totpCode } from '../support/totp';
import { alert, enterCode, heading, join, signIn, signOut } from '../support/ui';
import { world } from '../support/world';

/** How long core's limit on checking codes remembers an attempt (ten seconds), with a margin. */
const LIMIT_WINDOW_MS = 10_500;

const owner = person('Olive');
const member = person('Uma');

test.describe.configure({ mode: 'serial' });

test('§3.17.5: a person enrols TOTP and a passkey, signs in with each, and recovers with a backup code; an operator’s reset removes both', async ({
  browser,
  page,
}) => {
  await signIn(page, owner);
  const uma = await join(browser, page, member);
  const her = uma.page;
  await verifyEmail(member.email);

  // Enrol an authenticator app: the key is shown, and nothing is on until a code from it is entered.
  await her.goto('/security/two-factor');
  await her.getByRole('button', { name: 'Turn on' }).click();
  await her.getByLabel('Password').fill(member.password);
  await her.getByRole('button', { name: 'Continue' }).click();
  const shown = await her.getByText(/Or type this key:/).innerText();
  const key = shown.replace('Or type this key:', '').trim();
  await her.getByLabel('Code from the app').fill('000000');
  await her.getByRole('button', { name: 'Turn on' }).click();
  await expect(alert(her)).toContainText('That code is not right');
  await her.getByLabel('Code from the app').fill(totpCode(key));
  await her.getByRole('button', { name: 'Turn on' }).click();
  await expect(her.getByRole('heading', { name: 'Your backup codes' })).toBeVisible();
  const codes = await her.locator('ul li').allInnerTexts();
  expect(codes.length).toBeGreaterThanOrEqual(5);
  world.set('backupCodes', codes);
  await her.getByRole('button', { name: 'I have saved them' }).click();
  await expect(her.getByRole('heading', { name: 'Two-factor sign-in is on' })).toBeVisible();

  // Add a passkey, on a device the browser makes up.
  const cdp = await uma.context.newCDPSession(her);
  await cdp.send('WebAuthn.enable');
  await cdp.send('WebAuthn.addVirtualAuthenticator', {
    options: {
      protocol: 'ctap2',
      transport: 'internal',
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  });
  await her.goto('/security/passkeys');
  await her.getByLabel('Name').fill('Test laptop');
  await her.getByRole('button', { name: 'Add a passkey' }).click();
  await expect(her.getByText('Test laptop')).toBeVisible();

  // Core allows three code checks in ten seconds, so a person who has just made two waits for the third.
  await her.waitForTimeout(LIMIT_WINDOW_MS);

  // Signing in with a password now asks for the code, and a wrong one is refused.
  await signOut(her);
  await her.getByLabel('Email').fill(member.email);
  await her.getByLabel('Password').fill(member.password);
  await her.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(her).toHaveURL(/\/sign-in\/two-factor/);
  await enterCode(her, '000000');
  await her.getByRole('button', { name: 'Verify' }).click();
  await expect(alert(her)).toBeVisible();
  await enterCode(her, totpCode(key));
  await her.getByRole('button', { name: 'Verify' }).click();
  await expect(heading(her)).toHaveText('Apps');

  // A passkey signs in on its own.
  await signOut(her);
  await her.getByRole('button', { name: 'Sign in with a passkey' }).click();
  await expect(heading(her)).toHaveText('Apps');

  // A backup code recovers an account whose app is lost, and works once.
  await signOut(her);
  await her.waitForTimeout(LIMIT_WINDOW_MS);
  const [spent, unspent] = codes as [string, string];
  const withBackupCode = async (code: string) => {
    await her.goto('/sign-in');
    await her.getByLabel('Email').fill(member.email);
    await her.getByLabel('Password').fill(member.password);
    await her.getByRole('button', { name: 'Sign in', exact: true }).click();
    await her.getByRole('button', { name: 'Use a backup code' }).click();
    await her.getByLabel('Backup code').fill(code);
    await her.getByRole('button', { name: 'Verify' }).click();
  };
  await withBackupCode(spent);
  await expect(heading(her)).toHaveText('Apps');
  await signOut(her);
  await withBackupCode(spent);
  await expect(alert(her)).toBeVisible();
  await expect(her).toHaveURL(/\/sign-in\/two-factor/);
  await withBackupCode(unspent);
  await expect(heading(her)).toHaveText('Apps');

  // An operator resets her second step, which removes the app and the passkey together.
  await page.goto('/console/accounts');
  await page.getByRole('link', { name: member.name }).click();
  await expect(page.getByText('On', { exact: true })).toBeVisible();
  await expect(page.getByText('1', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Reset two-factor sign-in' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Reset', exact: true }).click();
  await expect(page.getByText('Off', { exact: true })).toBeVisible();
  await expect(page.getByText('0', { exact: true })).toBeVisible();

  await signOut(her);
  await her.waitForTimeout(LIMIT_WINDOW_MS);
  await signIn(her, member);
  await expect(heading(her)).toHaveText('Apps');
  await her.goto('/security/two-factor');
  await expect(her.getByRole('heading', { name: 'Two-factor sign-in is off' })).toBeVisible();
  await her.goto('/security/passkeys');
  await expect(her.getByRole('heading', { name: 'You have no passkeys' })).toBeVisible();
  await uma.context.close();
  await signOut(page);
});
