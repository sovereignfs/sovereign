import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api/errors';

const APP_ROOT = path.join(import.meta.dirname, '../..');
let folder: string;

const authenticate = vi.fn();
vi.mock('../api/token', () => ({
  authenticate: (...args: unknown[]) => authenticate(...args) as unknown,
}));
vi.mock('../auth', () => ({
  getAuth: () => Promise.resolve({ api: { getJwks: () => ({ keys: [] }) } }),
}));

type Db = Awaited<ReturnType<(typeof import('../database'))['getDatabase']>>;
let db: Db;
let service: typeof import('../directory/service');

beforeAll(async () => {
  folder = mkdtempSync(path.join(tmpdir(), 'sv-directory-guard-'));
  vi.stubEnv('SV_URL', 'http://localhost:3000');
  vi.stubEnv('SV_AUTH_SECRET', 'a-secret-that-is-long-enough-to-pass-validation');
  vi.stubEnv('SV_DB_DIALECT', 'sqlite');
  vi.stubEnv('SV_SQLITE_URL', `file:${path.join(folder, 'core.db')}`);
  vi.spyOn(process, 'cwd').mockReturnValue(APP_ROOT);
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  const { migrateDatabaseOrExit } = await import('../startup');
  await migrateDatabaseOrExit();
  db = await (await import('../database')).getDatabase();
  service = await import('../directory/service');
});
afterAll(async () => {
  await db.close();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  rmSync(folder, { recursive: true, force: true });
});
beforeEach(async () => {
  await db.run('delete from rate_limits');
  authenticate.mockReset();
});

const request = new Request('http://localhost:3000/api/v1/directory/users?q=a');
const as = (userId: string, clientId: string) =>
  authenticate.mockResolvedValue({ userId, clientId, scopes: ['directory'] });
const LIMITS = { perClient: 3, perAccount: 2, windowMs: 60_000 } as const;
const refusal = async (run: () => Promise<unknown>) => {
  try {
    await run();
  } catch (error) {
    return error as ApiError;
  }
  return undefined;
};
const counted = async () =>
  Number((await db.run('select count(*) as n from rate_limits')).rows[0]?.n);

describe('the Directory API’s guard', () => {
  it('asks for the directory scope, and lets a good call through with who it is for', async () => {
    as('ada', 'app');
    expect(await service.directoryGuard(request, LIMITS)).toEqual({
      userId: 'ada',
      clientId: 'app',
      scopes: ['directory'],
    });
    expect(authenticate.mock.calls[0]?.[2]).toBe('directory');
  });

  it('allows what the limits allow, then refuses with how long to wait, as the contract says', async () => {
    as('ada', 'app');
    await service.directoryGuard(request, LIMITS);
    await service.directoryGuard(request, LIMITS);
    const error = await refusal(() => service.directoryGuard(request, LIMITS));
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 429, code: 'rate_limited' });
    expect(Number(error?.headers['retry-after'])).toBeGreaterThan(0);
    expect(Number(error?.headers['retry-after'])).toBeLessThanOrEqual(60);
  });

  it('limits an app across all its people, so one app cannot use up another’s allowance', async () => {
    for (const person of ['a', 'b', 'c']) {
      as(person, 'busy');
      await service.directoryGuard(request, LIMITS);
    }
    as('d', 'busy');
    expect(await refusal(() => service.directoryGuard(request, LIMITS))).toMatchObject({
      status: 429,
    });
    as('d', 'quiet');
    expect(await service.directoryGuard(request, LIMITS)).toMatchObject({ clientId: 'quiet' });
  });

  it('limits a person across all the apps they use', async () => {
    as('ada', 'one');
    await service.directoryGuard(request, LIMITS);
    as('ada', 'two');
    await service.directoryGuard(request, LIMITS);
    as('ada', 'three');
    expect(await refusal(() => service.directoryGuard(request, LIMITS))).toMatchObject({
      status: 429,
    });
    as('bo', 'three');
    expect(await service.directoryGuard(request, LIMITS)).toMatchObject({ userId: 'bo' });
  });

  it('does not count a call whose token is bad, so it cannot use up a real caller’s allowance', async () => {
    authenticate.mockRejectedValue(
      new ApiError(401, 'invalid_token', 'The access token is not valid.'),
    );
    for (let i = 0; i < 10; i++) {
      expect(await refusal(() => service.directoryGuard(request, LIMITS))).toMatchObject({
        status: 401,
      });
    }
    expect(await counted()).toBe(0);
  });

  it('allows a reasonable amount by default: a minute’s window, more for an app than for one person', () => {
    expect(service.DIRECTORY_LIMITS.windowMs).toBe(60_000);
    expect(service.DIRECTORY_LIMITS.perClient).toBeGreaterThan(service.DIRECTORY_LIMITS.perAccount);
    expect(service.DIRECTORY_LIMITS.perAccount).toBeGreaterThanOrEqual(60);
  });

  it('turns an ApiError into the contract’s answer, and lets anything else through', async () => {
    const reply = await service.answer(() =>
      Promise.reject(new ApiError(404, 'not_found', 'Nothing there.')),
    );
    expect(reply.status).toBe(404);
    expect(await reply.json()).toEqual({ error: 'not_found', message: 'Nothing there.' });
    await expect(service.answer(() => Promise.reject(new Error('boom')))).rejects.toThrow('boom');
  });
});
