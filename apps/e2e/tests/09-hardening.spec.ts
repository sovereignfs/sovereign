import { expect, test } from '@playwright/test';
import { CORE_URL, freshAddress, MINIMAL_URL, person } from '../support/env';
import { discovery } from '../support/minimal';
import { newPerson, signIn } from '../support/ui';
import { world } from '../support/world';

const member = person('Uma');
const EVIL = 'https://evil.example';

const get = (path: string, headers: Record<string, string> = {}) =>
  fetch(`${CORE_URL}${path}`, {
    redirect: 'manual',
    headers: { 'x-forwarded-for': freshAddress(), ...headers },
  });

/**
 * What the Phase 1 security review found worth keeping as tests: the properties an attacker would try first and
 * that a later change could lose without any feature test noticing.
 */
test('the policy and the hardening headers are on pages, routes and redirects, with no inline script allowed', async () => {
  for (const path of ['/sign-in', '/api/health', '/privacy', '/', '/console']) {
    const response = await get(path);
    const csp = response.headers.get('content-security-policy') ?? '';
    expect(csp, path).toMatch(/script-src [^;]*'nonce-[A-Za-z0-9+/=]+'/);
    expect(csp, path).not.toMatch(/script-src[^;]*'unsafe-inline'/);
    expect(csp, path).toContain("frame-ancestors 'none'");
    expect(response.headers.get('x-content-type-options'), path).toBe('nosniff');
    expect(response.headers.get('x-frame-options'), path).toBe('DENY');
    expect(response.headers.get('referrer-policy'), path).toBe('strict-origin-when-cross-origin');
    // Served over http here, where a browser would ignore this and later refuse http: never sent.
    expect(response.headers.get('strict-transport-security'), path).toBeNull();
  }
  // A page that is not signed in is sent to sign-in with 303, not 307, and carries the policy too.
  const redirect = await get('/console');
  expect(redirect.status).toBe(303);
  // No two responses share a nonce.
  const nonce = (csp: string | null) => /'nonce-([^']+)'/.exec(csp ?? '')?.[1];
  const first = nonce((await get('/sign-in')).headers.get('content-security-policy'));
  const second = nonce((await get('/sign-in')).headers.get('content-security-policy'));
  expect(first).toBeTruthy();
  expect(first).not.toBe(second);
});

test('a request from another site is refused by better-auth, and no origin may read the Core API', async () => {
  // The origin check is never off: a form posted from another site cannot sign anyone in or up.
  for (const path of ['/api/auth/sign-in/email', '/api/auth/sign-up/email']) {
    const response = await fetch(`${CORE_URL}${path}`, {
      method: 'POST',
      headers: {
        origin: EVIL,
        'content-type': 'application/json',
        'x-forwarded-for': freshAddress(),
      },
      body: JSON.stringify({ email: member.email, password: member.password, name: 'x' }),
    });
    expect(response.status, path).toBe(403);
  }
  // The Core API answers a caller of any origin with no permission to read it from a page.
  const api = await get('/api/v1/directory/users?q=a', { origin: EVIL });
  expect(api.status).toBe(401);
  expect(api.headers.get('access-control-allow-origin')).toBeNull();
  const preflight = await fetch(`${CORE_URL}/api/v1/directory/users?q=a`, {
    method: 'OPTIONS',
    headers: {
      origin: EVIL,
      'access-control-request-method': 'GET',
      'access-control-request-headers': 'authorization',
      'x-forwarded-for': freshAddress(),
    },
  });
  expect(preflight.headers.get('access-control-allow-origin')).toBeNull();
});

test('a sign-in that is sent on goes only to an address on core, never to another site', async ({
  browser,
}) => {
  for (const returnTo of [`${EVIL}/landing`, '//evil.example/landing', '/\\evil.example']) {
    const uma = await newPerson(browser);
    await signIn(uma.page, member, returnTo);
    expect(new URL(uma.page.url()).origin, returnTo).toBe(CORE_URL);
    await uma.context.close();
  }
});

test('the session cookie cannot be read by a script, and is not sent with a cross-site request', async ({
  browser,
}) => {
  const uma = await newPerson(browser);
  await signIn(uma.page, member);
  const cookies = await uma.context.cookies();
  const session = cookies.find((cookie) => cookie.name.endsWith('session_token'));
  expect(session).toBeDefined();
  expect(session?.httpOnly).toBe(true);
  expect(session?.sameSite).toBe('Lax');
  // Nothing core sets is readable by a script.
  expect(await uma.page.evaluate(() => document.cookie)).toBe('');
  await uma.context.close();
});

test('an app is sent back only to an address registered for it, and only with PKCE', async ({
  browser,
}) => {
  const notes = world.get<{ id: string }>('notes');
  const metadata = await discovery();
  const uma = await newPerson(browser);
  await signIn(uma.page, member);
  const authorize = (params: Record<string, string>) => {
    const url = new URL(metadata.authorization_endpoint);
    url.search = new URLSearchParams({
      client_id: notes.id,
      response_type: 'code',
      scope: 'openid profile',
      state: 's',
      ...params,
    }).toString();
    return uma.context.request.get(url.href, { maxRedirects: 0 });
  };
  const challenge = {
    code_challenge: 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
    code_challenge_method: 'S256',
  };
  const sentTo = (response: Awaited<ReturnType<typeof authorize>>) =>
    response.headers()['location'] ?? '';

  // An address that is not the registered one is never followed, with or without the rest being right.
  for (const redirect_uri of [
    `${EVIL}/callback`,
    `${MINIMAL_URL}/callback`,
    'http://localhost:3101/callback/',
  ]) {
    const response = await authorize({ redirect_uri, ...challenge });
    expect(sentTo(response), redirect_uri).not.toContain('code=');
    expect(sentTo(response), redirect_uri).not.toMatch(/^https:\/\/evil\.example/);
    expect(sentTo(response), redirect_uri).not.toMatch(/^http:\/\/localhost:3102/);
  }
  // Without a code challenge nothing is issued, even to a confidential app that could keep a secret.
  const noPkce = await authorize({ redirect_uri: 'http://localhost:3101/callback' });
  expect(sentTo(noPkce)).not.toContain('code=');
  expect(sentTo(noPkce) + (await noPkce.text())).toMatch(/error|invalid|pkce|challenge/i);
  // A code challenge that is not S256 is not accepted either.
  const plain = await authorize({
    redirect_uri: 'http://localhost:3101/callback',
    code_challenge: 'plain-text-challenge-that-is-long-enough-to-pass-length-checks',
    code_challenge_method: 'plain',
  });
  expect(sentTo(plain)).not.toContain('code=');
  await uma.context.close();
});

test('nobody can register an app by calling the provider, signed in or not', async ({
  browser,
}) => {
  const body = JSON.stringify({
    redirect_uris: [`${EVIL}/callback`],
    client_name: 'Not allowed',
    token_endpoint_auth_method: 'none',
  });
  const headers = { origin: CORE_URL, 'content-type': 'application/json' };
  const anonymous = await fetch(`${CORE_URL}/api/auth/oauth2/register`, {
    method: 'POST',
    headers: { ...headers, 'x-forwarded-for': freshAddress() },
    body,
  });
  expect(anonymous.status).toBeGreaterThanOrEqual(400);

  const uma = await newPerson(browser);
  await signIn(uma.page, member);
  const signedIn = await uma.context.request.post(`${CORE_URL}/api/auth/oauth2/register`, {
    headers,
    data: body,
  });
  expect(signedIn.status()).toBeGreaterThanOrEqual(400);
  await uma.context.close();
});

test('the typeface is Hanken Grotesk, served by core itself, and no page asks another site for anything', async ({
  page,
}) => {
  const requested: string[] = [];
  page.on('request', (request) => requested.push(request.url()));
  await page.goto('/sign-in');
  const loaded = await page.evaluate(async () => {
    await document.fonts.ready;
    return [...document.fonts]
      .filter((face) => face.status === 'loaded')
      .map((face) => face.family);
  });
  expect(loaded).toContain('Hanken Grotesk');
  const families = await page.evaluate(() =>
    ['body', 'h1', 'input', 'button'].map((selector) =>
      getComputedStyle(document.querySelector(selector) as Element).fontFamily.replace(/"/g, "'"),
    ),
  );
  for (const family of families) {
    expect(family).toBe(
      "'Hanken Grotesk', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    );
  }
  expect(requested.some((url) => /hanken-grotesk.*\.woff2/.test(url))).toBe(true);
  // Every request, the font's included, went to core: nothing here tells another site who is reading.
  expect(requested.filter((url) => !url.startsWith(CORE_URL) && !url.startsWith('data:'))).toEqual(
    [],
  );
});
