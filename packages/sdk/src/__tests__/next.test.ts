import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createSovereign } from '../index';
import { createFakeCore, memorySessionStore } from '../testing';
import { clock, memoryStore } from './helpers';

const jar = { value: '' };
vi.mock('next/headers', () => ({
  cookies: () => Promise.resolve({ toString: () => jar.value }),
}));
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw Object.assign(new Error('NEXT_REDIRECT'), { digest: `NEXT_REDIRECT;${url}` });
  },
}));

const { nextAuth } = await import('../next/index');

function setup(options: Parameters<typeof nextAuth>[1] = {}, checkEverySeconds?: number) {
  const time = clock();
  const core = createFakeCore({ now: time.environment.now });
  core.addPerson({ sub: 'u1', name: 'Ada Lovelace' });
  const sv = createSovereign({
    appUrl: 'https://notes.sovereign.local',
    coreUrl: core.url,
    ...core.credentials,
    sessionStore: memorySessionStore(time.environment.now),
    tokenStore: memoryStore().store,
    fetch: core.fetch,
    environment: time.environment,
    timeoutMs: 100,
    ...(checkEverySeconds === undefined ? {} : { checkEverySeconds }),
  });
  return {
    core,
    sv,
    time,
    handlers: nextAuth(sv, options).handlers,
    next: nextAuth(sv, options),
  };
}

const cookiesOf = (reply: Response) =>
  reply.headers
    .getSetCookie()
    .filter((cookie) => !/Max-Age=0\b/.test(cookie))
    .map((cookie) => cookie.split(';')[0])
    .join('; ');
const at = (path: string, init?: RequestInit) =>
  new Request(`https://notes.sovereign.local${path}`, init);

beforeEach(() => {
  jar.value = '';
});

describe('the Next.js adapter (sdk §9)', () => {
  it('signs in through the login and callback routes, and reads the session from the request’s cookies', async () => {
    const { core, handlers, next } = setup();
    const login = await handlers.GET(at('/auth/login?returnTo=/notes/3'));
    expect(login.status).toBe(302);
    const toCore = login.headers.get('location') as string;
    expect(toCore).toMatch(/^https:\/\/core\.test\/api\/auth\/oauth2\/authorize\?/);

    const back = core.authorize(toCore, 'u1');
    const callback = await handlers.GET(
      at(new URL(back).pathname + new URL(back).search, { headers: { cookie: cookiesOf(login) } }),
    );
    expect(callback.status).toBe(303);
    expect(callback.headers.get('location')).toBe('/notes/3');
    expect(callback.headers.get('cache-control')).toBe('no-store');

    jar.value = cookiesOf(callback);
    expect((await next.getSession())?.sub).toBe('u1');
    expect((await next.requireSession()).sub).toBe('u1');
  });

  it('gives the session’s key secret to the app’s own pages only, the same each time, and none without a session (sdk §9.2)', async () => {
    const { core, handlers } = setup();
    const login = await handlers.GET(at('/auth/login'));
    const back = core.authorize(login.headers.get('location') as string, 'u1');
    const callback = await handlers.GET(
      at(new URL(back).pathname + new URL(back).search, { headers: { cookie: cookiesOf(login) } }),
    );
    const cookie = cookiesOf(callback);
    const ask = (site?: string) =>
      handlers.GET(
        at('/auth/key-secret', {
          headers: { cookie, ...(site ? { 'sec-fetch-site': site } : {}) },
        }),
      );

    const first = await ask('same-origin');
    expect(first.status).toBe(200);
    expect(first.headers.get('cache-control')).toBe('no-store');
    const body = (await first.json()) as { sub: string; secret: string };
    expect(body.sub).toBe('u1');
    expect(body.secret).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(((await (await ask()).json()) as { secret: string }).secret).toBe(body.secret);

    expect((await ask('cross-site')).status).toBe(404);
    expect((await ask('same-site')).status).toBe(404);
    expect((await handlers.GET(at('/auth/key-secret'))).status).toBe(401);
  });

  it('sends a failed sign-in back to the app, not to an error page of ours', async () => {
    const { handlers } = setup();
    const reply = await handlers.GET(at('/auth/callback?code=x&state=y'));
    expect(reply.status).toBe(303);
    expect(reply.headers.get('location')).toBe('/?error=signin');
  });

  it('signs out with a POST: the app’s session ends, and the person goes to core’s sign-out', async () => {
    const { core, handlers, next } = setup();
    const login = await handlers.GET(at('/auth/login'));
    const back = new URL(core.authorize(login.headers.get('location') as string, 'u1'));
    const callback = await handlers.GET(
      at(back.pathname + back.search, { headers: { cookie: cookiesOf(login) } }),
    );
    const cookie = cookiesOf(callback);
    const out = await handlers.POST(at('/auth/logout', { method: 'POST', headers: { cookie } }));
    expect(out.status).toBe(303);
    expect(out.headers.get('location')).toContain('/api/auth/oauth2/end-session');
    expect(out.headers.getSetCookie()[0]).toMatch(/Max-Age=0/);
    jar.value = cookie;
    expect(await next.getSession()).toBeNull();
  });

  it('does not sign out on a GET, which a page or an image could cause', async () => {
    const { handlers } = setup();
    expect((await handlers.GET(at('/auth/logout'))).status).toBe(404);
  });

  it('receives a back-channel logout at its route', async () => {
    const { core, handlers, next } = setup();
    const login = await handlers.GET(at('/auth/login'));
    const back = new URL(core.authorize(login.headers.get('location') as string, 'u1'));
    const callback = await handlers.GET(
      at(back.pathname + back.search, { headers: { cookie: cookiesOf(login) } }),
    );
    const token = await core.logoutToken({ sub: 'u1' });
    const reply = await handlers.POST(
      at('/auth/backchannel-logout', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ logout_token: token }).toString(),
      }),
    );
    expect(reply.status).toBe(200);
    jar.value = cookiesOf(callback);
    expect(await next.getSession()).toBeNull();
  });

  it('receives an account-deleted notice at its route, only when the app gave a handler', async () => {
    const deleted: string[] = [];
    const { core, handlers } = setup({ onAccountDeleted: ({ sub }) => void deleted.push(sub) });
    const request = async () =>
      at('/auth/account-deleted', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          account_deleted_token: await core.accountDeletedToken({ sub: 'u1' }),
        }).toString(),
      });
    expect((await handlers.POST(await request())).status).toBe(200);
    expect(deleted).toEqual(['u1']);

    const without = setup();
    expect((await without.handlers.POST(await request())).status).toBe(404);
  });

  it('sends a person with no session to sign in, and back to where they were', async () => {
    const { next } = setup();
    await expect(next.requireSession('/notes/9')).rejects.toMatchObject({
      digest: 'NEXT_REDIRECT;/auth/login?returnTo=%2Fnotes%2F9',
    });
  });

  it('passes `prompt` and `max_age` on from the login route, and nothing it does not know', async () => {
    const { handlers } = setup();
    const asked = new URL(
      (await handlers.GET(at('/auth/login?prompt=login&max_age=300'))).headers.get('location') ??
        '',
    );
    expect(asked.searchParams.get('prompt')).toBe('login');
    expect(asked.searchParams.get('max_age')).toBe('300');
    const create = new URL(
      (await handlers.GET(at('/auth/login?prompt=create'))).headers.get('location') ?? '',
    );
    expect(create.searchParams.get('prompt')).toBe('create');
    const junk = new URL(
      (await handlers.GET(at('/auth/login?prompt=consent&max_age=soon'))).headers.get('location') ??
        '',
    );
    expect(junk.searchParams.has('prompt')).toBe(false);
    expect(junk.searchParams.has('max_age')).toBe(false);
  });

  it('sends a person whose sign-in is older than a page asks to sign in again, with the age (sdk §9.6)', async () => {
    const { core, handlers, next, time } = setup();
    const login = await handlers.GET(at('/auth/login'));
    const back = core.authorize(login.headers.get('location') as string, 'u1');
    const callback = await handlers.GET(
      at(new URL(back).pathname + new URL(back).search, { headers: { cookie: cookiesOf(login) } }),
    );
    jar.value = cookiesOf(callback);
    expect((await next.requireSession('/settings', { maxAgeSeconds: 300 })).sub).toBe('u1');
    time.advance(301_000);
    await expect(next.requireSession('/settings', { maxAgeSeconds: 300 })).rejects.toMatchObject({
      digest: 'NEXT_REDIRECT;/auth/login?returnTo=%2Fsettings&max_age=300',
    });
    expect((await next.requireSession('/settings')).sub).toBe('u1');
  });

  it('sends a session due a check through core with prompt=none, and keeps it when core still knows the person (sdk §9.7)', async () => {
    const { core, handlers, next, time } = setup({}, 3600);
    const signIn = async (path: string, cookie = '') => {
      const login = await handlers.GET(at(path, { headers: { cookie } }));
      const back = core.authorize(login.headers.get('location') as string, 'u1');
      return handlers.GET(
        at(new URL(back).pathname + new URL(back).search, {
          headers: { cookie: [cookie, cookiesOf(login)].filter(Boolean).join('; ') },
        }),
      );
    };
    jar.value = cookiesOf(await signIn('/auth/login'));
    expect((await next.requireSession('/notes')).sub).toBe('u1');
    time.advance(3601 * 1000);
    await expect(next.requireSession('/notes')).rejects.toMatchObject({
      digest: 'NEXT_REDIRECT;/auth/login?returnTo=%2Fnotes&prompt=none',
    });
    const toCore = new URL(
      (await handlers.GET(at('/auth/login?returnTo=%2Fnotes&prompt=none'))).headers.get(
        'location',
      ) ?? '',
    );
    expect(toCore.searchParams.get('prompt')).toBe('none');
    const renewed = await signIn('/auth/login?returnTo=%2Fnotes&prompt=none', jar.value);
    expect(renewed.headers.get('location')).toBe('/notes');
    expect((await next.requireSession('/notes')).sub).toBe('u1');
  });

  it('ends the session and asks the person to sign in when core says they must (sdk §9.7)', async () => {
    const { core, handlers } = setup({}, 3600);
    const login = await handlers.GET(at('/auth/login?returnTo=%2Fnotes&prompt=none'));
    const back = core.loginRequired(login.headers.get('location') as string);
    const callback = await handlers.GET(
      at(new URL(back).pathname + new URL(back).search, { headers: { cookie: cookiesOf(login) } }),
    );
    expect(callback.status).toBe(303);
    expect(callback.headers.get('location')).toBe('/auth/login?returnTo=%2Fnotes');
    expect(
      callback.headers.getSetCookie().some((cookie) => /sv_session=;.*Max-Age=0/.test(cookie)),
    ).toBe(true);
  });

  it('answers a path it does not serve with a 404', async () => {
    const { handlers } = setup();
    expect((await handlers.GET(at('/auth/nothing'))).status).toBe(404);
    expect((await handlers.POST(at('/auth/login', { method: 'POST' }))).status).toBe(404);
    expect((await handlers.GET(at('/elsewhere'))).status).toBe(404);
  });
});
