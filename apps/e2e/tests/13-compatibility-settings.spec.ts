import { expect, test } from '@playwright/test';
import { createRemoteJWKSet, decodeProtectedHeader, jwtVerify } from 'jose';
import { configureRp, rpSeen } from '../support/apps';
import { registerApp } from '../support/console';
import { CORE_URL, RP_URL, person } from '../support/env';
import { signIn, signOut } from '../support/ui';

const owner = person('Olive');

test('§3.7.1: an app set to send its secret in the body and to have its ID tokens signed as RS256 signs a person in, and the token verifies against the published RSA key', async ({
  page,
}) => {
  await signIn(page, owner);
  const legacy = await registerApp(page, {
    name: 'Legacy',
    launchUrl: RP_URL,
    redirectUri: `${RP_URL}/callback`,
    kind: 'confidential',
    scopes: ['profile', 'email'],
    trusted: true,
    secretIn: 'body',
    idTokenAlgorithm: 'RS256',
  });
  expect(legacy.secret).toBeTruthy();

  // The off-the-shelf client, told to send its secret in the body, as some libraries can do nothing else. Core
  // takes it only because the app was registered for that.
  await configureRp({
    clientId: legacy.id,
    clientSecret: legacy.secret as string,
    secretIn: 'body',
  });
  // A fresh sign-in, for what the app is allowed: the stub's own default asks for more than this app may have.
  await page.goto(`${RP_URL}/login?scope=${encodeURIComponent('openid profile email')}`);
  await expect(page.getByText('Notes: signed in')).toBeVisible();
  const seen = await rpSeen();
  expect(seen.error).toBeUndefined();
  expect(seen.claims).toMatchObject({ name: owner.name, iss: CORE_URL });

  // The ID token is RS256, and verifies as a relying party that reads only RSA keys would check it.
  const idToken = seen.idToken as string;
  expect(decodeProtectedHeader(idToken).alg).toBe('RS256');
  const jwks = (await (await fetch(`${CORE_URL}/api/auth/jwks`)).json()) as {
    keys: Record<string, unknown>[];
  };
  const rsa = jwks.keys.find((key) => key.kty === 'RSA');
  expect(rsa).toMatchObject({ alg: 'RS256', e: 'AQAB' });
  expect(rsa).not.toHaveProperty('crv');
  const { payload } = await jwtVerify(
    idToken,
    createRemoteJWKSet(new URL(`${CORE_URL}/api/auth/jwks`)),
    {
      issuer: CORE_URL,
      audience: legacy.id,
      algorithms: ['RS256'],
    },
  );
  expect(payload.at_hash).toBeTruthy();

  await signOut(page);
});
