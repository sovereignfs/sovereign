import { beforeAll, describe, expect, it } from 'vitest';

beforeAll(() => {
  // Required env for getEnv(); :memory: keeps getDb() side-effect-free.
  process.env.AUTH_SECRET = 'test-secret';
  process.env.SOVEREIGN_ADMIN_KEY = 'test-admin-key';
  process.env.AUTH_DATABASE_URL = ':memory:';
});

describe('auth options', () => {
  it('disables the fresh-session gate (freshAge: 0) so /list-sessions never 403s on age', async () => {
    // Regression guard: better-auth's freshSessionMiddleware returns
    // 403 SESSION_NOT_FRESH for sessions older than freshAge (default 1 day),
    // which broke sdk.auth.listSessions for day-old sessions. Must stay 0.
    const { getAuthOptions } = await import('../auth');
    expect(getAuthOptions().session?.freshAge).toBe(0);
  });
});

describe('password reset config', () => {
  it('email+password auth is enabled', async () => {
    const { getAuthOptions } = await import('../auth');
    expect(getAuthOptions().emailAndPassword?.enabled).toBe(true);
  });

  it('sendResetPassword handler is configured', async () => {
    // Regression guard: if sendResetPassword is removed or renamed, the
    // forgot-password flow silently stops sending emails. Keep this wired.
    const { getAuthOptions } = await import('../auth');
    expect(typeof getAuthOptions().emailAndPassword?.sendResetPassword).toBe('function');
  });
});
