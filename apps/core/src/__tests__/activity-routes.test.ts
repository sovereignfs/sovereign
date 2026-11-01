import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api/errors';
import { expectMatchesContract } from './core-api-contract';

const APP_ROOT = path.join(import.meta.dirname, '../..');
const ORIGIN = 'http://localhost:3000';
let folder: string;

// The token checks are tested with a real provider in app-tokens.suite.ts; here the guard only says who is calling, and what the
// route does with the request is what is under test.
const guard = vi.fn();
vi.mock('../activity/api', async (original) => ({
  ...(await original<typeof import('../activity/api')>()),
  activityGuard: (...args: unknown[]) => guard(...args) as unknown,
}));

type Db = Awaited<ReturnType<(typeof import('../database'))['getDatabase']>>;
let db: Db;
let route: typeof import('../../app/api/v1/activity/route');

const APP = { clientId: 'app', scopes: ['activity:write'] };

beforeAll(async () => {
  folder = mkdtempSync(path.join(tmpdir(), 'sv-activity-routes-'));
  vi.stubEnv('SV_URL', ORIGIN);
  vi.stubEnv('SV_AUTH_SECRET', 'a-secret-that-is-long-enough-to-pass-validation');
  vi.stubEnv('SV_DB_DIALECT', 'sqlite');
  vi.stubEnv('SV_SQLITE_URL', `file:${path.join(folder, 'core.db')}`);
  vi.spyOn(process, 'cwd').mockReturnValue(APP_ROOT);
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  const { migrateDatabaseOrExit } = await import('../startup');
  await migrateDatabaseOrExit();
  db = await (await import('../database')).getDatabase();
  route = await import('../../app/api/v1/activity/route');
});
afterAll(async () => {
  await db.close();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  rmSync(folder, { recursive: true, force: true });
});

const user = (id: string) =>
  db.run(
    `insert into users (id, name, email, email_verified, role, created_at, updated_at) values (?, ?, ?, 1, 'platform:user', 1, 1)`,
    [id, id, `${id}@sovereign.local`],
  );
const app = (id: string, name: string) =>
  db.run(
    `insert into oauth_clients (id, client_id, name, redirect_uris, scopes, created_at, updated_at) values (?, ?, ?, ?, '[]', 1, 1)`,
    [id, id, name, JSON.stringify(['https://reminders.sovereign.local/cb'])],
  );
const consent = (userId: string, clientId: string) =>
  db.run(
    `insert into oauth_consents (id, client_id, user_id, scopes, created_at, updated_at) values (?, ?, ?, '[]', 1, 1)`,
    [`${userId}-${clientId}`, clientId, userId],
  );

beforeEach(async () => {
  for (const table of ['activity', 'oauth_consents', 'oauth_clients', 'rate_limits', 'users']) {
    await db.run(`delete from ${table}`);
  }
  await user('ada');
  await user('bo');
  await app('app', 'Reminders');
  await consent('ada', 'app');
  guard.mockReset().mockResolvedValue(APP);
});

const record = (body: unknown, raw?: string) =>
  route.POST(
    new Request(`${ORIGIN}/api/v1/activity`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: raw ?? JSON.stringify(body),
    }),
  );
const count = async () => Number((await db.run('select count(*) as n from activity')).rows[0]?.n);
const valid = { to: 'ada', summary: 'You completed Water the plants' };

describe('recording', () => {
  it('accepts an entry, answers 202 with an id as the contract says, and keeps it', async () => {
    const reply = await record({ ...valid, link: 'https://reminders.sovereign.local/tasks/3' });
    expect(reply.status).toBe(202);
    const body = (await reply.json()) as { id: string };
    expectMatchesContract('logActivity', 202, body);
    expect(Object.keys(body)).toEqual(['id']);
    expect(await count()).toBe(1);
    expect(guard).toHaveBeenCalledWith(expect.any(Request));
  });

  it('answers a record about someone who has not used the app the same way, and keeps nothing', async () => {
    for (const to of ['bo', 'no-such-account']) {
      const reply = await record({ ...valid, to });
      expect(reply.status, to).toBe(202);
      const body = await reply.json();
      expectMatchesContract('logActivity', 202, body);
      expect(Object.keys(body as object)).toEqual(['id']);
    }
    expect(await count()).toBe(0);
  });

  it.each([
    ['a body that is not JSON', undefined, 'not json'],
    ['a list', undefined, '[]'],
    ['a field it does not have', { ...valid, app: 'someone-else' }, undefined],
    ['no summary', { to: 'ada' }, undefined],
    ['a summary that is too long', { ...valid, summary: 'x'.repeat(201) }, undefined],
    ['a summary on two lines', { ...valid, summary: 'a\nb' }, undefined],
    ['a link to another site', { ...valid, link: 'https://evil.sovereign.local/' }, undefined],
    [
      'a time a week ago',
      { ...valid, at: new Date(Date.now() - 7 * 86_400_000).toISOString() },
      undefined,
    ],
  ])('refuses %s with a 400 that matches the contract', async (_name, body, raw) => {
    const reply = await record(body, raw);
    expect(reply.status).toBe(400);
    expectMatchesContract('logActivity', 400, await reply.json());
    expect(await count()).toBe(0);
  });

  it('answers 429 with a time to wait when an app records about one person too often', async () => {
    for (let i = 0; i < 120; i += 1)
      expect((await record({ ...valid, summary: `n${i}` })).status).toBe(202);
    const reply = await record(valid);
    expect(reply.status).toBe(429);
    expect(Number(reply.headers.get('retry-after'))).toBeGreaterThan(0);
    expectMatchesContract('logActivity', 429, await reply.json());
  });

  it('is refused as the guard refuses it, and keeps nothing', async () => {
    guard.mockRejectedValue(new ApiError(401, 'invalid_token', 'The access token is not valid.'));
    const reply = await record(valid);
    expect(reply.status).toBe(401);
    expectMatchesContract('logActivity', 401, await reply.json());
    expect(await count()).toBe(0);
  });

  it('has no way to read an entry back: the route answers only POST', () => {
    expect(Object.keys(route).filter((name) => /^(GET|PUT|PATCH|DELETE)$/.test(name))).toEqual([]);
  });
});
