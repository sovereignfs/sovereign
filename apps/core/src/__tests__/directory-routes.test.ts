import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api/errors';
import { expectMatchesContract } from './core-api-contract';

const APP_ROOT = path.join(import.meta.dirname, '../..');
const ORIGIN = 'http://localhost:3000';
let folder: string;

// The token check and the counters are tested with a real provider in directory.suite.ts; here the guard only
// says yes or no, and what the routes do with the request is what is under test.
const guard = vi.fn();
vi.mock('../directory/service', async (original) => ({
  ...(await original<typeof import('../directory/service')>()),
  directoryGuard: (...args: unknown[]) => guard(...args) as unknown,
}));

type Db = Awaited<ReturnType<(typeof import('../database'))['getDatabase']>>;
let db: Db;
let search: typeof import('../../app/api/v1/directory/users/route');
let resolve: typeof import('../../app/api/v1/directory/users/resolve/route');
let byEmail: typeof import('../../app/api/v1/directory/users/by-email/route');

const PRINCIPAL = { userId: 'caller', clientId: 'app', scopes: ['directory'] };

beforeAll(async () => {
  folder = mkdtempSync(path.join(tmpdir(), 'sv-directory-routes-'));
  vi.stubEnv('SV_URL', ORIGIN);
  vi.stubEnv('SV_AUTH_SECRET', 'a-secret-that-is-long-enough-to-pass-validation');
  vi.stubEnv('SV_DB_DIALECT', 'sqlite');
  vi.stubEnv('SV_SQLITE_URL', `file:${path.join(folder, 'core.db')}`);
  vi.spyOn(process, 'cwd').mockReturnValue(APP_ROOT);
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  const { migrateDatabaseOrExit } = await import('../startup');
  await migrateDatabaseOrExit();
  db = await (await import('../database')).getDatabase();
  search = await import('../../app/api/v1/directory/users/route');
  resolve = await import('../../app/api/v1/directory/users/resolve/route');
  byEmail = await import('../../app/api/v1/directory/users/by-email/route');
});
afterAll(async () => {
  await db.close();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  rmSync(folder, { recursive: true, force: true });
});

const add = (id: string, name: string, email: string, extra = '') =>
  db.run(
    `insert into users (id, name, email, email_verified, role, created_at, updated_at${extra ? ', image' : ''}) values (?, ?, ?, 1, 'platform:user', 1, 1${extra ? ', ?' : ''})`,
    extra ? [id, name, email, extra] : [id, name, email],
  );

beforeEach(async () => {
  await db.run('delete from users');
  await add('u1', 'Ada Lovelace', 'ada@example.com', '/api/avatars/u1?v=1');
  await add('u2', 'Adam Smith', 'adam@example.com');
  await add('u3', 'Bo Barnes', 'bo@example.com');
  guard.mockReset().mockResolvedValue(PRINCIPAL);
});

const get = (route: { GET: (request: Request) => Promise<Response> }, query: string) =>
  route.GET(new Request(`${ORIGIN}/api/v1/directory/users${query}`));
const post = (body: unknown, raw?: string) =>
  resolve.POST(
    new Request(`${ORIGIN}/api/v1/directory/users/resolve`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: raw ?? JSON.stringify(body),
    }),
  );

describe('searching', () => {
  it('answers with the people whose name matches, as the contract describes, and nothing more', async () => {
    const reply = await get(search, '?q=ad');
    expect(reply.status).toBe(200);
    const body = (await reply.json()) as { users: Record<string, unknown>[] };
    expectMatchesContract('searchDirectoryUsers', 200, body);
    expect(body.users.map((user) => user.name)).toEqual(['Ada Lovelace', 'Adam Smith']);
    for (const user of body.users)
      expect(Object.keys(user).sort()).toEqual(['name', 'picture', 'sub']);
    expect(body.users.find((user) => user.sub === 'u1')?.picture).toBe(
      `${ORIGIN}/api/avatars/u1?v=1`,
    );
    expect(reply.headers.get('cache-control')).toBe('no-store');
    expect(reply.headers.get('x-content-type-options')).toBe('nosniff');
  });

  it('answers an empty list, not an error, when nobody matches', async () => {
    const body = (await (await get(search, '?q=zzz')).json()) as unknown;
    expect(body).toEqual({ users: [] });
    expectMatchesContract('searchDirectoryUsers', 200, body);
  });

  it('gives ten at most when no limit is given, and the limit when it is', async () => {
    for (let i = 0; i < 12; i++) await add(`m${i}`, `Match ${i}`, `m${i}@example.com`);
    expect(
      ((await (await get(search, '?q=match')).json()) as { users: unknown[] }).users,
    ).toHaveLength(10);
    expect(
      ((await (await get(search, '?q=match&limit=3')).json()) as { users: unknown[] }).users,
    ).toHaveLength(3);
    expect(
      ((await (await get(search, '?q=match&limit=25')).json()) as { users: unknown[] }).users,
    ).toHaveLength(12);
  });

  it.each([
    ['no q', ''],
    ['an empty q', '?q='],
    ['a q of only spaces', '?q=%20%20'],
    ['a q of 101 characters', `?q=${'a'.repeat(101)}`],
    ['a limit of 0', '?q=a&limit=0'],
    ['a limit of 26', '?q=a&limit=26'],
    ['a limit that is not a number', '?q=a&limit=many'],
    ['a limit with a decimal', '?q=a&limit=1.5'],
    ['a negative limit', '?q=a&limit=-1'],
    ['a limit that is huge', '?q=a&limit=99999999'],
  ])('refuses %s with the contract’s error, and searches for nothing', async (_name, query) => {
    const reply = await get(search, query);
    expect(reply.status).toBe(400);
    const body = (await reply.json()) as unknown;
    expectMatchesContract('searchDirectoryUsers', 400, body);
    expect(body).toMatchObject({ error: 'invalid_request' });
  });

  it('accepts a q of exactly 100 characters, and trims the spaces round one', async () => {
    expect((await get(search, `?q=${'a'.repeat(100)}`)).status).toBe(200);
    expect((await get(search, '?q=%20lovel%20')).status).toBe(200);
    expect(
      ((await (await get(search, '?q=%20lovel%20')).json()) as { users: unknown[] }).users,
    ).toHaveLength(1);
  });
});

describe('resolving', () => {
  it('answers with each person found and whether they are active, as the contract describes', async () => {
    await db.run("update users set deactivated_at = 1 where id = 'u2'");
    const reply = await post({ subs: ['u2', 'nobody', 'u1'] });
    expect(reply.status).toBe(200);
    const body = (await reply.json()) as { users: { sub: string; active: boolean }[] };
    expectMatchesContract('resolveDirectoryUsers', 200, body);
    expect(body.users.map((user) => [user.sub, user.active])).toEqual([
      ['u2', false],
      ['u1', true],
    ]);
  });

  it.each([
    ['a body that is not JSON', undefined, '{nope'],
    ['an empty body', undefined, ''],
    ['a list instead of an object', ['u1'], undefined],
    ['null', null, undefined],
    ['no subs', {}, undefined],
    ['a field the contract does not have', { subs: ['u1'], extra: true }, undefined],
    ['subs that is not a list', { subs: 'u1' }, undefined],
    ['an empty list', { subs: [] }, undefined],
    ['101 subs', { subs: Array.from({ length: 101 }, (_, i) => `u${i}`) }, undefined],
    ['a sub that is not text', { subs: ['u1', 7] }, undefined],
    ['an empty sub', { subs: [''] }, undefined],
    ['a sub of 256 characters', { subs: ['x'.repeat(256)] }, undefined],
  ])('refuses %s', async (_name, body, raw) => {
    const reply = await post(body, raw);
    expect(reply.status).toBe(400);
    expectMatchesContract('resolveDirectoryUsers', 400, await reply.json());
  });

  it('refuses a body that is too large, before reading it all', async () => {
    const reply = await resolve.POST(
      new Request(`${ORIGIN}/api/v1/directory/users/resolve`, {
        method: 'POST',
        headers: { 'content-length': String(10 * 1024 * 1024) },
        body: '{"subs":["u1"]}',
      }),
    );
    expect(reply.status).toBe(400);
    expect(
      await post({ subs: ['x'.repeat(255)].concat(Array(100).fill('y'.repeat(255))) }),
    ).toBeDefined();
  });

  it('accepts exactly 100 subs of 255 characters', async () => {
    const reply = await post({
      subs: Array.from({ length: 100 }, (_, i) => `${i}`.padEnd(255, 'x')),
    });
    expect(reply.status).toBe(200);
  });
});

describe('finding by email', () => {
  it('answers with the person whose whole address it is, as the contract describes', async () => {
    const reply = await get(byEmail, '/by-email?email=ADA@example.com');
    expect(reply.status).toBe(200);
    const body = (await reply.json()) as unknown;
    expectMatchesContract('findDirectoryUserByEmail', 200, body);
    expect(body).toMatchObject({ sub: 'u1', name: 'Ada Lovelace' });
    expect(Object.keys(body as object).sort()).toEqual(['name', 'picture', 'sub']);
  });

  it('answers not found, in the contract’s words, for part of an address, and for an address nobody has', async () => {
    for (const email of ['ada', 'ada@', '@example.com', 'ada@example.%', 'nobody@example.com']) {
      const reply = await get(byEmail, `/by-email?email=${encodeURIComponent(email)}`);
      expect(reply.status, email).toBe(email.length < 3 ? 400 : 404);
      expectMatchesContract('findDirectoryUserByEmail', reply.status, await reply.json());
    }
  });

  it.each([
    ['no email', '/by-email'],
    ['an email of two characters', '/by-email?email=ab'],
    ['an email of 255 characters', `/by-email?email=${'a'.repeat(255)}`],
  ])('refuses %s', async (_name, query) => {
    const reply = await get(byEmail, query);
    expect(reply.status).toBe(400);
    expectMatchesContract('findDirectoryUserByEmail', 400, await reply.json());
  });
});

describe('who may call', () => {
  const routes = [
    ['search', () => get(search, '?q=a')],
    ['resolve', () => post({ subs: ['u1'] })],
    ['by email', () => get(byEmail, '/by-email?email=ada@example.com')],
  ] as const;

  it.each(routes)(
    '%s asks the guard before it does anything, and answers a refusal as the contract says',
    async (_name, call) => {
      guard.mockRejectedValue(
        new ApiError(401, 'invalid_token', 'The access token is not valid.', {
          'www-authenticate': 'Bearer realm="Sovereign API", error="invalid_token"',
        }),
      );
      const reply = await call();
      expect(reply.status).toBe(401);
      expect(reply.headers.get('www-authenticate')).toContain('invalid_token');
      expect(reply.headers.get('cache-control')).toBe('no-store');
      expectMatchesContract('searchDirectoryUsers', 401, await reply.json());
    },
  );

  it.each(routes)('%s answers “too many calls” with how long to wait', async (_name, call) => {
    guard.mockRejectedValue(
      new ApiError(429, 'rate_limited', 'Too many calls. Wait, then try again.', {
        'retry-after': '12',
      }),
    );
    const reply = await call();
    expect(reply.status).toBe(429);
    expect(reply.headers.get('retry-after')).toBe('12');
    expectMatchesContract('searchDirectoryUsers', 429, await reply.json());
  });

  it.each(routes)('%s answers a missing scope as a 403 that is not a 401', async (_name, call) => {
    guard.mockRejectedValue(
      new ApiError(403, 'insufficient_scope', 'The access token does not allow directory.'),
    );
    const reply = await call();
    expect(reply.status).toBe(403);
    expectMatchesContract('searchDirectoryUsers', 403, await reply.json());
  });

  it('does not look at a bad request until the caller is known: a bad token is a 401 whatever else is wrong', async () => {
    guard.mockRejectedValue(new ApiError(401, 'invalid_token', 'nope'));
    expect((await get(search, '')).status).toBe(401);
    expect((await post({ wrong: true })).status).toBe(401);
  });

  it('lets a fault through rather than answering as if it were the caller’s', async () => {
    guard.mockRejectedValue(new Error('the database is down'));
    await expect(get(search, '?q=a')).rejects.toThrow('database');
  });
});
