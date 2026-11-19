import { describe, expect, it } from 'vitest';
import {
  ConfigurationError,
  NotAuthenticatedError,
  SessionEndedError,
  SignInError,
  createSovereign,
  hasRole,
} from '../index';
import { createFakeCore, memorySessionStore, type WrongLogoutToken } from '../testing';
import { checkedAgainstContract, clock, memoryStore } from './helpers';

type Options = {
  deletes?: boolean;
  appUrl?: string;
  coreUrl?: string;
  scopes?: string[];
  sessionSeconds?: number;
  checkEverySeconds?: number;
};

function setup(options: Options = {}) {
  const time = clock();
  const core = createFakeCore({
    now: time.environment.now,
    url: options.coreUrl ?? 'https://core.test',
  });
  core.addPerson({ sub: 'u1', name: 'Ada Lovelace' });
  const sessions = memorySessionStore(time.environment.now);
  const tokens = memoryStore(options.deletes ? { deletes: true } : {});
  const sv = createSovereign({
    appUrl: options.appUrl ?? 'https://notes.sovereign.local',
    coreUrl: core.url,
    ...core.credentials,
    sessionStore: sessions,
    tokenStore: tokens.store,
    fetch: checkedAgainstContract(core.fetch),
    environment: time.environment,
    timeoutMs: 100,
    ...(options.scopes ? { scopes: options.scopes } : {}),
    ...(options.sessionSeconds ? { sessionSeconds: options.sessionSeconds } : {}),
    ...(options.checkEverySeconds === undefined
      ? {}
      : { checkEverySeconds: options.checkEverySeconds }),
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

const withCookie = (cookie: string, url = 'https://notes.sovereign.local/') =>
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
    expect(params.get('redirect_uri')).toBe('https://notes.sovereign.local/auth/callback');
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

  it('waits an hour for the callback, as long as core’s emailed links last, and refuses one later', async () => {
    const world = setup();
    // The person makes an account and verifies it by email on the way: the code comes back 50 minutes on.
    const slow = await world.sv.auth.beginSignIn();
    world.time.advance(50 * 60_000);
    const back = world.core.authorize(slow.url, 'u1');
    const done = await world.sv.auth.completeSignIn(
      new Request(back, { headers: { cookie: cookieHeader(slow.setCookies) } }),
    );
    expect(done.session.sub).toBe('u1');
    expect(slow.setCookies[0]).toContain('Max-Age=3600');

    const late = await world.sv.auth.beginSignIn();
    world.time.advance(61 * 60_000);
    const lateBack = world.core.authorize(late.url, 'u1');
    await expect(
      world.sv.auth.completeSignIn(
        new Request(lateBack, { headers: { cookie: cookieHeader(late.setCookies) } }),
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

describe('asking core for a fresh sign-in (sdk §9.6)', () => {
  /** A round trip that asks with `options`, the person having signed in at core at `authTime`. */
  async function signInAsking(
    world: World,
    options: { prompt?: 'login' | 'none'; maxAgeSeconds?: number },
    authTime?: number,
  ) {
    const begin = await world.sv.auth.beginSignIn(options);
    const back = world.core.authorize(begin.url, 'u1', authTime === undefined ? {} : { authTime });
    return world.sv.auth.completeSignIn(
      new Request(back, { headers: { cookie: cookieHeader(begin.setCookies) } }),
    );
  }

  it('asks core with `prompt` and `max_age` when told to, and with neither otherwise', async () => {
    const { sv } = setup();
    const asked = new URL((await sv.auth.beginSignIn({ prompt: 'login', maxAgeSeconds: 300 })).url);
    expect(asked.searchParams.get('prompt')).toBe('login');
    expect(asked.searchParams.get('max_age')).toBe('300');
    const plain = new URL((await sv.auth.beginSignIn()).url);
    expect(plain.searchParams.has('prompt')).toBe(false);
    expect(plain.searchParams.has('max_age')).toBe(false);
  });

  it('refuses an age that is not a whole number of seconds', async () => {
    const { sv } = setup();
    for (const bad of [-1, 1.5, Number.NaN]) {
      await expect(sv.auth.beginSignIn({ maxAgeSeconds: bad })).rejects.toBeInstanceOf(TypeError);
    }
  });

  it('keeps when the person signed in at core on the session', async () => {
    const world = setup();
    const at = world.time.environment.now() - 60_000;
    const done = await signInAsking(world, {}, at);
    expect(done.session.authTime).toBe(Math.floor(at / 1000) * 1000);
  });

  it('accepts a sign-in within the age asked for', async () => {
    const world = setup();
    const done = await signInAsking(
      world,
      { maxAgeSeconds: 300 },
      world.time.environment.now() - 60_000,
    );
    expect(done.session.sub).toBe('u1');
  });

  it('refuses a sign-in older than the age asked for, whatever core answered', async () => {
    const world = setup();
    await expect(
      signInAsking(world, { maxAgeSeconds: 300 }, world.time.environment.now() - 600_000),
    ).rejects.toBeInstanceOf(SignInError);
  });
});

describe('checking a session against core (sdk §9.7)', () => {
  /** The browser comes back through core with `prompt=none`, holding its session cookie: core still knows the person. */
  async function check(world: World, cookie: string, sub = 'u1') {
    const begin = await world.sv.auth.beginSignIn({ prompt: 'none', returnTo: '/notes' });
    const back = world.core.authorize(begin.url, sub);
    return world.sv.auth.completeSignIn(
      new Request(back, { headers: { cookie: `${cookie}; ${cookieHeader(begin.setCookies)}` } }),
    );
  }

  it('is never due when the client does not check', async () => {
    const world = setup();
    const { done } = await signIn(world);
    world.time.advance(10 * 24 * 60 * 60 * 1000);
    expect(world.sv.auth.needsCheck(done.session)).toBe(false);
  });

  it('is due once the interval has passed since sign-in, and not before', async () => {
    const world = setup({ checkEverySeconds: 3600 });
    const { done } = await signIn(world);
    expect(done.session.checkedAt).toBe(world.time.environment.now());
    world.time.advance(3600 * 1000);
    expect(world.sv.auth.needsCheck(done.session)).toBe(false);
    world.time.advance(1);
    expect(world.sv.auth.needsCheck(done.session)).toBe(true);
  });

  it('renews the session in place when core still knows the person: the same cookie, the same key secret, new claims', async () => {
    const world = setup({ checkEverySeconds: 3600 });
    const first = await signIn(world);
    const secret = await world.sv.auth.keySecret(withCookie(first.cookie));
    world.core.addPerson({ sub: 'u1', name: 'Ada King' });
    world.time.advance(2 * 3600 * 1000);
    const renewed = await check(world, first.cookie);
    expect(cookieHeader(renewed.setCookies)).toBe(first.cookie);
    expect(renewed.returnTo).toBe('/notes');
    const session = await world.sv.auth.getSession(withCookie(first.cookie));
    expect(session?.claims.name).toBe('Ada King');
    expect(session?.checkedAt).toBe(world.time.environment.now());
    expect(world.sv.auth.needsCheck(session as NonNullable<typeof session>)).toBe(false);
    expect(await world.sv.auth.keySecret(withCookie(first.cookie))).toEqual(secret);
  });

  it('ends the session when core says the person must sign in, and says where they were going', async () => {
    const world = setup({ checkEverySeconds: 3600 });
    const { cookie } = await signIn(world);
    const begin = await world.sv.auth.beginSignIn({ prompt: 'none', returnTo: '/notes' });
    const back = world.core.loginRequired(begin.url);
    const failure = await world.sv.auth
      .completeSignIn(
        new Request(back, { headers: { cookie: `${cookie}; ${cookieHeader(begin.setCookies)}` } }),
      )
      .catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(SignInError);
    expect(failure).toMatchObject({ reason: 'login_required', returnTo: '/notes' });
    expect(await world.sv.auth.getSession(withCookie(cookie))).toBeNull();
  });

  it('gives another person who signs in on the same browser a session of their own, and ends the first', async () => {
    const world = setup({ checkEverySeconds: 3600 });
    world.core.addPerson({ sub: 'u2', name: 'Bo Barnes' });
    const first = await signIn(world);
    await world.sv.auth.keySecret(withCookie(first.cookie));
    const other = await check(world, first.cookie, 'u2');
    expect(cookieHeader(other.setCookies)).not.toBe(first.cookie);
    expect(await world.sv.auth.getSession(withCookie(first.cookie))).toBeNull();
    expect((await world.sv.auth.getSession(withCookie(cookieHeader(other.setCookies))))?.sub).toBe(
      'u2',
    );
  });

  it('refuses an interval that is not a whole number of seconds, 1 or more', () => {
    for (const bad of [0, -5, 1.5]) {
      expect(() => setup({ checkEverySeconds: bad }).sv.auth).toThrow(ConfigurationError);
    }
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
    expect(
      await world.sv.auth.getSession(new Request('https://notes.sovereign.local/')),
    ).toBeNull();
    expect(
      await world.sv.auth.getSession(withCookie('__Host-sv_session=no-such-session')),
    ).toBeNull();
    world.time.advance(3601_000);
    expect(await world.sv.auth.getSession(withCookie(cookie))).toBeNull();
  });

  it('is a NotAuthenticatedError when a session is required and there is none', async () => {
    const { sv } = setup();
    await expect(
      sv.auth.requireSession(new Request('https://notes.sovereign.local/')),
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
    expect(url.searchParams.get('post_logout_redirect_uri')).toBe('https://notes.sovereign.local/');
    expect(out.setCookies[0]).toMatch(/^__Host-sv_session=;.*Max-Age=0/);
    expect(await world.sv.auth.getSession(withCookie(cookie))).toBeNull();
  });

  it('goes back to the app when there was no session to end', async () => {
    const { sv } = setup();
    const out = await sv.auth.signOut(new Request('https://notes.sovereign.local/'));
    expect(out.url).toBe('https://notes.sovereign.local/');
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
      appUrl: 'https://notes.sovereign.local',
      coreUrl: core.url,
      ...core.credentials,
    });
    expect(() => sv.auth).toThrow(ConfigurationError);
  });
});

describe('a back-channel logout (sdk §9.1)', () => {
  const post = (token: string | undefined, method = 'POST') =>
    new Request('https://notes.sovereign.local/auth/backchannel-logout', {
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

  it('forgets the person’s refresh token when it names only the person, and keeps it for one sid', async () => {
    const world = setup({ deletes: true });
    await signIn(world);
    const sid = world.core.sessionIdOf('u1') as string;
    await world.sv.auth.handleBackChannelLogout(
      post(await world.core.logoutToken({ sub: 'u1', sid })),
    );
    expect(world.tokens.tokens.get('u1')).toBeTruthy();
    await world.sv.auth.handleBackChannelLogout(post(await world.core.logoutToken({ sub: 'u1' })));
    expect(world.tokens.tokens.has('u1')).toBe(false);
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

describe('an account-deleted notice (sdk §9.1, core-app §4.5)', () => {
  const post = (token: string | undefined, method = 'POST') =>
    new Request('https://notes.sovereign.local/auth/account-deleted', {
      method,
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      ...(method === 'POST'
        ? { body: new URLSearchParams(token ? { account_deleted_token: token } : {}).toString() }
        : {}),
    });
  const deleted = async (world: World, sub = 'u1') =>
    post(await world.core.accountDeletedToken({ sub }));

  it('ends every session of the person, runs the handler with the sub, and answers 200 after it', async () => {
    const world = setup();
    const first = await signIn(world);
    const second = await signIn(world);
    const calls: string[] = [];
    let finished = false;
    const reply = await world.sv.auth.handleAccountDeleted(await deleted(world), async (person) => {
      calls.push(person.sub);
      await new Promise((resolve) => setTimeout(resolve, 5));
      finished = true;
    });
    expect(reply.status).toBe(200);
    expect(finished).toBe(true);
    expect(calls).toEqual(['u1']);
    expect(await world.sv.auth.getSession(withCookie(first.cookie))).toBeNull();
    expect(await world.sv.auth.getSession(withCookie(second.cookie))).toBeNull();
  });

  it('forgets the stored refresh token when the token store can, and leaves another person’s alone', async () => {
    const world = setup({ deletes: true });
    world.core.addPerson({ sub: 'u2', name: 'Grace Hopper' });
    world.tokens.tokens.set('u1', 'rt-1');
    world.tokens.tokens.set('u2', 'rt-2');
    await world.sv.auth.handleAccountDeleted(await deleted(world), () => undefined);
    expect([...world.tokens.tokens.entries()]).toEqual([['u2', 'rt-2']]);
  });

  it('works with a token store that cannot delete, leaving that to the handler', async () => {
    const world = setup();
    world.tokens.tokens.set('u1', 'rt-1');
    const reply = await world.sv.auth.handleAccountDeleted(await deleted(world), () => undefined);
    expect(reply.status).toBe(200);
    expect(world.tokens.tokens.get('u1')).toBe('rt-1');
  });

  it('leaves another person’s sessions alone', async () => {
    const world = setup();
    world.core.addPerson({ sub: 'u2', name: 'Grace Hopper' });
    await signIn(world, 'u1');
    const two = await signIn(world, 'u2');
    await world.sv.auth.handleAccountDeleted(await deleted(world), () => undefined);
    expect((await world.sv.auth.getSession(withCookie(two.cookie)))?.sub).toBe('u2');
  });

  it('answers 500, saying nothing of why, when the handler throws, so core sends it again', async () => {
    const world = setup();
    const reply = await world.sv.auth.handleAccountDeleted(await deleted(world), () => {
      throw new Error('the database is down at db.internal');
    });
    expect(reply.status).toBe(500);
    expect(await reply.json()).toEqual({ error: 'server_error' });
    // Core's next try has a token of its own, and works.
    const again = await world.sv.auth.handleAccountDeleted(await deleted(world), () => undefined);
    expect(again.status).toBe(200);
  });

  it.each(wrongWays())('refuses a token that is wrong in this way: %s', async (way) => {
    const world = setup();
    const { cookie } = await signIn(world);
    let ran = false;
    const token = await world.core.accountDeletedToken({ sub: 'u1' }, { wrong: way });
    const reply = await world.sv.auth.handleAccountDeleted(post(token), () => {
      ran = true;
    });
    expect(reply.status).toBe(400);
    expect(await reply.json()).toEqual({ error: 'invalid_request' });
    expect(ran).toBe(false);
    expect((await world.sv.auth.getSession(withCookie(cookie)))?.sub).toBe('u1');
  });

  it('refuses a logout token, and a deletion token as a logout token', async () => {
    const world = setup();
    await signIn(world);
    const logout = await world.core.logoutToken({ sub: 'u1' });
    expect((await world.sv.auth.handleAccountDeleted(post(logout), () => undefined)).status).toBe(
      400,
    );
    const deletion = await world.core.accountDeletedToken({ sub: 'u1' });
    expect(
      (
        await world.sv.auth.handleBackChannelLogout(
          new Request('https://notes.sovereign.local/auth/backchannel-logout', {
            method: 'POST',
            headers: { 'content-type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({ logout_token: deletion }).toString(),
          }),
        )
      ).status,
    ).toBe(400);
  });

  it('refuses a token it has seen before, a missing token, junk, and anything but a POST', async () => {
    const world = setup();
    const token = await world.core.accountDeletedToken({ sub: 'u1' });
    const handler = () => undefined;
    expect((await world.sv.auth.handleAccountDeleted(post(token), handler)).status).toBe(200);
    expect((await world.sv.auth.handleAccountDeleted(post(token), handler)).status).toBe(400);
    expect((await world.sv.auth.handleAccountDeleted(post(undefined), handler)).status).toBe(400);
    expect((await world.sv.auth.handleAccountDeleted(post('not.a.jwt'), handler)).status).toBe(400);
    expect((await world.sv.auth.handleAccountDeleted(post(token, 'GET'), handler)).status).toBe(
      400,
    );
  });
});

function wrongWays(): WrongLogoutToken[] {
  return [
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
}

describe('when core ends a person’s session (sdk §9.1)', () => {
  it('ends their sessions in the app and forgets their refresh token when core refuses the renewal', async () => {
    const world = setup({ deletes: true });
    const { cookie } = await signIn(world);
    world.core.revoke('u1');
    world.core.expireAccessTokens();
    const failure = await world.sv
      .as({ sub: 'u1' })
      .directory.searchUsers({ q: 'ada' })
      .catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(SessionEndedError);
    expect((failure as SessionEndedError).byCore).toBe(true);
    expect(await world.sv.auth.getSession(withCookie(cookie))).toBeNull();
    expect(world.tokens.tokens.has('u1')).toBe(false);
  });

  it('leaves the sessions alone when the app simply has no refresh token for the person', async () => {
    const world = setup({ scopes: ['openid', 'profile'] });
    const { cookie } = await signIn(world);
    const failure = await world.sv
      .as({ sub: 'u1' })
      .directory.searchUsers({ q: 'ada' })
      .catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(SessionEndedError);
    expect((failure as SessionEndedError).byCore).toBe(false);
    expect((await world.sv.auth.getSession(withCookie(cookie)))?.sub).toBe('u1');
  });
});
