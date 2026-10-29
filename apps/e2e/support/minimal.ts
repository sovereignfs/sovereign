import { createHash, randomBytes } from 'node:crypto';
import type { Page } from '@playwright/test';
import { decodeJwt, type JWTPayload } from 'jose';
import { CORE_URL, freshAddress, MINIMAL_URL } from './env';

type Metadata = {
  authorization_endpoint: string;
  token_endpoint: string;
  userinfo_endpoint: string;
};

export const discovery = async (): Promise<Metadata> =>
  (await (await fetch(`${CORE_URL}/.well-known/openid-configuration`)).json()) as Metadata;

const base64url = (bytes: Buffer) => bytes.toString('base64url');

export type MinimalSignIn = {
  /** Whether core asked the person whether to allow the app, on the way. */
  askedConsent: boolean;
  claims: JWTPayload;
  accessToken: string;
  userinfoEndpoint: string;
};

/**
 * What an app that uses no library does: the plain requests of the code flow with PKCE, for a public client (no
 * secret). The browser is sent to the authorization endpoint, comes back to the app's address with a code, and the
 * code is exchanged for tokens. If core asks whether to allow the app, the answer is yes, and the result says it asked.
 */
export async function signInMinimal(
  page: Page,
  clientId: string,
  scope: string,
): Promise<MinimalSignIn> {
  const metadata = await discovery();
  const verifier = base64url(randomBytes(32));
  const authorize = new URL(metadata.authorization_endpoint);
  authorize.search = new URLSearchParams({
    client_id: clientId,
    redirect_uri: `${MINIMAL_URL}/callback`,
    response_type: 'code',
    scope,
    state: 'minimal-state',
    code_challenge: base64url(createHash('sha256').update(verifier).digest()),
    code_challenge_method: 'S256',
  }).toString();
  await page.goto(authorize.href);

  let askedConsent = false;
  await page.waitForURL((url) => url.origin === MINIMAL_URL || url.pathname === '/consent');
  if (page.url().startsWith(`${CORE_URL}/consent`)) {
    askedConsent = true;
    await page.getByRole('button', { name: 'Allow', exact: true }).click();
    await page.waitForURL((url) => url.origin === MINIMAL_URL);
  }
  const back = new URL(page.url());
  if (back.searchParams.get('state') !== 'minimal-state' || !back.searchParams.get('code')) {
    throw new Error(`The app was not sent back with a code: ${back.href}`);
  }
  const response = await fetch(metadata.token_endpoint, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      'x-forwarded-for': freshAddress(),
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code: back.searchParams.get('code') as string,
      redirect_uri: `${MINIMAL_URL}/callback`,
      client_id: clientId,
      code_verifier: verifier,
    }),
  });
  if (response.status !== 200) {
    throw new Error(`The token endpoint answered ${response.status}: ${await response.text()}`);
  }
  const tokens = (await response.json()) as { id_token: string; access_token: string };
  return {
    askedConsent,
    claims: decodeJwt(tokens.id_token),
    accessToken: tokens.access_token,
    userinfoEndpoint: metadata.userinfo_endpoint,
  };
}
