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
// is asked for and what the routes answer are under test.
const authenticate = vi.fn();
vi.mock('../api/token', async (original) => ({
  ...(await original<typeof import('../api/token')>()),
  authenticate: (...args: unknown[]) => authenticate(...args) as unknown,
}));
vi.mock('../directory/service', async (original) => ({
  ...(await original<typeof import('../directory/service')>()),
  getTokenDeps: () => Promise.resolve({}),
}));

type Db = Awaited<ReturnType<(typeof import('../database'))['getDatabase']>>;
let db: Db;
let me: typeof import('../../app/api/v1/keys/me/route');
let people: typeof import('../../app/api/v1/keys/people/[sub]/route');

const KEY = (n: number) => Buffer.alloc(32, n).toString('base64url');
const WRAP = (tag: string) => ({ suite: 1, nonce: `n-${tag}`, ciphertext: `c-${tag}` });
const SIGNATURE = 'S'.repeat(86);

beforeAll(async () => {
  folder = mkdtempSync(path.join(tmpdir(), 'sv-keys-routes-'));
  vi.stubEnv('SV_URL', ORIGIN);
  vi.stubEnv('SV_AUTH_SECRET', 'a-secret-that-is-long-enough-to-pass-validation');
  vi.stubEnv('SV_DB_DIALECT', 'sqlite');
  vi.stubEnv('SV_SQLITE_URL', `file:${path.join(folder, 'core.db')}`);
  vi.spyOn(process, 'cwd').mockReturnValue(APP_ROOT);
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  const { migrateDatabaseOrExit } = await import('../startup');
  await migrateDatabaseOrExit();
  db = await (await import('../database')).getDatabase();
  me = await import('../../app/api/v1/keys/me/route');
  people = await import('../../app/api/v1/keys/people/[sub]/route');
});
afterAll(async () => {
  await db.close();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  rmSync(folder, { recursive: true, force: true });
});

async function person(id: string, apps: string[], deactivated = false) {
  await db.run(
    `insert into users (id, name, email, email_verified, role, created_at, updated_at, deactivated_at) values (?, ?, ?, 1, 'platform:user', 1, 1, ?)`,
    [id, id, `${id}@sovereign.local`, deactivated ? 1 : null],
  );
  await db.run(
    'insert into key_accounts (user_id, suite, unlock_salt, signing_public, signing_private, kit_confirmed, created_at) values (?, 1, ?, ?, ?, 1, 1)',
    [id, KEY(1), KEY(id.length + 10), JSON.stringify(WRAP('account-signing'))],
  );
  for (const app of apps) {
    const identity = {
      receive: { publicKey: KEY(20), privateKey: WRAP(`${id}-${app}-receive`) },
      sign: { publicKey: KEY(21), privateKey: WRAP(`${id}-${app}-sign`) },
    };
    await db.run(
      'insert into key_apps (user_id, client_id, app_key, identity, signature, created_at) values (?, ?, ?, ?, ?, 1)',
      [id, app, JSON.stringify(WRAP('app-key-SECRET')), JSON.stringify(identity), SIGNATURE],
    );
  }
}

beforeEach(async () => {
  for (const table of ['key_apps', 'key_accounts', 'rate_limits', 'users'])
    await db.run(`delete from ${table}`);
  await person('ada', ['notes']);
  await person('grace', ['notes', 'mail']);
  await person('linus', ['mail']);
  await person('gone', ['notes'], true);
  authenticate
    .mockReset()
    .mockResolvedValue({ userId: 'ada', clientId: 'notes', scopes: ['keys'] });
});

const getMe = () => me.GET(new Request(`${ORIGIN}/api/v1/keys/me`));
const getPerson = (sub: string) =>
  people.GET(new Request(`${ORIGIN}/api/v1/keys/people/${encodeURIComponent(sub)}`), {
    params: Promise.resolve({ sub }),
  });

describe('the key calls (core-app §5.7)', () => {
  it('ask for a token with the keys scope, first', async () => {
    await getMe();
    expect(authenticate).toHaveBeenCalledWith({}, expect.any(Request), 'keys');
    authenticate.mockRejectedValue(new ApiError(403, 'insufficient_scope', 'no'));
    expect((await getMe()).status).toBe(403);
    expect((await getPerson('grace')).status).toBe(403);
  });

  it('give the caller their own keys for the token’s app, with the private halves wrapped, as the contract has it', async () => {
    const reply = await getMe();
    expect(reply.status).toBe(200);
    const body = (await reply.json()) as Record<string, unknown>;
    expectMatchesContract('getMyKeys', 200, body);
    expect(body).toMatchObject({
      sub: 'ada',
      receivingKey: KEY(20),
      signingKey: KEY(21),
      signature: SIGNATURE,
      wrapped: { receive: WRAP('ada-notes-receive'), sign: WRAP('ada-notes-sign') },
    });
    // The app key itself never leaves: it is the app's page's alone.
    expect(JSON.stringify(body)).not.toContain('app-key-SECRET');
  });

  it('give another person’s public keys only, for the token’s app', async () => {
    const reply = await getPerson('grace');
    expect(reply.status).toBe(200);
    const body = (await reply.json()) as Record<string, unknown>;
    expectMatchesContract('getPersonKeys', 200, body);
    expect(Object.keys(body).sort()).toEqual(
      ['accountSigningKey', 'receivingKey', 'signature', 'signingKey', 'sub'].sort(),
    );
    expect(JSON.stringify(body)).not.toMatch(/SECRET|nonce|ciphertext/);
  });

  it('answer 404, the same way, for someone who has not opened the app, is deactivated, or does not exist', async () => {
    for (const sub of ['linus', 'gone', 'nobody']) {
      const reply = await getPerson(sub);
      expect(reply.status).toBe(404);
      expectMatchesContract('getPersonKeys', 404, await reply.json());
    }
    authenticate.mockResolvedValue({ userId: 'linus', clientId: 'notes', scopes: ['keys'] });
    expect((await getMe()).status).toBe(404);
  });

  it('never give another app’s keys, whatever is asked', async () => {
    authenticate.mockResolvedValue({ userId: 'ada', clientId: 'mail', scopes: ['keys'] });
    expect((await getMe()).status).toBe(404);
    const reply = await getPerson('grace');
    expect(((await reply.json()) as { signingKey: string }).signingKey).toBe(KEY(21));
  });
});
