import { beforeAll, describe, expect, it } from 'vitest';

beforeAll(() => {
  // Required env for getEnv(). DB_DIALECT=sqlite only constructs a lazy sqld
  // client (no connection attempt) — getAuthOptions() never issues a query,
  // so this stays side-effect-free without needing a live sqld instance.
  process.env.AUTH_SECRET = 'test-secret';
  process.env.SOVEREIGN_ADMIN_KEY = 'test-admin-key';
  process.env.DB_DIALECT = 'sqlite';
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

describe('email verification config', () => {
  it('requireEmailVerification defaults to true (AUTH_REQUIRE_EMAIL_VERIFICATION unset)', async () => {
    const { getAuthOptions } = await import('../auth');
    expect(getAuthOptions().emailAndPassword?.requireEmailVerification).toBe(true);
  });

  it('sendVerificationEmail handler is configured', async () => {
    // Regression guard: requireEmailVerification with no sendVerificationEmail
    // permanently locks out unverified users with no resend path.
    const { getAuthOptions } = await import('../auth');
    expect(typeof getAuthOptions().emailVerification?.sendVerificationEmail).toBe('function');
  });

  it('auto signs in after verification', async () => {
    const { getAuthOptions } = await import('../auth');
    expect(getAuthOptions().emailVerification?.autoSignInAfterVerification).toBe(true);
  });
});

describe('registration timezone field (Task 1.20)', () => {
  it('registers the timezone additionalField as client-input', async () => {
    const { getAuthOptions } = await import('../auth');
    const tz = getAuthOptions().user?.additionalFields?.timezone;
    expect(tz?.type).toBe('string');
    expect(tz?.input).toBe(true);
  });

  it('isValidTimezone accepts a real IANA zone and rejects garbage', async () => {
    const { isValidTimezone } = await import('../timezone');
    expect(isValidTimezone('Europe/Berlin')).toBe(true);
    expect(isValidTimezone('UTC')).toBe(true);
    expect(isValidTimezone('Not/A-Timezone')).toBe(false);
    expect(isValidTimezone('')).toBe(false);
    expect(isValidTimezone(null)).toBe(false);
    expect(isValidTimezone(undefined)).toBe(false);
  });
});
