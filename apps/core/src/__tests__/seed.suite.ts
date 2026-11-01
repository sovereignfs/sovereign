/**
 * The development seed (src/dev/seed.ts) against a real database: it makes an owner, an admin and an ordinary person
 * through core's own sign-up, they can sign in, running it again changes nothing, and it will not run for an
 * address that is not on this machine. One suite, run on SQLite by `seed.test.ts` and on the CI legs' dialect by
 * `seed.db.test.ts`.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Database } from '@sovereignfs/database';
import type { TestDatabase } from '@sovereignfs/database/testing';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ROLE_ADMIN, ROLE_OWNER, ROLE_USER } from '../auth/roles';
import { migrateCore } from '../db/migrate';
import {
  DEFAULT_SEED_PASSWORD,
  SEED_ACCOUNTS,
  SeedError,
  isLocalAddress,
  seedAccounts,
} from '../dev/seed';
import { BASE_URL, INVITE_ONLY, Jar, call, makeAuth } from './auth-harness';

const MIGRATIONS = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../migrations');
const TABLES = ['invites', 'rate_limits', 'sessions', 'accounts', 'verifications', 'users'];

export function seedSuite(createDatabase: () => Promise<TestDatabase>): void {
  let target: TestDatabase;
  let db: Database;

  beforeAll(async () => {
    target = await createDatabase();
    db = await target.open();
    await migrateCore(db, MIGRATIONS);
  });
  afterAll(async () => {
    await db.close().catch(() => undefined);
    await target.cleanup();
  });
  beforeEach(async () => {
    for (const table of TABLES) await db.run(`delete from ${table}`);
  });

  const roles = async () =>
    Object.fromEntries(
      (await db.run('select email, role, email_verified from users')).rows.map((row) => [
        String(row.email),
        {
          role: String(row.role),
          verified: row.email_verified === true || Number(row.email_verified) === 1,
        },
      ]),
    );

  it('makes the owner, an admin and an ordinary person, each verified, on an empty instance', async () => {
    const result = await seedAccounts({
      auth: makeAuth(db, {}, INVITE_ONLY),
      database: db,
      baseUrl: BASE_URL,
    });
    expect(result).toEqual({ created: SEED_ACCOUNTS.map((a) => a.email), existing: [] });
    expect(await roles()).toEqual({
      'owner@sovereign.local': { role: ROLE_OWNER, verified: true },
      'admin@sovereign.local': { role: ROLE_ADMIN, verified: true },
      'user@sovereign.local': { role: ROLE_USER, verified: true },
    });
  });

  it('works on an instance where sign-up is by invitation, which is the default', async () => {
    await seedAccounts({ auth: makeAuth(db, {}, INVITE_ONLY), database: db, baseUrl: BASE_URL });
    expect(Object.keys(await roles())).toHaveLength(3);
    // The invitations it made were used, not left lying about to be passed on.
    const open = await db.run('select count(*) as n from invites where accepted_at is null');
    expect(Number(open.rows[0]?.n)).toBe(0);
  });

  it('lets each of them sign in with the password, and no other', async () => {
    const auth = makeAuth(db, {}, INVITE_ONLY);
    await seedAccounts({ auth, database: db, baseUrl: BASE_URL }, 'a-password-for-the-test');
    for (const account of SEED_ACCOUNTS) {
      const reply = await call(auth, 'POST', '/sign-in/email', {
        jar: new Jar(),
        body: { email: account.email, password: 'a-password-for-the-test' },
      });
      expect(reply.status, account.email).toBe(200);
    }
    const wrong = await call(auth, 'POST', '/sign-in/email', {
      jar: new Jar(),
      body: { email: SEED_ACCOUNTS[0]?.email, password: DEFAULT_SEED_PASSWORD },
    });
    expect(wrong.status).toBeGreaterThanOrEqual(400);
  });

  it('leaves what is there when it is run again, and makes only what is missing', async () => {
    const deps = { auth: makeAuth(db, {}, INVITE_ONLY), database: db, baseUrl: BASE_URL };
    await seedAccounts(deps);
    expect(await seedAccounts(deps)).toEqual({
      created: [],
      existing: SEED_ACCOUNTS.map((a) => a.email),
    });
    await db.run(
      "delete from sessions where user_id in (select id from users where email = 'user@sovereign.local')",
    );
    await db.run(
      "delete from accounts where user_id in (select id from users where email = 'user@sovereign.local')",
    );
    await db.run("delete from users where email = 'user@sovereign.local'");
    expect(await seedAccounts(deps)).toEqual({
      created: ['user@sovereign.local'],
      existing: ['owner@sovereign.local', 'admin@sovereign.local'],
    });
  });

  it('will not run for an address that is not on this machine', async () => {
    for (const baseUrl of [
      'https://core.sovereign.local',
      'http://192.168.1.5:3000',
      'https://localhost.sovereign.local',
    ]) {
      await expect(
        seedAccounts({ auth: makeAuth(db, {}, INVITE_ONLY), database: db, baseUrl }),
      ).rejects.toThrow(SeedError);
    }
    expect(Object.keys(await roles())).toHaveLength(0);
  });

  it('will not make an admin first, since the first account is the owner', async () => {
    await expect(
      seedAccounts(
        { auth: makeAuth(db, {}, INVITE_ONLY), database: db, baseUrl: BASE_URL },
        'pw-for-the-test',
        [{ name: 'Ada', email: 'a@sovereign.local', role: ROLE_ADMIN }],
      ),
    ).rejects.toThrow(/owner must come first/);
  });

  it('knows an address on this machine from one that is not', () => {
    for (const local of [
      'http://localhost:3000',
      'https://core.localhost',
      'http://127.0.0.1:3000',
      'http://[::1]:3000',
    ]) {
      expect(isLocalAddress(local), local).toBe(true);
    }
    for (const other of [
      'https://core.sovereign.local',
      'http://localhost.sovereign.local',
      'http://10.0.0.1',
      'localhost',
      '',
    ]) {
      expect(isLocalAddress(other), other).toBe(false);
    }
  });
}

describe('the seed', () => {
  // The suite is run from seed.test.ts and seed.db.test.ts.
  it('is listed for what it makes', () => {
    expect(SEED_ACCOUNTS.map((a) => a.role)).toEqual([ROLE_OWNER, ROLE_ADMIN, ROLE_USER]);
  });
});
