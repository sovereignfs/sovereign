import { expect, test } from '@playwright/test';
import { CORE_URL, person } from '../support/env';
import { alert, freshAddress, heading, newPerson, signIn, signOut, signUp } from '../support/ui';
import { world } from '../support/world';

const owner = person('Olive');
const admin = person('Ada');
const stranger = person('Sam');

test.describe.configure({ mode: 'serial' });

test('§3.17.2: the first account signs up and becomes the owner', async ({ page }) => {
  world.reset();
  await signUp(page, owner);
  // Signed in: the launcher is the home page.
  await expect(heading(page)).toHaveText('Apps');
  // The owner can enter the Console, and is listed as the owner.
  await page.goto('/console/accounts');
  const row = page.getByRole('row', { name: new RegExp(owner.email) });
  await expect(row).toContainText('Owner');
});

test('§3.17.3: the owner turns invite-only on, invites a person, and makes them an admin; an uninvited sign-up is refused', async ({
  page,
  browser,
}) => {
  await signIn(page, owner, '/console/settings');
  const inviteOnly = page.getByRole('checkbox', { name: 'Only people I invite can sign up' });
  await expect(inviteOnly).toBeChecked();
  // Saving it makes it the instance's own choice, not just the server's default.
  await page.getByRole('button', { name: 'Save', exact: true }).first().click();
  await expect(page.getByText('Only people you invite can sign up.')).toBeVisible();

  // Invite someone. Email is not set up here, so the Console hands over the link.
  await page.goto('/console/invites');
  await page.getByLabel('Email address').fill(admin.email);
  await page.getByRole('button', { name: 'Invite' }).click();
  const link = await page.locator('code').filter({ hasText: '/invite/' }).first().innerText();
  expect(link).toContain(`${CORE_URL}/invite/`);

  // The invited person arrives from the link, with their address filled in, and signs up.
  const invited = await newPerson(browser);
  await invited.page.goto(link);
  await expect(invited.page).toHaveURL(/\/sign-up/);
  await expect(invited.page.getByLabel('Email')).toHaveValue(admin.email);
  await signUp(invited.page, admin, invited.page.url());
  await expect(heading(invited.page)).toHaveText('Apps');
  await invited.context.close();

  // Someone nobody invited is refused by the server, and told so, not let in.
  const uninvited = await newPerson(browser);
  await signUp(uninvited.page, stranger);
  await expect(alert(uninvited.page)).toContainText(/invit/i);
  await expect(uninvited.page).toHaveURL(/\/sign-up/);
  const direct = await uninvited.context.request.post(`${CORE_URL}/api/auth/sign-up/email`, {
    headers: { origin: CORE_URL, 'x-forwarded-for': freshAddress() },
    data: {
      name: stranger.name,
      email: stranger.email,
      password: stranger.password,
      agreedToTerms: true,
    },
  });
  expect(direct.status()).toBe(422);
  expect(await direct.json()).toMatchObject({ code: 'INVITE_REQUIRED' });
  await uninvited.context.close();

  // The owner makes the invited person an admin.
  await page.goto('/console/accounts');
  await page.getByRole('link', { name: admin.name }).click();
  await page.getByLabel('Role').selectOption('platform:admin');
  await page.getByRole('button', { name: 'Change role' }).click();
  await expect(page.getByText('The role is changed.')).toBeVisible();
  world.set('adminAccountUrl', page.url());
});

test('§3.17.4: the owner edits the capability matrix, and no admin can change their own or another operator’s role or capabilities', async ({
  page,
  browser,
}) => {
  await signIn(page, owner, '/console/permissions');
  // Take "Manage apps" away from admins and save.
  const row = page.getByRole('listitem').filter({ hasText: 'Manage apps' });
  await row.getByLabel('Admins').uncheck();
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByText(/One change is saved/)).toBeVisible();

  const operator = await newPerson(browser);
  await signIn(operator.page, admin);
  // The change is theirs at once: the Apps section is gone and its page is not there.
  await operator.page.goto('/console');
  await expect(operator.page.getByRole('link', { name: 'Apps' })).toHaveCount(0);
  expect((await operator.page.goto('/console/apps'))?.status()).toBe(404);

  // An admin has neither the matrix nor ownership, and cannot see anyone's role to change.
  for (const path of ['/console/permissions', '/console/ownership']) {
    expect((await operator.page.goto(path))?.status(), path).toBe(404);
  }
  await operator.page.goto(world.get<string>('adminAccountUrl'));
  await expect(operator.page.getByLabel('Role')).toHaveCount(0);
  await operator.page.goto('/console/accounts');
  await operator.page.getByRole('link', { name: owner.name }).click();
  await expect(operator.page.getByLabel('Role')).toHaveCount(0);
  await expect(operator.page.getByRole('button', { name: 'Delete account' })).toHaveCount(0);
  await expect(operator.page.getByRole('button', { name: 'Deactivate' })).toHaveCount(0);

  // The server holds the rule, not only the page: a request made by hand is refused.
  const refused = await operator.context.request.post(`${CORE_URL}/console/permissions`, {
    headers: { 'next-action': 'x', origin: CORE_URL, 'content-type': 'text/plain' },
    data: '[]',
  });
  expect(refused.status()).toBeGreaterThanOrEqual(400);
  await operator.context.close();

  // Put the matrix back for the steps that follow.
  await page.goto('/console/permissions');
  await page.getByRole('listitem').filter({ hasText: 'Manage apps' }).getByLabel('Admins').check();
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByText(/One change is saved/)).toBeVisible();
  await signOut(page);
});
