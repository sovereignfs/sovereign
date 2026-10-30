import { describe, expect, it } from 'vitest';
import {
  ConfigurationError,
  NotAuthenticatedError,
  SignInError,
  createSovereign,
  hasRole,
} from '../index';
import { createFakeCore, memorySessionStore, type WrongLogoutToken } from '../testing';
import { checkedAgainstContract, clock, memoryStore } from './helpers';

type Options = {
  appUrl?: string;
  coreUrl?: string;
  scopes?: string[];
  sessionSeconds?: number;
};

function setup(options: Options = {}) {
  const time = clock();
  const core = createFakeCore({
    now: time.environment.now,
    url: options.coreUrl ?? 'https://core.test',
  });
  core.addPerson({ sub: 'u1', name: 'Ada Lovelace' });
  const sessions = memorySessionStore(time.environment.now);
  const tokens = memoryStore();
  const sv = createSovereign({
    appUrl: options.appUrl ?? 'https://notes.example.test',
    coreUrl: core.url,
    ...core.credentials,
    sessionStore: sessions,
    tokenStore: tokens.store,
    fetch: checkedAgainstContract(core.fetch),
    environment: time.environment,
    timeoutMs: 100,
    ...(options.scopes ? { scopes: options.scopes } : {}),
    ...(options.sessionSeconds ? { sessionSeconds: options.sessionSeconds } : {}),
  });
  return { time, core, sv, sessions, tokens };
}
type World = ReturnType<typeof setup>;

/** The cookies a browser would send back for the `Set-Cookie` values it was given. */
const cookieHeader = (setCookies: string[]) =>
  setCookies
    .filter((cookie) => !/Max-Age=0\b/.test(cookie))
    .map((cookie) => cookie.split(';')[0])
    .join('; ');

/** A person signs in: the whole round trip, as the browser would make it. */
async function signIn(
  world: World,
  sub = 'u1',
  options: { returnTo?: string; roles?: string[] } = {},
) {
  const begin = await world.sv.auth.beginSignIn(
    options.returnTo ? { returnTo: options.returnTo } : {},
  );
  const back = world.core.authorize(begin.url, sub, options.roles ? { roles: options.roles } : {});
  const done = await world.sv.auth.completeSignIn(
    new Request(back, { headers: { cookie: cookieHeader(begin.setCookies) } }),
  );
  return { begin, back, done, cookie: cookieHeader(done.setCookies) };
}

const withCookie = (cookie: string, url = 'https://notes.example.test/') =>
  new Request(url, { headers: { cookie } });

describe('signing in (sdk §9)', () => {
  it('signs a person in, searches the Directory as them, and signs out, with nothing but this package', async () => {
    const world = setup();
    const { done, cookie } = await signIn(world);
    expect(done.session).toMatchObject({
      sub: 'u1',
      claims: expect.objectContaining({ name: 'Ada Lovelace' }),
    });
    expect(done.session.scopes).toEqual(['openid', 'profile', 'email', 'offline_access']);

    const found = await world.sv.as({ sub: done.session.sub }).directory.searchUsers({ q: 'ada' });
    expect(found.users).toEqual([{ sub: 'u1', name: 'Ada Lovelace', picture: null }]);

    const out = await world.sv.auth.signOut(withCookie(cookie));
    expect(await world.sv.auth.getSession(withCookie(cookie))).toBeNull();
    expect(out.url).toContain('/api/auth/oauth2/end-session');
  });

  it('asks with PKCE S256, a state and a nonce, and the scopes the app chose', async () => {
    const { sv } = setup({ scopes: ['openid', 'email'] });
    const { url } = await sv.auth.beginSignIn();
    const params = new URL(url).searchParams;
    expect(url).toMatch(/^https:\/\/core\.test\/api\/auth\/oauth2\/authorize\?/);
    expect(params.get('code_challenge_method')).toBe('S256');
    expect(params.get('code_challenge')).toMatch(/^[\w-]{43}$/);
    expect(params.get('state')).toBeTruthy();
    expect(params.get('nonce')).toBeTruthy();
    expect(params.get('scope')).toBe('openid email');
    expect(params.get('redirect_uri')).toBe('https://notes.example.test/auth/callback');
    expect(params.get('client_id')).toBe('fake-app');
  });

  it('goes back to a path on the app, and never anywhere else', async () => {
    const world = setup();
    expect((await signIn(world, 'u1', { returnTo: '/notes/7?x=1' })).done.returnTo).toBe(
      '/notes/7?x=1',
    );
    for (const bad of ['//evil.test', 'https://evil.test/x', '/\\evil.test', 'evil', '/a\nb']) {
      expect((await signIn(world, 'u1', { returnTo: bad })).done.returnTo, bad).toBe('/');
    }
    expect((await signIn(world)).done.returnTo).toBe('/');
  });

  it('keeps the refresh token for the person, once, so the app can call core as them', async () => {
    const world = setup();
    await signIn(world);
    expect(world.tokens.writes).toHaveLength(1);
    expect(world.tokens.tokens.get('u1')).toBeTruthy();
  });

  it('refuses a callback with no sign-in in progress, a state that is not the one asked, and a code used twice', async () => {
    const world = setup();
    const begin = await world.sv.auth.beginSignIn();
    const back = world.core.authorize(begin.url, 'u1');
    const cookie = cookieHeader(begin.setCookies);

    await expect(world.sv.auth.completeSignIn(new Request(back))).rejects.toBeInstanceOf(
      SignInError,
    );

    const forged = new URL(back);
    forged.searchParams.set('state', 'another');
    await expect(
      world.sv.auth.completeSignIn(new Request(forged, { headers: { cookie } })),
    ).rejects.toBeInstanceOf(SignInError);

    // The pending record was used up by the attempt above: a callback can be used once.
    await expect(
      world.sv.auth.completeSignIn(new Request(back, { headers: { cookie } })),
    ).rejects.toBeInstanceOf(SignInError);
    expect(
      world.core.seen.requests.filter((r) => r.path === '/api/auth/oauth2/token'),
    ).toHaveLength(0);
  });

  it('refuses a callback that comes back after ten minutes', async () => {
    const world = setup();
    const begin = await world.sv.auth.beginSignIn();
    const back = world.core.authorize(begin.url, 'u1');
    world.time.advance(11 * 60_000);
    await expect(
      world.sv.auth.completeSignIn(
        new Request(back, { headers: { cookie: cookieHeader(begin.setCookies) } }),
      ),
    ).rejects.toBeInstanceOf(SignInError);
  });

  it('refuses a code core does not accept, as a sign-in error', async () => {
    const world = setup();
    const begin = await world.sv.auth.beginSignIn();
    const back = new URL(world.core.authorize(begin.url, 'u1'));
    back.searchParams.set('code', 'not-a-code');
    await expect(
      world.sv.auth.completeSignIn(
        new Request(back, { headers: { cookie: cookieHeader(begin.setCookies) } }),
      ),
    ).rejects.toBeInstanceOf(SignInError);
  });

  it('reads the app’s own address from the callback, not the one a proxy gave the request', async () => {
    const world = setup();
    const begin = await world.sv.auth.beginSignIn();
    const back = new URL(world.core.authorize(begin.url, 'u1'));
    const inside = new URL(`http://10.0.0.5:3000${back.pathname}${back.search}`);
    const done = await world.sv.auth.completeSignIn(
      new Request(inside, { headers: { cookie: cookieHeader(begin.setCookies) } }),
    );
    expect(done.session.sub).toBe('u1');
  });
});

describe('the session', () => {
  it('is host-only over https: __Host- prefix, Secure, HttpOnly, SameSite=Lax, Path=/ and no Domain', async () => {
    const world = setup();
    const begin = await world.sv.auth.beginSignIn();
    const pending = begin.setCookies[0] as string;
    expect(pending).toMatch(/^__Host-sv_signin=/);
    const { done } = await signIn(world);
    const session = done.setCookies.find((c) => c.startsWith('__Host-sv_session=')) as string;
    expect(session).toBeDefined();
    for (const cookie of [pending, session]) {
      expect(cookie).toContain('; Path=/');
      expect(cookie).toContain('; HttpOnly');
      expect(cookie).toContain('; Secure');
      expect(cookie).toContain('; SameSite=Lax');
      expect(cookie).not.toMatch(/Domain=/i);
    }
    // The sign-in cookie is cleared once the session exists.
    expect(done.setCookies.find((c) => c.startsWith('__Host-sv_signin='))).toMatch(/Max-Age=0/);
  });

  it('has no prefix and no Secure over http, which is a development instance', async () => {
    const world = setup({ appUrl: 'http://localhost:4000', coreUrl: 'http://core.test' });
    const { done } = await signIn(world);
    const session = done.setCookies.find((c) => c.startsWith('sv_session=')) as string;
    expect(session).toBeDefined();
    expect(session).not.toContain('Secure');
    expect(session).not.toMatch(/__Host-/);
  });

  it('makes no call to core to know who is signed in', async () => {
    const world = setup();
    const { cookie } = await signIn(world);
    const before = world.core.seen.requests.length;
    for (let i = 0; i < 5; i += 1) {
      expect((await world.sv.auth.getSession(withCookie(cookie)))?.sub).toBe('u1');
    }
    expect((await world.sv.auth.requireSession(withCookie(cookie))).sub).toBe('u1');
    expect(world.core.seen.requests.length).toBe(before);
  });

  it('is nobody without a cookie, with one that names nothing, or with one that has run out', async () => {
    const world = setup({ sessionSeconds: 3600 });
    const { cookie } = await signIn(world);
    expect(await world.sv.auth.getSession(new Request('https://notes.example.test/'))).toBeNull();
    expect(
      await world.sv.auth.getSession(withCookie('__Host-sv_session=no-such-session')),
    ).toBeNull();
    world.time.advance(3601_000);
    expect(await world.sv.auth.getSession(withCookie(cookie))).toBeNull();
  });

  it('is a NotAuthenticatedError when a session is required and there is none', async () => {
    const { sv } = setup();
    await expect(
      sv.auth.requireSession(new Request('https://notes.example.test/')),
    ).rejects.toBeInstanceOf(NotAuthenticatedError);
  });

  it('does not take a pending sign-in for a session', async () => {
    const world = setup();
    const begin = await world.sv.auth.beginSignIn();
    const id = (begin.setCookies[0] as string).split(';')[0]?.split('=')[1] as string;
    expect(await world.sv.auth.getSession(withCookie(`__Host-sv_session=${id}`))).toBeNull();
  });

  it('has the roles a trusted app was given, and none otherwise', async () => {
    const world = setup({ scopes: ['openid', 'profile', 'roles'] });
    const given = (await signIn(world, 'u1', { roles: ['platform:admin'] })).done.session;
    expect(given.roles).toEqual(['platform:admin']);
    expect(hasRole(given, 'platform:admin')).toBe(true);
    expect(hasRole(given, 'platform:owner')).toBe(false);

    const plain = setup();
    const none = (await signIn(plain, 'u1', { roles: ['platform:admin'] })).done.session;
    expect(none.roles).toEqual([]);
    expect(hasRole(none, 'platform:admin')).toBe(false);
  });
});

describe('signing out', () => {
  it('ends the app’s session, clears the cookie, and goes to core’s sign-out with the hint and the way back', async () => {
    const world = setup();
    const { cookie } = await signIn(world);
    const out = await world.sv.auth.signOut(withCookie(cookie));
    const url = new URL(out.url);
    expect(`${url.origin}${url.pathname}`).toBe('https://core.test/api/auth/oauth2/end-session');
    expect(url.searchParams.get('id_token_hint')).toBeTruthy();
    expect(url.searchParams.get('post_logout_redirect_uri')).toBe('https://notes.example.test/');
    expect(out.setCookies[0]).toMatch(/^__Host-sv_session=;.*Max-Age=0/);
    expect(await world.sv.auth.getSession(withCookie(cookie))).toBeNull();
  });

  it('goes back to the app when there was no session to end', async () => {
    const { sv } = setup();
    const out = await sv.auth.signOut(new Request('https://notes.example.test/'));
    expect(out.url).toBe('https://notes.example.test/');
    expect(out.setCookies).toHaveLength(1);
  });
});

describe('what the client offers', () => {
  it('has the addresses of core’s own pages', () => {
    const { sv } = setup();
    expect(sv.links).toEqual({
      profile: 'https://core.test/profile',
      security: 'https://core.test/security',
      preferences: 'https://core.test/preferences',
      connectedApps: 'https://core.test/connected-apps',
      deleteAccount: 'https://core.test/delete-account',
    });
  });

  it('needs a session store to sign people in, and says so', () => {
    const core = createFakeCore();
    const sv = createSovereign({
      appUrl: 'https://notes.example.test',
      coreUrl: core.url,
      ...core.credentials,
    });
    expect(() => sv.auth).toThrow(ConfigurationError);
  });
});

describe('a back-channel logout (sdk §9.1)', () => {
  const post = (token: string | undefined, method = 'POST') =>
    new Request('https://notes.example.test/auth/backchannel-logout', {
      method,
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      ...(method === 'POST'
        ? { body: new URLSearchParams(token ? { logout_token: token } : {}).toString() }
        : {}),
    });

  it('ends the session it names by sid, and only that one', async () => {
    const world = setup();
    const first = await signIn(world);
    const sid = world.core.sessionIdOf('u1') as string;
    const second = await signIn(world);
    expect(world.core.sessionIdOf('u1')).not.toBe(sid);
    const reply = await world.sv.auth.handleBackChannelLogout(
      post(await world.core.logoutToken({ sub: 'u1', sid })),
    );
    expect(reply.status).toBe(200);
    expect(reply.headers.get('cache-control')).toBe('no-store');
    expect(await world.sv.auth.getSession(withCookie(first.cookie))).toBeNull();
    expect((await world.sv.auth.getSession(withCookie(second.cookie)))?.sub).toBe('u1');
  });

  it('ends every session of a person when it names only the person', async () => {
    const world = setup();
    const first = await signIn(world);
    const second = await signIn(world);
    const reply = await world.sv.auth.handleBackChannelLogout(
      post(await world.core.logoutToken({ sub: 'u1' })),
    );
    expect(reply.status).toBe(200);
    expect(await world.sv.auth.getSession(withCookie(first.cookie))).toBeNull();
    expect(await world.sv.auth.getSession(withCookie(second.cookie))).toBeNull();
  });

  it('leaves another person’s sessions alone', async () => {
    const world = setup();
    world.core.addPerson({ sub: 'u2', name: 'Grace Hopper' });
    const one = await signIn(world, 'u1');
    const two = await signIn(world, 'u2');
    await world.sv.auth.handleBackChannelLogout(post(await world.core.logoutToken({ sub: 'u1' })));
    expect(await world.sv.auth.getSession(withCookie(one.cookie))).toBeNull();
    expect((await world.sv.auth.getSession(withCookie(two.cookie)))?.sub).toBe('u2');
  });

  const wrong: WrongLogoutToken[] = [
    'signature',
    'issuer',
    'audience',
    'expired',
    'future',
    'event',
    'nonce',
    'type',
    'no-subject',
    'no-jti',
  ];
  it.each(wrong)('refuses a logout token that is wrong in this way: %s', async (way) => {
    const world = setup();
    const { cookie } = await signIn(world);
    const token = await world.core.logoutToken(
      { sub: 'u1', sid: world.core.sessionIdOf('u1') as string },
      { wrong: way },
    );
    const reply = await world.sv.auth.handleBackChannelLogout(post(token));
    expect(reply.status).toBe(400);
    expect(await reply.json()).toEqual({ error: 'invalid_request' });
    // Nothing was ended.
    expect((await world.sv.auth.getSession(withCookie(cookie)))?.sub).toBe('u1');
  });

  it('refuses a token it has seen before, a missing token, junk, and anything but a POST', async () => {
    const world = setup();
    const { cookie } = await signIn(world);
    const token = await world.core.logoutToken({ sub: 'u1' });
    expect((await world.sv.auth.handleBackChannelLogout(post(token))).status).toBe(200);
    expect((await world.sv.auth.handleBackChannelLogout(post(token))).status).toBe(400);
    expect((await world.sv.auth.handleBackChannelLogout(post(undefined))).status).toBe(400);
    expect((await world.sv.auth.handleBackChannelLogout(post('not.a.jwt'))).status).toBe(400);
    expect((await world.sv.auth.handleBackChannelLogout(post(token, 'GET'))).status).toBe(400);
    expect(await world.sv.auth.getSession(withCookie(cookie))).toBeNull();
  });
});
