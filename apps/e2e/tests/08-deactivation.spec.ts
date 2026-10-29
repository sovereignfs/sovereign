import { expect, test } from '@playwright/test';
import { rpApi, rpSeen } from '../support/apps';
import { CORE_URL, RP_URL, person } from '../support/env';
import { alert, heading, newPerson, signIn } from '../support/ui';

const owner = person('Olive');
const member = person('Uma');

test.describe.configure({ mode: 'serial' });

test('§3.17.8: deactivating an account ends its sessions and every token issued for it stops working, including a refresh token from offline_access', async ({
  browser,
  page,
}) => {
  // Uma is signed in at core and to Notes, with every kind of token an app can hold for her.
  const uma = await newPerson(browser);
  await signIn(uma.page, member);
  await uma.page.goto(`${RP_URL}/login`);
  await expect(uma.page.getByText('Notes: signed in')).toBeVisible();
  const issued = await rpApi('/api/directory-token');
  expect(issued, JSON.stringify(issued)).toMatchObject({ ok: true });
  const held = await rpSeen();
  expect(held.refreshToken).toBeTruthy();
  const api = (token: string | undefined) =>
    fetch(`${CORE_URL}/api/v1/directory/users?q=uma`, {
      headers: { authorization: `Bearer ${token}` },
    });
  expect((await api(held.directoryToken)).status).toBe(200);
  expect(await rpApi('/api/userinfo')).toMatchObject({ ok: true });

  // An operator deactivates her.
  await signIn(page, owner, '/console/accounts');
  await page.getByRole('link', { name: member.name }).click();
  await page.getByRole('button', { name: 'Deactivate' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Deactivate' }).click();
  await expect(page.getByText('Deactivated', { exact: true }).first()).toBeVisible();

  // Her session at core is over, at once.
  await uma.page.goto('/');
  await expect(heading(uma.page)).toHaveText('Sign in');
  // Everything an app was given for her stops working: access, refresh (with offline_access), and the Core API.
  expect(await rpApi('/api/userinfo')).toMatchObject({ ok: false });
  expect(await rpApi('/api/refresh')).toMatchObject({ ok: false });
  expect(await rpApi('/api/directory-token')).toMatchObject({ ok: false });
  expect((await api(held.directoryToken)).status).toBe(401);
  // And she cannot sign in again, by any way, until an operator allows it.
  await uma.page.goto('/sign-in');
  await uma.page.getByLabel('Email').fill(member.email);
  await uma.page.getByLabel('Password').fill(member.password);
  await uma.page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(alert(uma.page)).toContainText(/deactivated/i);

  // Reactivating lets her sign in; it does not bring back what was revoked.
  await page.getByRole('button', { name: 'Reactivate' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Reactivate' }).click();
  await expect(page.getByText('Active', { exact: true }).first()).toBeVisible();
  expect((await api(held.directoryToken)).status).toBe(401);
  expect(await rpApi('/api/refresh')).toMatchObject({ ok: false });
  await signIn(uma.page, member);
  await expect(heading(uma.page)).toHaveText('Apps');
  await uma.context.close();
});
