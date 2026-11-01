import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api/errors';
import { expectMatchesContract } from './core-api-contract';

const APP_ROOT = path.join(import.meta.dirname, '../..');
const ORIGIN = 'http://localhost:3000';
let folder: string;

// The token checks are tested with a real provider in app-tokens.suite.ts and directory.suite.ts; here the guard only says who is
// calling, and what the routes do with the request is what is under test.
const guard = vi.fn();
vi.mock('../notifications/api', async (original) => ({
  ...(await original<typeof import('../notifications/api')>()),
  notificationsGuard: (...args: unknown[]) => guard(...args) as unknown,
}));

type Db = Awaited<ReturnType<(typeof import('../database'))['getDatabase']>>;
let db: Db;
let collection: typeof import('../../app/api/v1/notifications/route');
let readAll: typeof import('../../app/api/v1/notifications/read-all/route');
let dismissAll: typeof import('../../app/api/v1/notifications/dismiss-all/route');
let read: typeof import('../../app/api/v1/notifications/[id]/read/route');
let dismiss: typeof import('../../app/api/v1/notifications/[id]/dismiss/route');

const APP = { clientId: 'app', scopes: ['notifications:send'] };
const PERSON = { userId: 'ada', clientId: 'app', scopes: ['notifications'] };

beforeAll(async () => {
  folder = mkdtempSync(path.join(tmpdir(), 'sv-notification-routes-'));
  vi.stubEnv('SV_URL', ORIGIN);
  vi.stubEnv('SV_AUTH_SECRET', 'a-secret-that-is-long-enough-to-pass-validation');
  vi.stubEnv('SV_DB_DIALECT', 'sqlite');
  vi.stubEnv('SV_SQLITE_URL', `file:${path.join(folder, 'core.db')}`);
  vi.spyOn(process, 'cwd').mockReturnValue(APP_ROOT);
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  const { migrateDatabaseOrExit } = await import('../startup');
  await migrateDatabaseOrExit();
  db = await (await import('../database')).getDatabase();
  collection = await import('../../app/api/v1/notifications/route');
  readAll = await import('../../app/api/v1/notifications/read-all/route');
  dismissAll = await import('../../app/api/v1/notifications/dismiss-all/route');
  read = await import('../../app/api/v1/notifications/[id]/read/route');
  dismiss = await import('../../app/api/v1/notifications/[id]/dismiss/route');
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
  for (const table of [
    'notification_settings',
    'notifications',
    'oauth_consents',
    'oauth_clients',
    'rate_limits',
    'users',
  ]) {
    await db.run(`delete from ${table}`);
  }
  await user('ada');
  await user('bo');
  await app('app', 'Reminders');
  await app('other', 'Other');
  await consent('ada', 'app');
  await consent('ada', 'other');
  guard.mockReset().mockResolvedValue(APP);
});

const json = (body: unknown) => ({
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
});
const send = (body: unknown) =>
  collection.POST(new Request(`${ORIGIN}/api/v1/notifications`, json(body)));
const list = (query = '') => collection.GET(new Request(`${ORIGIN}/api/v1/notifications${query}`));
const count = async () =>
  Number((await db.run('select count(*) as n from notifications')).rows[0]?.n);
const asPerson = () => guard.mockResolvedValue(PERSON);

describe('sending', () => {
  it('accepts a message, answers 202 with an id as the contract says, and keeps it', async () => {
    const reply = await send({ to: 'ada', title: 'Due today', body: 'Water the plants' });
    expect(reply.status).toBe(202);
    const body = (await reply.json()) as { id: string };
    expectMatchesContract('sendNotification', 202, body);
    expect(Object.keys(body)).toEqual(['id']);
    expect(await count()).toBe(1);
    expect(guard).toHaveBeenCalledWith(expect.any(Request), 'send');
  });

  it('answers a send to someone who has not used the app the same way, and keeps nothing', async () => {
    const reply = await send({ to: 'bo', title: 'Due today' });
    expect(reply.status).toBe(202);
    expectMatchesContract('sendNotification', 202, await reply.json());
    expect(await count()).toBe(0);
  });

  it.each([
    ['a body that is not JSON', 'not json'],
    ['a list', '[]'],
    ['a field it does not have', '{"to":"ada","title":"x","from":"someone"}'],
    ['no title', '{"to":"ada"}'],
    ['a title that is too long', JSON.stringify({ to: 'ada', title: 'x'.repeat(121) })],
    [
      'a link to another site',
      JSON.stringify({ to: 'ada', title: 'x', url: 'https://evil.sovereign.local/' }),
    ],
  ])('refuses %s with a 400 that matches the contract', async (_name, raw) => {
    const reply = await collection.POST(
      new Request(`${ORIGIN}/api/v1/notifications`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: raw,
      }),
    );
    expect(reply.status).toBe(400);
    expectMatchesContract('sendNotification', 400, await reply.json());
    expect(await count()).toBe(0);
  });

  it('answers 429 with a time to wait when an app sends one person too many', async () => {
    for (let i = 0; i < 60; i += 1)
      expect((await send({ to: 'ada', title: `n${i}` })).status).toBe(202);
    const reply = await send({ to: 'ada', title: 'one too many' });
    expect(reply.status).toBe(429);
    expect(Number(reply.headers.get('retry-after'))).toBeGreaterThan(0);
    expectMatchesContract('sendNotification', 429, await reply.json());
  });

  it('is refused as the guard refuses it, and keeps nothing', async () => {
    guard.mockRejectedValue(new ApiError(401, 'invalid_token', 'The access token is not valid.'));
    const reply = await send({ to: 'ada', title: 'x' });
    expect(reply.status).toBe(401);
    expectMatchesContract('sendNotification', 401, await reply.json());
    expect(await count()).toBe(0);
  });
});

describe('what a person’s token can do', () => {
  const seed = async () => {
    guard.mockResolvedValue(APP);
    await send({ to: 'ada', title: 'first' });
    await send({ to: 'ada', title: 'second', url: 'https://reminders.sovereign.local/x' });
    await db.run(
      `insert into notifications (id, user_id, client_id, title, category, created_at, expires_at) values ('o1', 'ada', 'other', 'not yours', 'info', ?, ?)`,
      [Date.now(), Date.now() + 86_400_000],
    );
    asPerson();
  };

  it('lists the calling app’s own, as the contract describes, and nobody else’s', async () => {
    await seed();
    const reply = await list();
    expect(reply.status).toBe(200);
    const body = (await reply.json()) as { notifications: { title: string }[] };
    expectMatchesContract('listNotifications', 200, body);
    expect(body.notifications.map((item) => item.title).sort()).toEqual(['first', 'second']);
    expect(guard).toHaveBeenLastCalledWith(expect.any(Request), 'read');
  });

  it('lists only the unread when asked, and no more than the limit', async () => {
    await seed();
    const first = ((await (await list()).json()) as { notifications: { id: string }[] })
      .notifications[0];
    await read.POST(new Request(`${ORIGIN}/x`, { method: 'POST' }), {
      params: Promise.resolve({ id: first?.id as string }),
    });
    expect(
      ((await (await list('?unread=true')).json()) as { notifications: unknown[] }).notifications,
    ).toHaveLength(1);
    expect(
      ((await (await list('?limit=1')).json()) as { notifications: unknown[] }).notifications,
    ).toHaveLength(1);
  });

  it.each(['?unread=maybe', '?limit=0', '?limit=101', '?limit=many', '?limit=1.5'])(
    'refuses %s',
    async (query) => {
      asPerson();
      const reply = await list(query);
      expect(reply.status).toBe(400);
      expectMatchesContract('listNotifications', 400, await reply.json());
    },
  );

  it('marks one read and dismisses one, answering with it, and 404 for one that is not the app’s or not the person’s', async () => {
    await seed();
    const [first] = ((await (await list()).json()) as { notifications: { id: string }[] })
      .notifications;
    const params = (id: string) => ({ params: Promise.resolve({ id }) });
    const marked = await read.POST(
      new Request(`${ORIGIN}/x`, { method: 'POST' }),
      params(first?.id as string),
    );
    expect(marked.status).toBe(200);
    const item = (await marked.json()) as { readAt: string | null };
    expectMatchesContract('markNotificationRead', 200, item);
    expect(item.readAt).not.toBeNull();
    const gone = await dismiss.POST(
      new Request(`${ORIGIN}/x`, { method: 'POST' }),
      params(first?.id as string),
    );
    expectMatchesContract('dismissNotification', 200, await gone.json());
    expect(
      ((await (await list()).json()) as { notifications: unknown[] }).notifications,
    ).toHaveLength(1);
    for (const id of ['o1', 'no-such-notification']) {
      const missing = await read.POST(new Request(`${ORIGIN}/x`, { method: 'POST' }), params(id));
      expect(missing.status, id).toBe(404);
      expectMatchesContract('markNotificationRead', 404, await missing.json());
    }
  });

  it('marks all read and dismisses all, of the app’s own, and says how many', async () => {
    await seed();
    const marked = await readAll.POST(new Request(`${ORIGIN}/x`, { method: 'POST' }));
    expect(await marked.json()).toEqual({ count: 2 });
    expectMatchesContract('markAllNotificationsRead', 200, { count: 2 });
    const cleared = await dismissAll.POST(new Request(`${ORIGIN}/x`, { method: 'POST' }));
    expect(await cleared.json()).toEqual({ count: 2 });
    // The other app's is still there.
    expect(
      Number(
        (
          await db.run(
            "select count(*) as n from notifications where client_id = 'other' and dismissed_at is null",
          )
        ).rows[0]?.n,
      ),
    ).toBe(1);
  });
});
