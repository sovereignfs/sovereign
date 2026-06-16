import { beforeAll, describe, expect, it } from 'vitest';

/**
 * Live Postgres parity for the auth server. Skipped unless TEST_DATABASE_URL
 * points at a Postgres instance (the default `pnpm test` stays Docker-free).
 * CI wires a Postgres service in Task 0.5.07.
 *
 *   TEST_DATABASE_URL=postgres://user:pass@localhost:5432/db pnpm test
 *
 * Exercises the riskiest dialect divergences: better-auth migrating + signing
 * up against Postgres, the quoted `"user"` query (reserved word + camelCase
 * columns), the bigint-as-string COUNT in the create hook, and our own
 * invites/auth_settings tables via the query helpers.
 */
const PG_URL = process.env.TEST_DATABASE_URL;

describe.skipIf(!PG_URL)('auth server on Postgres', () => {
  beforeAll(async () => {
    process.env.AUTH_DATABASE_URL = PG_URL;
    process.env.AUTH_SECRET ??= 'test-secret-test-secret-test-secret';
    process.env.SOVEREIGN_ADMIN_KEY ??= 'test-admin-key';
    process.env.AUTH_INVITE_ONLY = 'false';

    const { authRun } = await import('../db');
    // Clean slate: better-auth's tables + our own.
    await authRun(
      'DROP TABLE IF EXISTS "user", session, account, verification, invites, auth_settings CASCADE',
    );

    const { runAuthMigrations } = await import('../migrate');
    await runAuthMigrations();
  });

  it('infers the postgres dialect from the URL', async () => {
    const { getAuthDialect } = await import('../db');
    expect(getAuthDialect()).toBe('postgres');
  });

  it('makes the first registered user a platform admin (create hook)', async () => {
    const { getAuth } = await import('../auth');
    const auth = getAuth();
    await auth.api.signUpEmail({
      body: { email: 'admin@example.com', password: 'sup3rsecret!', name: 'Admin' },
    });
    await auth.api.signUpEmail({
      body: { email: 'bob@example.com', password: 'sup3rsecret!', name: 'Bob' },
    });

    // The quoted "user" query (reserved word + camelCase column) must work, and
    // `active`/`createdAt` come back as boolean/Date on Postgres.
    const { authAll } = await import('../db');
    const rows = await authAll<{ email: string; role: string; active: unknown }>(
      'SELECT id, email, name, role, active, "createdAt" FROM "user" ORDER BY "createdAt" ASC',
    );
    expect(rows.map((r) => [r.email, r.role])).toEqual([
      ['admin@example.com', 'platform:admin'],
      ['bob@example.com', 'platform:user'],
    ]);
    expect(typeof rows[0]?.active).toBe('boolean');
  });

  it('round-trips the invite-only setting and an invite', async () => {
    const { readInviteOnlySetting, writeInviteOnlySetting } = await import('../settings');
    expect(await readInviteOnlySetting()).toBeNull();
    await writeInviteOnlySetting(true);
    await writeInviteOnlySetting(false);
    expect(await readInviteOnlySetting()).toBe('false');

    const { authRun, authGet } = await import('../db');
    await authRun(
      'INSERT INTO invites (token, email, created_at, expires_at) VALUES (?, ?, ?, ?)',
      ['tok-1', 'carol@example.com', Math.floor(Date.now() / 1000), null],
    );
    const invite = await authGet<{ email: string }>('SELECT email FROM invites WHERE token = ?', [
      'tok-1',
    ]);
    expect(invite?.email).toBe('carol@example.com');
  });
});
