import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { expectMatchesContract } from './core-api-contract';

const APP_ROOT = path.join(import.meta.dirname, '../..');
const ORIGIN = 'http://localhost:3000';
let folder: string;

// The guard only says who is calling (app-tokens.suite.ts tests it with a real provider): what an instance with no mail does is under test.
vi.mock('../mail/api', async (original) => ({
  ...(await original<typeof import('../mail/api')>()),
  emailGuard: () => Promise.resolve({ clientId: 'app', scopes: ['email:send'] }),
}));

type Db = Awaited<ReturnType<(typeof import('../database'))['getDatabase']>>;
let db: Db;
let route: typeof import('../../app/api/v1/email/route');
let instance: typeof import('../../app/.well-known/sovereign-instance/route');

beforeAll(async () => {
  folder = mkdtempSync(path.join(tmpdir(), 'sv-email-nomail-'));
  vi.stubEnv('SV_URL', ORIGIN);
  vi.stubEnv('SV_AUTH_SECRET', 'a-secret-that-is-long-enough-to-pass-validation');
  vi.stubEnv('SV_DB_DIALECT', 'sqlite');
  vi.stubEnv('SV_SQLITE_URL', `file:${path.join(folder, 'core.db')}`);
  vi.spyOn(process, 'cwd').mockReturnValue(APP_ROOT);
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  const { migrateDatabaseOrExit } = await import('../startup');
  await migrateDatabaseOrExit();
  db = await (await import('../database')).getDatabase();
  route = await import('../../app/api/v1/email/route');
  instance = await import('../../app/.well-known/sovereign-instance/route');
});
afterAll(async () => {
  await db.close();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  rmSync(folder, { recursive: true, force: true });
});

describe('an instance with no mail server', () => {
  it('does not list email, so an app can tell no mail from a failure', async () => {
    const reply = await instance.GET(new Request(`${ORIGIN}/.well-known/sovereign-instance`));
    const body = (await reply.json()) as { api: { capabilities: string[] } };
    expect(body.api.capabilities).toEqual(['directory', 'notifications', 'activity']);
    expectMatchesContract('getInstanceBranding', 200, body);
  });

  it('has no email operation: a send is a 404 that matches the contract, and counts nothing', async () => {
    const reply = await route.POST(
      new Request(`${ORIGIN}/api/v1/email`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ to: 'ada', subject: 'x', body: 'y' }),
      }),
    );
    expect(reply.status).toBe(404);
    expectMatchesContract('sendEmail', 404, await reply.json());
    const counted = await db.run("select count(*) as n from rate_limits where key like 'mail-%'");
    expect(Number(counted.rows[0]?.n)).toBe(0);
  });
});
