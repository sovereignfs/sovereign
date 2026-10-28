import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const APP_ROOT = path.join(import.meta.dirname, '../..');
const ORIGIN = 'http://localhost:3000';
let folder: string;

beforeAll(async () => {
  folder = mkdtempSync(path.join(tmpdir(), 'sv-authroute-'));
  vi.stubEnv('SV_URL', ORIGIN);
  vi.stubEnv('SV_AUTH_SECRET', 'a-secret-that-is-long-enough-to-pass-validation');
  vi.stubEnv('SV_AUTH_REQUIRE_EMAIL_VERIFICATION', 'false');
  vi.stubEnv('SV_DB_DIALECT', 'sqlite');
  vi.stubEnv('SV_SQLITE_URL', `file:${path.join(folder, 'core.db')}`);
  vi.spyOn(process, 'cwd').mockReturnValue(APP_ROOT);
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  const { migrateDatabaseOrExit } = await import('../startup');
  await migrateDatabaseOrExit();
});

afterAll(async () => {
  const { getDatabase } = await import('../database');
  await (await getDatabase()).close();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  rmSync(folder, { recursive: true, force: true });
});

const request = (pathname: string, init: RequestInit = {}) =>
  new Request(`${ORIGIN}/api/auth${pathname}`, {
    ...init,
    headers: { origin: ORIGIN, 'content-type': 'application/json', ...init.headers },
  });

describe('the /api/auth route', () => {
  it('serves better-auth on core’s own database, built from the environment', async () => {
    const { POST, GET } = await import('../../app/api/auth/[...all]/route');
    const signUp = await POST(
      request('/sign-up/email', {
        method: 'POST',
        body: JSON.stringify({
          name: 'Ada Lovelace',
          email: 'ada@example.com',
          password: 'correct horse battery',
        }),
      }),
    );
    expect(signUp.status).toBe(200);
    const cookie = signUp.headers
      .getSetCookie()
      .map((line) => line.split(';')[0])
      .join('; ');
    expect(cookie).toContain('better-auth.session_token=');

    const session = await GET(request('/get-session', { headers: { cookie } }));
    expect(session.status).toBe(200);
    expect(((await session.json()) as { user: { email: string } }).user.email).toBe(
      'ada@example.com',
    );
  });

  it('refuses a weak password with the reason', async () => {
    const { POST } = await import('../../app/api/auth/[...all]/route');
    const response = await POST(
      request('/sign-up/email', {
        method: 'POST',
        body: JSON.stringify({ name: 'Weak', email: 'weak@example.com', password: 'short' }),
      }),
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      code: 'PASSWORD_DOES_NOT_MEET_POLICY',
      message: expect.stringContaining('at least 8 characters'),
    });
  });

  it('is never cached', async () => {
    const route = await import('../../app/api/auth/[...all]/route');
    expect(route.dynamic).toBe('force-dynamic');
  });

  it('refuses a sign-up that needs email while email is not set up, which is how core starts by default', async () => {
    vi.stubEnv('SV_AUTH_REQUIRE_EMAIL_VERIFICATION', 'true');
    vi.resetModules();
    const { POST } = await import('../../app/api/auth/[...all]/route');
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const response = await POST(
      request('/sign-up/email', {
        method: 'POST',
        body: JSON.stringify({
          name: 'Ada',
          email: 'ada2@example.com',
          password: 'correct horse battery',
        }),
      }),
    );
    expect(response.status).toBe(503);
    expect(((await response.json()) as { code: string }).code).toBe('EMAIL_NOT_AVAILABLE');
  });
});
