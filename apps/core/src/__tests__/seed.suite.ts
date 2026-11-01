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
  SEED_APP_KEY,
  SeedError,
  generatePassword,
  isLocalAddress,
  sampleApp,
  sampleRedirect,
  seedAccounts,
  seedInstance,
} from '../dev/seed';
import { passwordProblems } from '../auth/password-policy';
import { urlProblem } from '../clients/validate';
import type { RegisterInput } from '../clients/registry';
import type { SystemActor } from '../clients/system-actor';
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
    expect(result).toMatchObject({ created: SEED_ACCOUNTS.map((a) => a.email), existing: [] });
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
      passwords: {},
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
      passwords: { 'user@sovereign.local': DEFAULT_SEED_PASSWORD },
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
  describe('seeding an instance', () => {
    const actor = {} as SystemActor;
    /** Stands in for the registry, which has its own suite: what matters here is what is asked of it, and whether it is asked. */
    const fakeRegistry = () => {
      const calls: { key: string; input: RegisterInput }[] = [];
      return {
        calls,
        ensure: (_actor: unknown, key: string, input: RegisterInput) => {
          calls.push({ key, input });
          return Promise.resolve({
            client: { clientId: 'sample-client' },
            secret: undefined,
            created: calls.length === 1,
          });
        },
      };
    };
    const seed = (
      environment: string,
      registry = fakeRegistry(),
      extra: Partial<Parameters<typeof seedInstance>[0]> = {},
    ) =>
      seedInstance({
        auth: makeAuth(db, {}, INVITE_ONLY),
        database: db,
        baseUrl: BASE_URL,
        environment,
        registry: registry as never,
        actor,
        local: false,
        ...extra,
      });
    const signIn = (email: string, password: string) =>
      call(makeAuth(db, {}, INVITE_ONLY), 'POST', '/sign-in/email', {
        jar: new Jar(),
        body: { email, password },
      });

    it.each(['production', 'Production', '', 'test', 'dev'])(
      'is refused, making nothing, when the environment is %j',
      async (environment) => {
        const registry = fakeRegistry();
        await expect(seed(environment, registry)).rejects.toThrow(SeedError);
        expect(Object.keys(await roles())).toHaveLength(0);
        expect(registry.calls).toHaveLength(0);
      },
    );

    it.each(['development', 'staging'])(
      'is refused on %s too, when an account that no seed made is there, whatever the variable says',
      async (environment) => {
        await seedAccounts(
          { auth: makeAuth(db, {}, INVITE_ONLY), database: db, baseUrl: BASE_URL },
          'a-password-for-the-test',
          [{ name: 'Real Person', email: 'real@person.test', role: ROLE_OWNER }],
        );
        const registry = fakeRegistry();
        await expect(seed(environment, registry)).rejects.toThrow(/no seed made/);
        expect(Object.keys(await roles())).toEqual(['real@person.test']);
        expect(registry.calls).toHaveLength(0);
      },
    );

    it('gives a development instance the documented password, or SEED_PASSWORD, and makes the sample app', async () => {
      const registry = fakeRegistry();
      const report = await seed('development', registry, { password: 'chosen-for-this-run' });
      expect(report.accounts.created.map((a) => a.email)).toEqual(
        SEED_ACCOUNTS.map((a) => a.email),
      );
      for (const made of report.accounts.created) {
        expect(made.password).toBe('chosen-for-this-run');
        expect((await signIn(made.email, made.password)).status, made.email).toBe(200);
      }
      expect(registry.calls).toHaveLength(1);
      expect(registry.calls[0]?.key).toBe(SEED_APP_KEY);
      expect(report.app).toMatchObject({
        key: SEED_APP_KEY,
        clientId: 'sample-client',
        created: true,
      });
      const plain = await seed('development', fakeRegistry());
      expect(plain.accounts.created).toEqual([]);
    });

    it('gives a staging instance a different random password to each account, and ignores SEED_PASSWORD', async () => {
      const report = await seed('staging', fakeRegistry(), { password: 'must-not-be-used-here' });
      const passwords = report.accounts.created.map((a) => a.password);
      expect(passwords).toHaveLength(SEED_ACCOUNTS.length);
      expect(new Set(passwords).size).toBe(passwords.length);
      for (const made of report.accounts.created) {
        expect(made.password.length).toBeGreaterThanOrEqual(24);
        expect([DEFAULT_SEED_PASSWORD, 'must-not-be-used-here']).not.toContain(made.password);
        expect((await signIn(made.email, made.password)).status, made.email).toBe(200);
        expect((await signIn(made.email, DEFAULT_SEED_PASSWORD)).status).toBeGreaterThanOrEqual(
          400,
        );
      }
    });

    it('shows a password once: run again, it makes and shows nothing, and the sample app is kept', async () => {
      const registry = fakeRegistry();
      const first = await seed('staging', registry);
      const again = await seed('staging', registry);
      expect(again.accounts).toEqual({
        created: [],
        existing: SEED_ACCOUNTS.map((a) => a.email),
      });
      expect(again.app.created).toBe(false);
      for (const made of first.accounts.created)
        expect(JSON.stringify(again)).not.toContain(made.password);
    });

    it('will not seed an address that is not on this machine when it is asked to be local', async () => {
      await expect(
        seed('development', fakeRegistry(), {
          baseUrl: 'https://core.sovereign.test',
          local: true,
        }),
      ).rejects.toThrow(/not one/);
      expect(Object.keys(await roles())).toHaveLength(0);
    });
  });
}

describe('the seed', () => {
  // The suite is run from seed.test.ts and seed.db.test.ts.
  it('is listed for what it makes', () => {
    expect(SEED_ACCOUNTS.map((a) => a.role)).toEqual([ROLE_OWNER, ROLE_ADMIN, ROLE_USER]);
  });

  it('has a sample app that is public, outside the launcher, and sent to an address core accepts', () => {
    const app = sampleApp('http://localhost:3000');
    expect(app.type).toBe('public');
    expect(app.launcher?.show).toBe(false);
    expect(app.backchannelLogoutUri).toBe('');
    expect(app.trusted).toBe(false);
    // A development instance (its own address is http) may send an app to localhost; any other must use https.
    expect(sampleRedirect('http://localhost:3000')).toBe('http://localhost:3001/callback');
    expect(urlProblem(sampleRedirect('http://localhost:3000'), true)).toBeUndefined();
    expect(sampleRedirect('https://core.sovereign.test')).toBe(
      'https://sample.core.sovereign.test/callback',
    );
    expect(urlProblem(sampleRedirect('https://core.sovereign.test'), false)).toBeUndefined();
    expect(sampleApp('https://core.sovereign.test').redirectUris).toEqual([
      'https://sample.core.sovereign.test/callback',
    ]);
  });

  it('makes passwords that are random, at least 24 characters, and meet the policy it is given', () => {
    const strict = {
      minLength: 30,
      maxLength: 128,
      requireUppercase: true,
      requireLowercase: true,
      requireNumber: true,
      requireSymbol: true,
    };
    const made = new Set<string>();
    for (let i = 0; i < 200; i += 1) {
      const password = generatePassword(strict);
      expect(passwordProblems(password, strict)).toEqual([]);
      expect(password.length).toBeGreaterThanOrEqual(30);
      made.add(password);
    }
    expect(made.size).toBe(200);
    expect(generatePassword().length).toBeGreaterThanOrEqual(24);
  });
});
