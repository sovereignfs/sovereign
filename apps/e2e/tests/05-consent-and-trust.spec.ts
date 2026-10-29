import { expect, test, type Page } from '@playwright/test';
import { rpApi, rpSeen } from '../support/apps';
import { pastTheSecond, RP_URL, person } from '../support/env';
import { signInMinimal } from '../support/minimal';
import { heading, newPerson, signIn } from '../support/ui';
import { world } from '../support/world';

const member = person('Uma');

test.describe.configure({ mode: 'serial' });

/** The app asks to sign her in again; she answers the question if there is one, and says which. */
async function signInToNotes(page: Page, query = ''): Promise<{ askedConsent: boolean }> {
  await page.goto(`${RP_URL}/login${query}`);
  await page.waitForURL((url) => url.origin === RP_URL || url.pathname === '/consent');
  let askedConsent = false;
  if (new URL(page.url()).pathname === '/consent') {
    askedConsent = true;
    await page.getByRole('button', { name: 'Allow', exact: true }).click();
  }
  await expect(heading(page).or(page.getByText('Notes: signed in'))).toBeVisible();
  await expect(page.getByText('Notes: signed in')).toBeVisible();
  return { askedConsent };
}

test('§3.17.7: an untrusted app asks once; removing its access revokes its tokens and the next sign-in asks again; only a trusted app is given roles', async ({
  browser,
}) => {
  const uma = await newPerson(browser);
  await signIn(uma.page, member);

  // She allowed Notes before, so signing in to it again does not ask.
  expect((await signInToNotes(uma.page)).askedConsent).toBe(false);

  // The role is for a trusted app: asking for it as an untrusted one gives nothing of it.
  const asked = await signInToNotes(
    uma.page,
    `?scope=${encodeURIComponent('openid profile roles')}`,
  );
  void asked;
  const withRoles = await rpSeen();
  expect(withRoles.claims).not.toHaveProperty('roles');
  expect(withRoles.userinfo).not.toHaveProperty('roles');
  expect(withRoles.scope ?? '').not.toContain('roles');
  // The trusted app, with the same person, is.
  const minimal = world.get<{ id: string }>('minimal');
  const trusted = await signInMinimal(uma.page, minimal.id, 'openid roles');
  expect(trusted.askedConsent).toBe(false);
  expect(trusted.claims).toMatchObject({ roles: ['platform:user'] });

  // Notes is in her connected apps. Its tokens work until she removes its access.
  await signInToNotes(uma.page);
  expect(await rpApi('/api/userinfo')).toMatchObject({ ok: true });
  expect(await rpApi('/api/refresh')).toMatchObject({ ok: true });
  await uma.page.goto('/connected-apps');
  const tile = uma.page.getByRole('listitem').filter({ hasText: 'Notes' });
  await expect(tile).toBeVisible();
  await tile.getByRole('button', { name: 'Remove access' }).click();
  await uma.page.getByRole('dialog').getByRole('button', { name: 'Remove access' }).click();
  await expect(uma.page.getByRole('listitem').filter({ hasText: 'Notes' })).toHaveCount(0);

  await pastTheSecond();
  // Everything Notes held stops working at once, the access token and the refresh token alike.
  expect(await rpApi('/api/userinfo')).toMatchObject({ ok: false });
  expect(await rpApi('/api/refresh')).toMatchObject({ ok: false });

  // The next sign-in to it asks again.
  expect((await signInToNotes(uma.page)).askedConsent).toBe(true);
  await uma.context.close();
});
