import { Client } from 'pg';
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

/**
 * This suite runs in its own DATABASE (not just the sovereign_auth schema)
 * carved out of the same Postgres server TEST_DATABASE_URL points at.
 * better-auth's getMigrations() introspects every schema in the connected
 * database via kysely's PostgresIntrospector — while packages/db's .pg tests
 * concurrently churn throwaway schemas (`DROP SCHEMA … CASCADE` per test) in
 * the shared TEST_DATABASE_URL database. A table the introspector saw in the
 * catalog can vanish mid-introspection, failing runAuthMigrations() with
 * `relation "<other test's schema>.<table>" does not exist` — found live
 * running the full suite; reproduced only under cross-file parallelism.
 * Production has no analogue (nothing drops schemas concurrently with auth
 * boot), so isolation belongs here in the test, not in the product code.
 */
async function dedicatedAuthTestDbUrl(baseUrl: string): Promise<string> {
  const url = new URL(baseUrl);
  const dbName = 'sovereign_test_auth';
  const admin = new Client({ connectionString: baseUrl });
  await admin.connect();
  try {
    await admin.query(`CREATE DATABASE ${dbName}`);
  } catch (err) {
    // 42P04 duplicate_database — fine, an earlier run created it.
    if ((err as { code?: string }).code !== '42P04') throw err;
  } finally {
    await admin.end();
  }
  url.pathname = `/${dbName}`;
  return url.toString();
}

describe.skipIf(!PG_URL)('auth server on Postgres', () => {
  beforeAll(async () => {
    process.env.POSTGRES_DB_URL = await dedicatedAuthTestDbUrl(PG_URL as string);
    process.env.DB_DIALECT = 'postgres';
    process.env.AUTH_SECRET ??= 'test-secret-test-secret-test-secret';
    process.env.SOVEREIGN_ADMIN_KEY ??= 'test-admin-key';
    process.env.AUTH_INVITE_ONLY = 'false';

    const { provisionAuthStore, authRun } = await import('../db');
    await provisionAuthStore();
    // Clean slate: better-auth's tables + our own, inside the auth schema.
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

  it('makes the first registered user a platform owner (create hook)', async () => {
    const { getAuth } = await import('../auth');
    const auth = getAuth();
    // signUpEmail's body type comes from ReturnType<typeof betterAuth>, which
    // doesn't carry buildOptions()'s additionalFields at the type level — a
    // named const (not an inline literal) sidesteps the resulting excess-
    // property check while keeping the base fields fully type-checked.
    const adminBody = {
      email: 'admin@example.com',
      password: 'sup3rsecret!',
      name: 'Admin',
      agreedToTerms: true,
    };
    await auth.api.signUpEmail({ body: adminBody });
    const bobBody = {
      email: 'bob@example.com',
      password: 'sup3rsecret!',
      name: 'Bob',
      agreedToTerms: true,
    };
    await auth.api.signUpEmail({ body: bobBody });

    // The quoted "user" query (reserved word + camelCase column) must work, and
    // `active`/`createdAt` come back as boolean/Date on Postgres.
    const { authAll } = await import('../db');
    const rows = await authAll<{ email: string; role: string; active: unknown }>(
      'SELECT id, email, name, role, active, "createdAt" FROM "user" ORDER BY "createdAt" ASC',
    );
    expect(rows.map((r) => [r.email, r.role])).toEqual([
      ['admin@example.com', 'platform:owner'],
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
