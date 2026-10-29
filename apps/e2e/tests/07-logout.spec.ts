import { expect, test } from '@playwright/test';
import { rpApi, rpLogoutTokens, rpSeen } from '../support/apps';
import { CORE_URL, RP_URL, person } from '../support/env';
import { heading, newPerson, signIn, signOut } from '../support/ui';
import { world } from '../support/world';

const member = person('Uma');

test.describe.configure({ mode: 'serial' });

test('§3.17.10: signing out of core sends a back-channel notice and revokes that session’s tokens; an end-session request returns only to a registered address', async ({
  browser,
}) => {
  const notes = world.get<{ id: string }>('notes');
  const uma = await newPerson(browser);
  await signIn(uma.page, member);
  await uma.page.goto(`${RP_URL}/login`);
  await expect(uma.page.getByText('Notes: signed in')).toBeVisible();
  expect(await rpApi('/api/directory-token')).toMatchObject({ ok: true });
  const before = await rpSeen();
  expect(before.logoutTokens).toHaveLength(0);
  expect(await rpApi('/api/userinfo')).toMatchObject({ ok: true });

  // Signing out of core.
  await signOut(uma.page);

  // Notes is told, with a notice it can check: signed by core, for this app, this person and this session.
  const after = await rpLogoutTokens(1);
  expect(after.logoutError).toBeUndefined();
  expect(after.logoutTokens[0]).toMatchObject({
    iss: CORE_URL,
    aud: notes.id,
    sub: before.claims?.sub,
    sid: expect.any(String),
    events: { 'http://schemas.openid.net/event/backchannel-logout': {} },
  });
  expect(after.logoutTokens[0]).not.toHaveProperty('nonce');

  // And what that session was given stops working: the token for the app and the one for the Core API.
  expect(await rpApi('/api/userinfo')).toMatchObject({ ok: false });
  const api = await fetch(`${CORE_URL}/api/v1/directory/users?q=uma`, {
    headers: { authorization: `Bearer ${before.directoryToken}` },
  });
  expect(api.status).toBe(401);

  // An app that ends the session itself is sent back to a registered address, with its own state.
  await signIn(uma.page, member);
  await uma.page.goto(`${RP_URL}/login`);
  await expect(uma.page.getByText('Notes: signed in')).toBeVisible();
  await uma.page.goto(`${RP_URL}/logout`);
  await expect(uma.page).toHaveURL(`${RP_URL}/after-logout?state=goodbye`);
  await expect(uma.page.getByText('Notes: signed out')).toBeVisible();
  // Her session with core ended too.
  await uma.page.goto('/');
  await expect(heading(uma.page)).toHaveText('Sign in');

  // An address that is not registered is never followed, whatever the app asks for.
  await signIn(uma.page, member);
  await uma.page.goto(`${RP_URL}/login`);
  await expect(uma.page.getByText('Notes: signed in')).toBeVisible();
  await uma.page.goto(`${RP_URL}/logout?to=${encodeURIComponent('https://evil.example/landing')}`);
  expect(new URL(uma.page.url()).origin).toBe(CORE_URL);
  await expect(uma.page.getByText(/post-logout redirect was not registered/)).toBeVisible();
  await uma.context.close();
});
