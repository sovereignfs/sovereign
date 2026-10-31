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

function setup(options: Parameters<typeof nextAuth>[1] = {}) {
  const time = clock();
  const core = createFakeCore({ now: time.environment.now });
  core.addPerson({ sub: 'u1', name: 'Ada Lovelace' });
  const sv = createSovereign({
    appUrl: 'https://notes.example.test',
    coreUrl: core.url,
    ...core.credentials,
    sessionStore: memorySessionStore(time.environment.now),
    tokenStore: memoryStore().store,
    fetch: core.fetch,
    environment: time.environment,
    timeoutMs: 100,
  });
  return { core, sv, handlers: nextAuth(sv, options).handlers, next: nextAuth(sv, options) };
}

const cookiesOf = (reply: Response) =>
  reply.headers
    .getSetCookie()
    .filter((cookie) => !/Max-Age=0\b/.test(cookie))
    .map((cookie) => cookie.split(';')[0])
    .join('; ');
const at = (path: string, init?: RequestInit) =>
  new Request(`https://notes.example.test${path}`, init);

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

  it('answers a path it does not serve with a 404', async () => {
    const { handlers } = setup();
    expect((await handlers.GET(at('/auth/nothing'))).status).toBe(404);
    expect((await handlers.POST(at('/auth/login', { method: 'POST' }))).status).toBe(404);
    expect((await handlers.GET(at('/elsewhere'))).status).toBe(404);
  });
});
