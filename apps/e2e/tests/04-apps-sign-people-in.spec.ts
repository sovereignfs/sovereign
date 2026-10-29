import { expect, test } from '@playwright/test';
import { configureRp, rpSeen } from '../support/apps';
import { registerApp } from '../support/console';
import { CORE_URL, MINIMAL_URL, RP_URL, person } from '../support/env';
import { signInMinimal } from '../support/minimal';
import { heading, newPerson, signIn, signOut } from '../support/ui';
import { world } from '../support/world';

const owner = person('Olive');
const member = person('Uma');

export type RegisteredApp = { id: string; secret: string | undefined };

test.describe.configure({ mode: 'serial' });

test('§3.17.6: an operator registers two apps, one an off-the-shelf OIDC client; both sign people in through core, appear in the launcher, and receive only the claims their scopes allow', async ({
  browser,
  page,
}) => {
  await signIn(page, owner);
  const notes = await registerApp(page, {
    name: 'Notes',
    launchUrl: RP_URL,
    redirectUri: `${RP_URL}/callback`,
    kind: 'confidential',
    scopes: ['profile', 'offline_access', 'directory'],
    postLogoutRedirectUri: `${RP_URL}/after-logout`,
    backchannelLogoutUri: `${RP_URL}/backchannel-logout`,
  });
  const minimal = await registerApp(page, {
    name: 'Minimal',
    launchUrl: MINIMAL_URL,
    redirectUri: `${MINIMAL_URL}/callback`,
    kind: 'public',
    scopes: ['email', 'roles'],
    trusted: true,
  });
  expect(notes.secret).toBeTruthy();
  expect(minimal.secret).toBeUndefined();
  world.set('notes', notes);
  world.set('minimal', minimal);
  await configureRp({ clientId: notes.id, clientSecret: notes.secret as string });

  // A person who can open apps finds both in the launcher.
  const uma = await newPerson(browser);
  await signIn(uma.page, member);
  await uma.page.goto('/');
  await expect(uma.page.getByRole('link', { name: /Notes/ })).toHaveAttribute('href', RP_URL);
  await expect(uma.page.getByRole('link', { name: /Minimal/ })).toHaveAttribute(
    'href',
    MINIMAL_URL,
  );

  // The off-the-shelf client: opened from its tile, it sends her through core, which asks her to allow it.
  await uma.page.getByRole('link', { name: /Notes/ }).click();
  await expect(heading(uma.page)).toHaveText('Allow access to your account?');
  await uma.page.getByRole('button', { name: 'Allow', exact: true }).click();
  await expect(uma.page.getByText('Notes: signed in')).toBeVisible();
  const seen = await rpSeen();
  expect(seen.error).toBeUndefined();
  // One request for the callback: an authorization code is used once, so asking twice fails the second.
  expect(seen.callbacks).toBe(1);
  // Only what `profile` allows: a name, and no email address and no role.
  expect(seen.claims).toMatchObject({ name: member.name, iss: CORE_URL });
  expect(seen.claims).not.toHaveProperty('email');
  expect(seen.claims).not.toHaveProperty('roles');
  expect(seen.userinfo).toMatchObject({ name: member.name });
  expect(seen.userinfo).not.toHaveProperty('email');
  expect(seen.refreshToken).toBeTruthy();

  // The second app uses no library: the plain requests of the code flow with PKCE, for a client with no secret.
  // It is trusted, so she is not asked about it: she goes straight back to it.
  const minimalSignIn = await signInMinimal(uma.page, minimal.id, 'openid email roles');
  expect(minimalSignIn.askedConsent).toBe(false);
  // Email and role, as its scopes allow; no name, which `profile` would have given.
  expect(minimalSignIn.claims).toMatchObject({ email: member.email, roles: ['platform:user'] });
  expect(minimalSignIn.claims).not.toHaveProperty('name');
  const userinfo = await fetch(minimalSignIn.userinfoEndpoint, {
    headers: { authorization: `Bearer ${minimalSignIn.accessToken}` },
  });
  expect(await userinfo.json()).toMatchObject({ email: member.email });

  await uma.context.close();
  await signOut(page);
});
