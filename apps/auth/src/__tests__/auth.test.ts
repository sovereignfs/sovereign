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
  // Explicit 15s timeout: this is the first test in the file to import
  // ../auth, so it pays the full cold-import cost of better-auth's own
  // plugin graph (better-auth, @better-auth/passkey,
  // @better-auth/oauth-provider, @sovereignfs/mailer, …) — measured at
  // ~8.5s standalone (well past vitest's 5000ms default), with no single
  // slow culprit, just cumulative cold-parse/transform weight across
  // several sizable packages. Every other test in this file imports the
  // same already-cached module and is effectively instant, so this timeout
  // is scoped to just this one test, not the whole suite.
  it('disables the fresh-session gate (freshAge: 0) so /list-sessions never 403s on age', async () => {
    // Regression guard: better-auth's freshSessionMiddleware returns
    // 403 SESSION_NOT_FRESH for sessions older than freshAge (default 1 day),
    // which broke sdk.auth.listSessions for day-old sessions. Must stay 0.
    const { getAuthOptions } = await import('../auth');
    expect(getAuthOptions().session?.freshAge).toBe(0);
  }, 15_000);
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

describe('progressive verification config (RFC 0035, workstream 0017 leg 1)', () => {
  it('registers verificationLevel and verificationEvents as non-input additionalFields', async () => {
    const { getAuthOptions } = await import('../auth');
    const level = getAuthOptions().user?.additionalFields?.verificationLevel;
    expect(level?.type).toBe('number');
    expect(level?.input).toBe(false);
    expect(level?.defaultValue).toBe(0);

    const events = getAuthOptions().user?.additionalFields?.verificationEvents;
    expect(events?.type).toBe('string');
    expect(events?.input).toBe(false);
  });

  it('registers a user.update.after databaseHook for the self-healing recompute', async () => {
    const { getAuthOptions } = await import('../auth');
    expect(typeof getAuthOptions().databaseHooks?.user?.update?.after).toBe('function');
  });

  it('registers a top-level hooks.after for the passkey create/delete paths', async () => {
    const { getAuthOptions } = await import('../auth');
    expect(typeof getAuthOptions().hooks?.after).toBe('function');
  });
});

describe('password policy config', () => {
  it('minPasswordLength defaults to 8 (AUTH_PASSWORD_MIN_LENGTH unset)', async () => {
    const { getAuthOptions } = await import('../auth');
    expect(getAuthOptions().emailAndPassword?.minPasswordLength).toBe(8);
  });

  it('registers a top-level hooks.before enforcing password complexity', async () => {
    const { getAuthOptions } = await import('../auth');
    expect(typeof getAuthOptions().hooks?.before).toBe('function');
  });
});

describe('email enumeration safety (registration)', () => {
  // Regression guard for the config precondition that makes better-auth's
  // own sign-up endpoint take its generic-duplicate-response branch (hash
  // the password anyway, return a synthetic { token: null, user } instead of
  // throwing USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL) — see the doc comment on
  // requireEmailVerification in env.ts for the full mechanism. Both must
  // hold: requireEmailVerification true (or autoSignIn false, which this
  // repo never sets).
  it('requireEmailVerification defaults to true and autoSignIn stays true', async () => {
    const { getAuthOptions } = await import('../auth');
    expect(getAuthOptions().emailAndPassword?.requireEmailVerification).toBe(true);
    expect(getAuthOptions().emailAndPassword?.autoSignIn).toBe(true);
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

describe('registration terms acceptance (GDPR-8, workstream 0021 leg 6)', () => {
  it('registers agreedToTerms as a client-input additionalField with a false default (not schema-required — see auth.ts for why)', async () => {
    const { getAuthOptions } = await import('../auth');
    const field = getAuthOptions().user?.additionalFields?.agreedToTerms;
    expect(field?.type).toBe('boolean');
    expect(field?.required).toBe(false);
    expect(field?.defaultValue).toBe(false);
    expect(field?.input).toBe(true);
  });

  it('registers policyAcceptedHash/policyAcceptedAt as server-only (non-input) additionalFields', async () => {
    const { getAuthOptions } = await import('../auth');
    const hash = getAuthOptions().user?.additionalFields?.policyAcceptedHash;
    expect(hash?.type).toBe('string');
    expect(hash?.input).toBe(false);

    const at = getAuthOptions().user?.additionalFields?.policyAcceptedAt;
    expect(at?.type).toBe('number');
    expect(at?.input).toBe(false);
  });
});
