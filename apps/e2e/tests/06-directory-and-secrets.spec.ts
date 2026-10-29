import { expect, test } from '@playwright/test';
import { configureRp, rpApi, rpSeen } from '../support/apps';
import { CORE_URL, freshAddress, pastTheSecond, RP_URL, person } from '../support/env';
import { newPerson, signIn } from '../support/ui';
import { world } from '../support/world';

const owner = person('Olive');
const member = person('Uma');
const admin = person('Ada');

const API = `${CORE_URL}/api/v1/directory`;
const call = (path: string, token: string | undefined, init: RequestInit = {}) =>
  fetch(`${API}${path}`, {
    ...init,
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      'content-type': 'application/json',
    },
  });

test.describe.configure({ mode: 'serial' });

test('§3.17.9: an app with the directory scope searches by name, resolves by sub and finds an exact email, and cannot list addresses; a revoked token is refused', async ({
  browser,
}) => {
  const uma = await newPerson(browser);
  await signIn(uma.page, member);
  await uma.page.goto(`${RP_URL}/login`);
  await expect(uma.page.getByText('Notes: signed in')).toBeVisible();

  // A token for the Core API is asked for with the refresh token, since one asked for in the sign-in has no ID token.
  expect(await rpApi('/api/directory-token')).toMatchObject({ ok: true, scope: 'directory' });
  const { directoryToken, accessToken } = await rpSeen();
  expect(directoryToken).toBeTruthy();

  // Search matches names: a person comes back as their `sub`, name and picture, and nothing else.
  const search = await call('/users?q=ad', directoryToken);
  expect(search.status).toBe(200);
  const { users } = (await search.json()) as { users: Record<string, unknown>[] };
  expect(users).toHaveLength(1);
  expect(users[0]).toEqual({ sub: expect.any(String), name: admin.name, picture: null });
  const ada = users[0] as { sub: string };

  // Resolve by `sub`, in the order asked, with whether each account is active.
  const resolved = await call('/users/resolve', directoryToken, {
    method: 'POST',
    body: JSON.stringify({ subs: [ada.sub, (await rpSeen()).claims?.sub] }),
  });
  expect(resolved.status).toBe(200);
  expect(await resolved.json()).toEqual({
    users: [
      { sub: ada.sub, name: admin.name, picture: null, active: true },
      { sub: (await rpSeen()).claims?.sub, name: member.name, picture: null, active: true },
    ],
  });

  // An exact address finds the person; part of one, or a pattern, finds nobody.
  const exact = await call(
    `/users/by-email?email=${encodeURIComponent(admin.email.toUpperCase())}`,
    directoryToken,
  );
  expect(exact.status).toBe(200);
  expect(await exact.json()).toEqual({ sub: ada.sub, name: admin.name, picture: null });
  for (const email of ['ada@example', '@example.test', 'ada%', '%@example.test']) {
    const partial = await call(
      `/users/by-email?email=${encodeURIComponent(email)}`,
      directoryToken,
    );
    expect(partial.status, email).toBe(404);
  }

  // Addresses cannot be listed: a search by any part of one, or by a pattern, finds nobody, and there is no listing.
  for (const q of ['example.test', 'ada@example.test', '@', '%']) {
    const found = await call(`/users?q=${encodeURIComponent(q)}`, directoryToken);
    expect(((await found.json()) as { users: unknown[] }).users, q).toEqual([]);
  }
  expect((await call('/users', directoryToken)).status).toBe(400);
  expect(JSON.stringify(users)).not.toContain('@');

  // Only a token for the API works there: the access token from signing in is opaque and refused.
  expect((await call('/users?q=ad', accessToken)).status).toBe(401);
  expect((await call('/users?q=ad', undefined)).status).toBe(401);

  // A token is refused once its access is removed, though its signature is good and it has not expired.
  expect((await call('/users?q=ad', directoryToken)).status).toBe(200);
  await uma.page.goto('/connected-apps');
  await uma.page
    .getByRole('listitem')
    .filter({ hasText: 'Notes' })
    .getByRole('button', { name: 'Remove access' })
    .click();
  await uma.page.getByRole('dialog').getByRole('button', { name: 'Remove access' }).click();
  await expect(uma.page.getByRole('listitem').filter({ hasText: 'Notes' })).toHaveCount(0);
  expect((await call('/users?q=ad', directoryToken)).status).toBe(401);

  await pastTheSecond();
  // Notes asks again, for what follows.
  await uma.page.goto(`${RP_URL}/login`);
  await uma.page.getByRole('button', { name: 'Allow', exact: true }).click();
  await expect(uma.page.getByText('Notes: signed in')).toBeVisible();
  await uma.context.close();
});

test('§3.17.11: rotating an app’s secret makes the old secret fail at once', async ({ page }) => {
  const notes = world.get<{ id: string; secret: string }>('notes');
  const { refreshToken } = await rpSeen();
  expect(refreshToken).toBeTruthy();
  const tokenEndpoint = `${CORE_URL}/api/auth/oauth2/token`;
  const refresh = (secret: string, token: string) =>
    fetch(tokenEndpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        'x-forwarded-for': freshAddress(),
        authorization: `Basic ${Buffer.from(`${encodeURIComponent(notes.id)}:${encodeURIComponent(secret)}`).toString('base64')}`,
      },
      body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: token }),
    });

  // The secret it has works.
  const before = await refresh(notes.secret, refreshToken as string);
  expect(before.status).toBe(200);
  const rotated = ((await before.json()) as { refresh_token: string }).refresh_token;

  await signIn(page, owner, `/console/apps/${notes.id}`);
  await page.getByRole('button', { name: 'Make a new secret' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Make a new secret' }).click();
  await expect(page.getByText('Copy secret')).toBeVisible();
  const codes = await page.locator('code').allInnerTexts();
  const fresh = codes.find((code) => code !== notes.id && code !== notes.secret);
  expect(fresh).toBeTruthy();

  // The old secret fails at once, as a client that cannot be authenticated; the new one works.
  const stale = await refresh(notes.secret, rotated);
  expect(stale.status).toBe(401);
  expect(await stale.json()).toMatchObject({ error: 'invalid_client' });
  const current = await refresh(fresh as string, rotated);
  expect(current.status).toBe(200);

  // The relying party is given the new secret, so what follows can use it.
  world.set('notes', { id: notes.id, secret: fresh });
  await configureRp({ clientId: notes.id, clientSecret: fresh as string });
});
