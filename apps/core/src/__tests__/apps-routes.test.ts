import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api/errors';
import { expectMatchesContract } from './core-api-contract';

const APP_ROOT = path.join(import.meta.dirname, '../..');
const ORIGIN = 'http://localhost:3000';
let folder: string;

// The token check is the Core API's one (tested with a real provider elsewhere); here the guard says yes or no, and the scope it
// is asked for and what the route answers are under test. The launcher's list is `launcherApps`' (tested in launcher.test.ts).
const authenticate = vi.fn();
vi.mock('../api/token', async (original) => ({
  ...(await original<typeof import('../api/token')>()),
  authenticate: (...args: unknown[]) => authenticate(...args) as unknown,
}));
vi.mock('../directory/service', async (original) => ({
  ...(await original<typeof import('../directory/service')>()),
  getTokenDeps: () => Promise.resolve({}),
}));
const listed = vi.fn();
vi.mock('../clients', async (original) => ({
  ...(await original<typeof import('../clients')>()),
  getLauncherApps: () => listed() as unknown,
}));

type Db = Awaited<ReturnType<(typeof import('../database'))['getDatabase']>>;
let db: Db;
let route: typeof import('../../app/api/v1/apps/route');

beforeAll(async () => {
  folder = mkdtempSync(path.join(tmpdir(), 'sv-apps-routes-'));
  vi.stubEnv('SV_URL', ORIGIN);
  vi.stubEnv('SV_AUTH_SECRET', 'a-secret-that-is-long-enough-to-pass-validation');
  vi.stubEnv('SV_DB_DIALECT', 'sqlite');
  vi.stubEnv('SV_SQLITE_URL', `file:${path.join(folder, 'core.db')}`);
  vi.spyOn(process, 'cwd').mockReturnValue(APP_ROOT);
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  const { migrateDatabaseOrExit } = await import('../startup');
  await migrateDatabaseOrExit();
  db = await (await import('../database')).getDatabase();
  route = await import('../../app/api/v1/apps/route');
});
afterAll(async () => {
  await db.close();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  rmSync(folder, { recursive: true, force: true });
});

const APPS = [
  {
    id: 'notes',
    name: 'Notes',
    description: 'Write things down',
    icon: 'https://notes.sovereign.local/icon.png',
    launchUrl: 'https://notes.sovereign.local/',
  },
  {
    id: 'shopper',
    name: 'Shopper',
    description: undefined,
    icon: undefined,
    launchUrl: 'https://shopper.sovereign.local/',
  },
];

beforeEach(async () => {
  for (const table of ['rate_limits', 'capability_overrides', 'users'])
    await db.run(`delete from ${table}`);
  (await import('../roles/matrix')).invalidateCapabilityMatrix();
  for (const [id, role] of [
    ['ada', 'platform:user'],
    ['root', 'platform:admin'],
  ] as const) {
    await db.run(
      `insert into users (id, name, email, email_verified, role, created_at, updated_at) values (?, ?, ?, 1, ?, 1, 1)`,
      [id, id, `${id}@sovereign.local`, role],
    );
  }
  authenticate
    .mockReset()
    .mockResolvedValue({ userId: 'ada', clientId: 'shopper', scopes: ['openid'] });
  listed.mockReset().mockResolvedValue(APPS);
});

const getApps = () => route.GET(new Request(`${ORIGIN}/api/v1/apps`));

describe('the apps a person can open (core-app §3.8)', () => {
  it('asks for a person’s token with openid, and no scope of its own, first', async () => {
    await getApps();
    expect(authenticate).toHaveBeenCalledWith({}, expect.any(Request), 'openid');
    authenticate.mockRejectedValue(new ApiError(401, 'invalid_token', 'no'));
    const refused = await getApps();
    expect(refused.status).toBe(401);
    expect(listed).toHaveBeenCalledTimes(1);
  });

  it('answers the launcher’s tiles, with only a tile’s fields, as the contract has it', async () => {
    const reply = await getApps();
    expect(reply.status).toBe(200);
    const body = (await reply.json()) as { apps: Record<string, unknown>[] };
    expectMatchesContract('listMyApps', 200, body);
    expect(body.apps).toEqual([
      APPS[0],
      {
        id: 'shopper',
        name: 'Shopper',
        description: null,
        icon: null,
        launchUrl: 'https://shopper.sovereign.local/',
      },
    ]);
  });

  it('answers nothing for a person whose role may not use the launcher in the matrix in force, judged by the account', async () => {
    await db.run(
      "insert into capability_overrides (role, capability, granted, updated_at) values ('platform:user', 'launcher:access', 0, 1)",
    );
    (await import('../roles/matrix')).invalidateCapabilityMatrix();
    expect(await (await getApps()).json()).toEqual({ apps: [] });
    // The same token's app, for a person whose role still may: the role is the account's, not the token's or the request's.
    authenticate.mockResolvedValue({ userId: 'root', clientId: 'shopper', scopes: ['openid'] });
    expect(((await (await getApps()).json()) as { apps: unknown[] }).apps).toHaveLength(2);
  });

  it('slows a person down past their limit', async () => {
    let last = await getApps();
    for (let i = 0; i < 60; i += 1) last = await getApps();
    expect(last.status).toBe(429);
    expectMatchesContract('listMyApps', 429, await last.json());
    expect(last.headers.get('retry-after')).toBeTruthy();
  });
});
