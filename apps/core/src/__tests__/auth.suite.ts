/**
 * Core's sign-in against a real database, through better-auth's HTTP handler: the same entry the
 * route handler uses, so a request here is a request from a browser minus the network. It is one
 * suite, run by `auth.test.ts` on a SQLite file (a plain `pnpm test` covers it) and by
 * `auth.db.test.ts` on whichever dialect the CI leg started.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Database } from '@sovereignfs/database';
import type { TestDatabase } from '@sovereignfs/database/testing';
import { getTableConfig as pgConfig } from 'drizzle-orm/pg-core';
import { getTableConfig as sqliteConfig } from 'drizzle-orm/sqlite-core';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { migrateCore } from '../db/migrate';
import * as postgresSchema from '../db/schema/postgres';
import * as sqliteSchema from '../db/schema/sqlite';
import {
  BASE_URL,
  call,
  freshAddress,
  freshEmail,
  Jar,
  makeAuth,
  PASSWORD,
  signedInAs,
  signUp,
} from './auth-harness';
import { loadFixture, readFixtures } from './auth-store';

const MIGRATIONS = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../migrations');
const SESSION_COOKIE = 'better-auth.session_token';
const CACHE_COOKIE = 'better-auth.session_data';

export function authSuite(createDatabase: () => Promise<TestDatabase>): void {
  let target: TestDatabase;
  let db: Database;
  const auth = () => makeAuth(db);

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
    for (const table of ['rate_limits', 'sessions', 'accounts', 'verifications', 'users']) {
      await db.run(`delete from ${table}`);
    }
  });

  const count = async (table: string, where = '', args: unknown[] = []) => {
    const { rows } = await db.run(`select count(*) as n from ${table} ${where}`, args);
    return Number(rows[0]?.n);
  };

  describe('the migrations', () => {
    const tables = {
      users: [sqliteSchema.users, postgresSchema.users],
      sessions: [sqliteSchema.sessions, postgresSchema.sessions],
      accounts: [sqliteSchema.accounts, postgresSchema.accounts],
      verifications: [sqliteSchema.verifications, postgresSchema.verifications],
      rate_limits: [sqliteSchema.rateLimits, postgresSchema.rateLimits],
      two_factors: [sqliteSchema.twoFactors, postgresSchema.twoFactors],
    } as const;

    it.each(Object.keys(tables))(
      'create %s with the columns the schema describes',
      async (name) => {
        const [forSqlite, forPostgres] = tables[name as keyof typeof tables];
        const expected =
          db.family === 'postgres'
            ? pgConfig(forPostgres as never).columns.map((c) => c.name)
            : sqliteConfig(forSqlite as never).columns.map((c) => c.name);
        const { rows } = await db.run(
          db.family === 'postgres'
            ? 'select column_name as name from information_schema.columns where table_schema = current_schema() and table_name = ?'
            : 'select name from pragma_table_info(?)',
          [name],
        );
        expect(rows.map((r) => r.name).sort()).toEqual([...expected].sort());
      },
    );
  });

  describe('signing up', () => {
    it('creates the account and signs the person in', async () => {
      const { reply, jar, email } = await signUp(auth(), { name: 'Ada Lovelace' });
      expect(reply.status).toBe(200);
      expect(reply.body.user).toMatchObject({ name: 'Ada Lovelace', email });
      expect(jar.get(SESSION_COOKIE)).toBeTruthy();
      expect(await count('users')).toBe(1);
      expect(await count('sessions')).toBe(1);
    });

    it('stores a hash of the password, never the password', async () => {
      const { password } = await signUp(auth());
      const { rows } = await db.run('select password, provider_id from accounts');
      const stored = String(rows[0]?.password);
      expect(rows[0]?.provider_id).toBe('credential');
      expect(stored).not.toContain(password);
      expect(stored.length).toBeGreaterThan(60);
    });

    it('does not put the password hash in the answer', async () => {
      const { reply } = await signUp(auth());
      expect(JSON.stringify(reply.body)).not.toMatch(/password/i);
    });

    it('treats the same address in another case as the same account', async () => {
      const a = auth();
      const first = await signUp(a, { email: 'Ada@Example.com' });
      expect(first.reply.status).toBe(200);
      const second = await signUp(a, { email: 'ada@example.COM' });
      expect(second.reply.status).toBeGreaterThanOrEqual(400);
      expect(await count('users')).toBe(1);
    });

    it('refuses an address that is not one', async () => {
      const { reply } = await signUp(auth(), { email: 'not-an-email' });
      expect(reply.status).toBe(400);
      expect(await count('users')).toBe(0);
    });
  });

  describe('signing in', () => {
    it('signs in with the right password and starts a session', async () => {
      const a = auth();
      const { email, password } = await signUp(a);
      const jar = new Jar();
      const reply = await call(a, 'POST', '/sign-in/email', { jar, body: { email, password } });
      expect(reply.status).toBe(200);
      expect(jar.get(SESSION_COOKIE)).toBeTruthy();
      expect(await count('sessions')).toBe(2);
    });

    it('accepts the address in any case', async () => {
      const a = auth();
      const { email, password } = await signUp(a, { email: 'grace@example.com' });
      const reply = await call(a, 'POST', '/sign-in/email', {
        body: { email: email.toUpperCase(), password },
      });
      expect(reply.status).toBe(200);
    });

    it('refuses a wrong password', async () => {
      const a = auth();
      const { email } = await signUp(a);
      const jar = new Jar();
      const reply = await call(a, 'POST', '/sign-in/email', {
        jar,
        body: { email, password: 'not the password' },
      });
      expect(reply.status).toBe(401);
      expect(reply.body.code).toBe('INVALID_EMAIL_OR_PASSWORD');
      expect(jar.get(SESSION_COOKIE)).toBeUndefined();
    });

    it('answers an unknown address exactly as it answers a wrong password', async () => {
      const a = auth();
      const { email } = await signUp(a);
      const wrong = await call(a, 'POST', '/sign-in/email', {
        body: { email, password: 'not the password' },
      });
      const unknown = await call(a, 'POST', '/sign-in/email', {
        body: { email: 'nobody@example.com', password: 'not the password' },
      });
      expect(unknown.status).toBe(wrong.status);
      expect(unknown.body).toEqual(wrong.body);
    });
  });

  describe('the session', () => {
    it('is read back from the cookie', async () => {
      const a = auth();
      const { jar, email } = await signUp(a);
      const reply = await call(a, 'GET', '/get-session', { jar });
      expect(reply.status).toBe(200);
      expect(signedInAs(reply)?.email).toBe(email);
    });

    it('is nothing without a cookie, or with one that was never issued', async () => {
      const a = auth();
      expect((await call(a, 'GET', '/get-session')).body).toBeNull();
      const jar = new Jar();
      jar.absorb([`${SESSION_COOKIE}=forged.value`]);
      const reply = await call(a, 'GET', '/get-session', { jar });
      expect(signedInAs(reply)).toBeNull();
    });

    it('ends on the server when the person signs out', async () => {
      const a = auth();
      const { jar } = await signUp(a);
      // What a thief holding the token would send: the token alone, no signed cache beside it.
      const stolen = jar.without(CACHE_COOKIE);
      expect((await call(a, 'POST', '/sign-out', { jar, body: {} })).status).toBe(200);
      expect(await count('sessions')).toBe(0);
      const reply = await call(a, 'GET', '/get-session', { jar: stolen });
      expect(signedInAs(reply)).toBeNull();
    });

    it('is signed: a token with a changed value is not accepted', async () => {
      const a = auth();
      const { jar } = await signUp(a);
      const value = jar.get(SESSION_COOKIE) ?? '';
      const forged = new Jar();
      forged.absorb([`${SESSION_COOKIE}=${value.slice(0, -4)}AAAA`]);
      const reply = await call(a, 'GET', '/get-session', { jar: forged });
      expect(signedInAs(reply)).toBeNull();
    });
  });

  describe('the password policy, enforced by the server', () => {
    const strict = {
      SV_AUTH_PASSWORD_MIN_LENGTH: '12',
      SV_AUTH_PASSWORD_REQUIRE_UPPERCASE: 'true',
      SV_AUTH_PASSWORD_REQUIRE_NUMBER: 'true',
      SV_AUTH_PASSWORD_REQUIRE_SYMBOL: 'true',
    };

    it.each([
      ['too short', 'Ab1!'],
      ['no uppercase letter', 'lowercase-only-1!'],
      ['no number', 'Lowercase-only-!!'],
      ['no symbol', 'Lowercase0nly1234'],
    ])('refuses a password with %s, with no account made', async (_why, password) => {
      const { reply } = await signUp(makeAuth(db, strict), { password });
      expect(reply.status).toBe(400);
      expect(reply.body.code).toBe('PASSWORD_DOES_NOT_MEET_POLICY');
      expect(reply.body.message).toMatch(/^The password must /);
      expect(await count('users')).toBe(0);
      expect(await count('accounts')).toBe(0);
      expect(await count('sessions')).toBe(0);
    });

    it('accepts a password that meets every rule', async () => {
      const { reply } = await signUp(makeAuth(db, strict), { password: 'Correct-horse-9-battery' });
      expect(reply.status).toBe(200);
    });

    it('applies the shortest length by default, and the longest always', async () => {
      const a = auth();
      const short = await signUp(a, { password: 'a'.repeat(7) });
      expect(short.reply.body.code).toBe('PASSWORD_DOES_NOT_MEET_POLICY');
      const long = await signUp(a, { password: 'a'.repeat(129) });
      expect(long.reply.body.code).toBe('PASSWORD_DOES_NOT_MEET_POLICY');
      expect((await signUp(a, { password: 'a'.repeat(8) })).reply.status).toBe(200);
      expect((await signUp(a, { password: 'a'.repeat(128) })).reply.status).toBe(200);
    });

    it('says every rule that was broken, in one sentence', async () => {
      const { reply } = await signUp(makeAuth(db, strict), { password: 'short' });
      expect(reply.body.message).toBe(
        'The password must be at least 12 characters long and include an uppercase letter and include a number and include a symbol.',
      );
    });

    it('holds when a password is changed, so a weak one cannot be set after a strong sign-up', async () => {
      const a = makeAuth(db, strict);
      const good = 'Correct-horse-9-battery';
      const { jar, email } = await signUp(a, { password: good });
      const reply = await call(a, 'POST', '/change-password', {
        jar,
        body: { currentPassword: good, newPassword: 'weak', revokeOtherSessions: false },
      });
      expect(reply.status).toBe(400);
      expect(reply.body.code).toBe('PASSWORD_DOES_NOT_MEET_POLICY');
      // The old password still works; the weak one never did.
      expect(
        (await call(a, 'POST', '/sign-in/email', { body: { email, password: good } })).status,
      ).toBe(200);
      expect(
        (await call(a, 'POST', '/sign-in/email', { body: { email, password: 'weak' } })).status,
      ).toBe(401);
    });

    it('holds on every path that stores a password, because it is checked where the hash is made', async () => {
      // Sign-up, reset, change and a server-side set all store what this function returns.
      const { password } = await await makeAuth(db, strict).$context;
      await expect(password.hash('weak')).rejects.toMatchObject({
        body: { code: 'PASSWORD_DOES_NOT_MEET_POLICY' },
      });
      const hash = await password.hash('Correct-horse-9-battery');
      expect(await password.verify({ hash, password: 'Correct-horse-9-battery' })).toBe(true);
      expect(await password.verify({ hash, password: 'Correct-horse-9-batterz' })).toBe(false);
    });

    it('holds when the server itself sets a password, as the Console will', async () => {
      const a = makeAuth(db, strict);
      const { jar } = await signUp(a, { password: 'Correct-horse-9-battery' });
      await expect(
        a.api.setPassword({
          // Long enough for better-auth's own check: only core's policy can refuse this one.
          body: { newPassword: 'longenoughbutlowercase' },
          headers: new Headers({ cookie: jar.header() ?? '', origin: BASE_URL }),
        }),
      ).rejects.toMatchObject({ body: { code: 'PASSWORD_DOES_NOT_MEET_POLICY' } });
    });
  });

  describe('the rate limit', () => {
    const attempt = (a: ReturnType<typeof auth>, address: string, email = 'someone@example.com') =>
      call(a, 'POST', '/sign-in/email', { address, body: { email, password: 'a wrong password' } });

    it('stops repeated sign-in attempts from one address, and says when to try again', async () => {
      const a = auth();
      const address = freshAddress();
      const statuses: number[] = [];
      for (let i = 0; i < 5; i++) statuses.push((await attempt(a, address)).status);
      expect(statuses.slice(0, 3)).toEqual([401, 401, 401]);
      expect(statuses.slice(3)).toEqual([429, 429]);
      const refused = await attempt(a, address);
      expect(Number(refused.headers.get('x-retry-after'))).toBeGreaterThan(0);
    });

    it('limits an address, not everyone: another address is unaffected', async () => {
      const a = auth();
      const busy = freshAddress();
      for (let i = 0; i < 4; i++) await attempt(a, busy);
      expect((await attempt(a, busy)).status).toBe(429);
      expect((await attempt(a, freshAddress())).status).toBe(401);
    });

    it('keeps its count in the database, so another instance shares it', async () => {
      const address = freshAddress();
      const first = auth();
      for (let i = 0; i < 3; i++) expect((await attempt(first, address)).status).toBe(401);
      expect(await count('rate_limits')).toBeGreaterThan(0);
      // A second process (a second replica, or this one after a restart) knows the first's count.
      expect((await attempt(auth(), address)).status).toBe(429);
    });

    it('limits sign-up as well', async () => {
      const a = auth();
      const address = freshAddress();
      const statuses: number[] = [];
      for (let i = 0; i < 5; i++) {
        const reply = await call(a, 'POST', '/sign-up/email', {
          address,
          body: { name: 'Ada', email: freshEmail(), password: PASSWORD, agreedToTerms: true },
        });
        statuses.push(reply.status);
      }
      expect(statuses).toContain(429);
    });

    it('ignores an address a client made up in front of the real one', async () => {
      // Without trusted proxies only a single address is believed; a chain gives no address, so
      // the request falls into one shared bucket instead of letting a client pick its own.
      const a = auth();
      const statuses: number[] = [];
      for (let i = 0; i < 5; i++) {
        const reply = await call(a, 'POST', '/sign-in/email', {
          address: `203.0.113.${i}, 198.51.100.200`,
          body: { email: 'someone@example.com', password: 'a wrong password' },
        });
        statuses.push(reply.status);
      }
      expect(statuses).toContain(429);
    });

    it('reads the client past a trusted proxy', async () => {
      const a = makeAuth(db, { SV_AUTH_TRUSTED_PROXIES: '10.0.0.0/8' });
      const client = freshAddress();
      for (let i = 0; i < 4; i++) {
        // The client may prepend what it likes; the proxy appends the address it saw.
        await attempt(a, `203.0.113.${i}, ${client}, 10.1.2.3`);
      }
      expect((await attempt(a, `203.0.113.99, ${client}, 10.1.2.3`)).status).toBe(429);
      expect((await attempt(a, `203.0.113.99, ${freshAddress()}, 10.1.2.3`)).status).toBe(401);
    });
  });

  describe('a session is never too old to use', () => {
    it('is configured with no freshness requirement', () => {
      expect(auth().options.session?.freshAge).toBe(0);
    });

    it('still allows a sensitive action three days after signing in', async () => {
      const a = auth();
      const { jar } = await signUp(a);
      const longAgo = Date.now() - 3 * 24 * 60 * 60 * 1000;
      await db.run('update sessions set created_at = ?', [
        db.family === 'postgres' ? new Date(longAgo) : longAgo,
      ]);
      // list-sessions is one of the actions better-auth gates on a fresh session.
      const reply = await call(a, 'GET', '/list-sessions', { jar: jar.without(CACHE_COOKIE) });
      expect(reply.status).toBe(200);
      expect(reply.body).toHaveLength(1);
    });
  });

  describe('requests from another origin', () => {
    it('are refused when they carry the person’s cookies, so another site cannot act as them', async () => {
      const a = auth();
      const { jar } = await signUp(a);
      const reply = await call(a, 'POST', '/sign-out', {
        jar,
        origin: 'https://evil.example',
        body: {},
      });
      expect(reply.status).toBe(403);
      expect(await count('sessions')).toBe(1);
    });

    it('are refused when the origin is missing, with cookies', async () => {
      const a = auth();
      const { jar } = await signUp(a);
      const reply = await call(a, 'POST', '/sign-out', { jar, origin: null, body: {} });
      expect(reply.status).toBe(403);
      expect(await count('sessions')).toBe(1);
    });

    it('are accepted from a trusted origin', async () => {
      const a = makeAuth(db, { SV_AUTH_TRUSTED_ORIGINS: 'https://app.example.com' });
      const { jar } = await signUp(a);
      const reply = await call(a, 'POST', '/sign-out', {
        jar,
        origin: 'https://app.example.com',
        body: {},
      });
      expect(reply.status).toBe(200);
    });
  });

  describe('the session cookie', () => {
    it('is HttpOnly and SameSite=Lax, and not Secure on http', async () => {
      const { reply } = await signUp(auth());
      const cookie = reply.setCookies.find((c) => c.startsWith(`${SESSION_COOKIE}=`)) ?? '';
      expect(cookie).toMatch(/HttpOnly/i);
      expect(cookie).toMatch(/SameSite=Lax/i);
      expect(cookie).not.toMatch(/;\s*Secure/i);
      expect(cookie).not.toMatch(/Domain=/i);
    });

    it('is Secure, under the secure name, when core is served over https', async () => {
      const baseUrl = 'https://core.example.com';
      const a = makeAuth(db, { SV_URL: baseUrl });
      const reply = await call(a, 'POST', '/sign-up/email', {
        baseUrl,
        body: { name: 'Ada', email: freshEmail(), password: PASSWORD, agreedToTerms: true },
      });
      expect(reply.status).toBe(200);
      const cookie = reply.setCookies.find((c) => c.includes('session_token=')) ?? '';
      expect(cookie).toMatch(/^__Secure-better-auth\.session_token=/);
      expect(cookie).toMatch(/;\s*Secure/i);
      expect(cookie).toMatch(/HttpOnly/i);
    });

    it('is shared with subdomains only when a cookie domain is set', async () => {
      const baseUrl = 'https://core.example.com';
      const a = makeAuth(db, { SV_URL: baseUrl, SV_AUTH_COOKIE_DOMAIN: 'example.com' });
      const reply = await call(a, 'POST', '/sign-up/email', {
        baseUrl,
        body: { name: 'Ada', email: freshEmail(), password: PASSWORD, agreedToTerms: true },
      });
      const cookie = reply.setCookies.find((c) => c.includes('session_token=')) ?? '';
      expect(cookie).toMatch(/Domain=example\.com/i);
    });
  });

  describe('a store written by an earlier better-auth', () => {
    // Each fixture is what an earlier version wrote: a person, a password hash and a live session.
    // The installed better-auth must still read all of it. When a new version fails here, the
    // upgrade would lock people out of their accounts or sign everyone out.
    const fixtures = readFixtures();

    it('has at least one capture to try', () => {
      expect(fixtures.length).toBeGreaterThan(0);
    });

    describe.each(fixtures)('written by better-auth $fixture.betterAuth', ({ fixture }) => {
      const open = () => makeAuth(db, { SV_AUTH_SECRET: fixture.secret });

      beforeEach(async () => {
        await loadFixture(db, fixture);
      });

      it('still signs the person in with the password they chose', async () => {
        const jar = new Jar();
        const reply = await call(open(), 'POST', '/sign-in/email', {
          jar,
          body: { email: fixture.email, password: fixture.password },
        });
        expect(reply.status).toBe(200);
        expect(reply.body.user?.email).toBe(fixture.email);
        expect(jar.get(SESSION_COOKIE)).toBeTruthy();
      });

      it('still refuses a wrong password', async () => {
        const reply = await call(open(), 'POST', '/sign-in/email', {
          body: { email: fixture.email, password: `${fixture.password}x` },
        });
        expect(reply.status).toBe(401);
      });

      it('still recognises the session that was already open, from its signed cookie', async () => {
        const jar = new Jar();
        const [name = '', ...value] = fixture.cookie.split('=');
        jar.absorb([`${name}=${value.join('=')}`]);
        const reply = await call(open(), 'GET', '/get-session', { jar });
        expect(reply.status).toBe(200);
        expect(signedInAs(reply)?.email).toBe(fixture.email);
      });

      it('leaves the old session open when the person signs in again, and leaves the hash alone', async () => {
        const before = await db.run('select password from accounts');
        await call(open(), 'POST', '/sign-in/email', {
          body: { email: fixture.email, password: fixture.password },
        });
        expect(await count('sessions')).toBe(fixture.tables.sessions.length + 1);
        const after = await db.run('select password from accounts');
        expect(after.rows).toEqual(before.rows);
      });

      it('lets someone else sign up beside them', async () => {
        const { reply } = await signUp(open());
        expect(reply.status).toBe(200);
        expect(await count('users')).toBe(fixture.tables.users.length + 1);
      });
    });
  });
}
