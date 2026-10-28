/**
 * Who may sign up, against a real database, through better-auth's HTTP handler: invite-only
 * refusals, the first account becoming the owner, and the setting that switches the policy. It is
 * one suite, run by `registration.test.ts` on a SQLite file (a plain `pnpm test` covers it) and by
 * `registration.db.test.ts` on whichever dialect the CI leg started.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FieldCipher } from '@sovereignfs/crypto';
import type { Database } from '@sovereignfs/database';
import { readMigrations, migrate } from '@sovereignfs/database';
import type { TestDatabase } from '@sovereignfs/database/testing';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { registrationFrom, registrationMode } from '../auth/registration';
import { hasValidInvite } from '../invites';
import { config } from '../config';
import { migrateCore } from '../db/migrate';
import { SETTINGS } from '../settings/definitions';
import { SettingsStore } from '../settings/store';
import {
  call,
  freshEmail,
  INVITE_ONLY,
  Jar,
  makeAuth,
  OPEN,
  PASSWORD,
  signUp,
} from './auth-harness';

const MIGRATIONS = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../migrations');
const DAY = 24 * 60 * 60 * 1000;

export function registrationSuite(createDatabase: () => Promise<TestDatabase>): void {
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
    for (const table of [
      'rate_limits',
      'sessions',
      'accounts',
      'verifications',
      'invites',
      'users',
      'instance_settings',
    ]) {
      await db.run(`delete from ${table}`);
    }
  });

  const count = async (table: string, where = '', args: unknown[] = []) => {
    const { rows } = await db.run(`select count(*) as n from ${table} ${where}`, args);
    return Number(rows[0]?.n);
  };
  const roleOf = async (email: string) => {
    const { rows } = await db.run('select role from users where email = ?', [email.toLowerCase()]);
    return rows[0]?.role;
  };
  let nextInvite = 1;
  const invite = async (
    email: string,
    options: { expiresAt?: number | null; cancelledAt?: number; acceptedAt?: number } = {},
  ) => {
    const id = `invite-${nextInvite++}`;
    await db.run(
      'insert into invites (id, email, created_at, expires_at, accepted_at, cancelled_at) values (?, ?, ?, ?, ?, ?)',
      [
        id,
        email.toLowerCase(),
        Date.now() - DAY,
        options.expiresAt === undefined ? null : options.expiresAt,
        options.acceptedAt ?? null,
        options.cancelledAt ?? null,
      ],
    );
    return id;
  };
  /** An instance that already has its owner, so the next sign-up is an ordinary one. */
  const withOwner = async (registration = INVITE_ONLY) => {
    const auth = makeAuth(db, {}, registration);
    const owner = await signUp(auth, { email: 'owner@example.com' });
    expect(owner.reply.status).toBe(200);
    return auth;
  };

  describe('the first account', () => {
    it('becomes the owner, with invite-only on and no invitation', async () => {
      const { reply, email } = await signUp(makeAuth(db, {}, INVITE_ONLY));
      expect(reply.status).toBe(200);
      expect(await roleOf(email)).toBe('platform:owner');
    });

    it('becomes the owner when sign-up is open too', async () => {
      const { reply, email } = await signUp(makeAuth(db, {}, OPEN));
      expect(reply.status).toBe(200);
      expect(await roleOf(email)).toBe('platform:owner');
    });

    it('is the only owner: everyone after is a user', async () => {
      const auth = await withOwner(OPEN);
      for (let i = 0; i < 3; i++) expect((await signUp(auth)).reply.status).toBe(200);
      expect(await count('users', "where role = 'platform:owner'")).toBe(1);
      expect(await count('users', "where role = 'platform:user'")).toBe(3);
    });

    it('is not exempt once any account exists, even when the owner is gone', async () => {
      const auth = await withOwner();
      await db.run("update users set role = 'platform:user'");
      const { reply } = await signUp(auth);
      expect(reply.status).toBe(403);
      expect(await count('users', "where role = 'platform:owner'")).toBe(0);
    });

    it('goes to exactly one of several sign-ups that all find the instance empty', async () => {
      // Each request is held after it has looked for an existing account until every request has
      // looked, so all of them see an empty instance: the race, made certain rather than likely.
      const requests = 3;
      let looked = 0;
      let release: () => void = () => undefined;
      const everyoneLooked = new Promise<void>((resolve) => (release = resolve));
      const gated = new Proxy(db, {
        get(target, property) {
          const value: unknown = Reflect.get(target, property);
          if (property !== 'run') return typeof value === 'function' ? value.bind(target) : value;
          return async (sql: string, args?: readonly unknown[]) => {
            const result = await target.run(sql, args);
            if (sql.includes('from users limit 1') && ++looked >= requests) release();
            if (sql.includes('from users limit 1')) await everyoneLooked;
            return result;
          };
        },
      });
      const auth = makeAuth(gated, {}, INVITE_ONLY);
      const replies = await Promise.all(
        Array.from({ length: requests }, () => signUp(auth).then((result) => result.reply)),
      );
      expect(looked).toBe(requests);
      expect(await count('users')).toBe(1);
      expect(await count('users', "where role = 'platform:owner'")).toBe(1);
      expect(replies.filter((reply) => reply.status === 200)).toHaveLength(1);
      expect(replies.filter((reply) => reply.status >= 400)).toHaveLength(requests - 1);
    });

    it('cannot be shared: the database refuses a second owner whatever the code does', async () => {
      await signUp(makeAuth(db, {}, OPEN));
      const now = new Date();
      await expect(
        db.run(
          "insert into users (id, name, email, email_verified, role, created_at, updated_at) values ('x', 'X', 'x@example.com', ?, 'platform:owner', ?, ?)",
          db.family === 'postgres' ? [false, now, now] : [0, now.getTime(), now.getTime()],
        ),
      ).rejects.toThrow();
    });
  });

  describe('a role is never chosen by the person', () => {
    it('is not taken from the sign-up request, so an invited person cannot ask to be the owner', async () => {
      const auth = await withOwner();
      await invite('mallory@example.com');
      const reply = await call(auth, 'POST', '/sign-up/email', {
        body: {
          name: 'Mallory',
          email: 'mallory@example.com',
          password: PASSWORD,
          role: 'platform:owner',
        },
      });
      // better-auth drops a field the request may not set: the account is made, as a user.
      expect(reply.status).toBe(200);
      expect(await roleOf('mallory@example.com')).toBe('platform:user');
      expect(await count('users', "where role = 'platform:owner'")).toBe(1);
    });

    it('is refused when the account is edited, so nobody promotes themselves', async () => {
      const auth = await withOwner(OPEN);
      const { jar, email } = await signUp(auth);
      const reply = await call(auth, 'POST', '/update-user', {
        jar,
        body: { name: 'Renamed', role: 'platform:owner' },
      });
      expect(reply.status).toBeGreaterThanOrEqual(400);
      expect(await roleOf(email)).toBe('platform:user');
    });

    it('is the user role even when a server-side sign-up asks for another', async () => {
      const auth = await withOwner(OPEN);
      const email = freshEmail();
      await auth.api
        .signUpEmail({
          body: { name: 'Eve', email, password: PASSWORD, role: 'platform:owner' } as never,
        })
        .catch(() => undefined);
      expect(await roleOf(email)).not.toBe('platform:owner');
      expect(await count('users', "where role = 'platform:owner'")).toBe(1);
    });
  });

  describe('invite-only', () => {
    it('refuses a sign-up with no invitation, by a direct request, and stores nothing', async () => {
      const auth = await withOwner();
      const before = { users: await count('users'), accounts: await count('accounts') };
      const { reply, jar } = await signUp(auth);
      expect(reply.status).toBe(403);
      expect(reply.body.code).toBe('INVITE_REQUIRED');
      expect(jar.get('better-auth.session_token')).toBeUndefined();
      expect(await count('users')).toBe(before.users);
      expect(await count('accounts')).toBe(before.accounts);
      expect(await count('sessions')).toBe(1);
    });

    it('refuses the same sign-up made server-side, where no route is involved', async () => {
      const auth = await withOwner();
      await expect(
        auth.api.signUpEmail({
          body: { name: 'Eve', email: freshEmail(), password: PASSWORD },
        }),
      ).rejects.toMatchObject({ body: { code: 'INVITE_REQUIRED' } });
    });

    it('lets an invited address sign up, as a user', async () => {
      const auth = await withOwner();
      await invite('guest@example.com');
      const { reply } = await signUp(auth, { email: 'guest@example.com' });
      expect(reply.status).toBe(200);
      expect(await roleOf('guest@example.com')).toBe('platform:user');
    });

    it('looks the address up in lower case, as invitations are stored', async () => {
      await invite('guest@example.com');
      expect(await hasValidInvite(db, 'Guest@Example.COM', Date.now())).toBe(true);
      expect(await hasValidInvite(db, '  guest@example.com ', Date.now())).toBe(true);
      expect(await hasValidInvite(db, 'other@example.com', Date.now())).toBe(false);
    });

    it('matches the address whatever its case', async () => {
      const auth = await withOwner();
      await invite('guest@example.com');
      const { reply } = await signUp(auth, { email: 'Guest@Example.COM' });
      expect(reply.status).toBe(200);
    });

    it('accepts an invitation that has not expired yet, and one that never does', async () => {
      const auth = await withOwner();
      await invite('soon@example.com', { expiresAt: Date.now() + DAY });
      await invite('never@example.com', { expiresAt: null });
      expect((await signUp(auth, { email: 'soon@example.com' })).reply.status).toBe(200);
      expect((await signUp(auth, { email: 'never@example.com' })).reply.status).toBe(200);
    });

    it('refuses an invitation that has expired', async () => {
      const auth = await withOwner();
      await invite('late@example.com', { expiresAt: Date.now() - 1000 });
      const { reply } = await signUp(auth, { email: 'late@example.com' });
      expect(reply.status).toBe(403);
      expect(await roleOf('late@example.com')).toBeUndefined();
    });

    it('refuses an invitation that was cancelled', async () => {
      const auth = await withOwner();
      await invite('changed@example.com', { cancelledAt: Date.now() - 1000 });
      expect((await signUp(auth, { email: 'changed@example.com' })).reply.status).toBe(403);
    });

    it('refuses an address that was invited, when the invitation is for another', async () => {
      const auth = await withOwner();
      await invite('someone@example.com');
      expect((await signUp(auth, { email: 'someone-else@example.com' })).reply.status).toBe(403);
      expect((await signUp(auth, { email: 'xsomeone@example.com' })).reply.status).toBe(403);
      expect((await signUp(auth, { email: 'someone@example.com.au' })).reply.status).toBe(403);
    });

    it('uses an invitation up: once it has made an account it cannot make another', async () => {
      const auth = await withOwner();
      const id = await invite('guest@example.com');
      expect((await signUp(auth, { email: 'guest@example.com' })).reply.status).toBe(200);
      const { rows } = await db.run('select accepted_at from invites where id = ?', [id]);
      expect(rows[0]?.accepted_at).not.toBeNull();

      await db.run('delete from users where email = ?', ['guest@example.com']);
      const again = await signUp(auth, { email: 'guest@example.com' });
      expect(again.reply.status).toBe(403);
    });

    it('does not use an invitation up when the sign-up fails', async () => {
      const auth = await withOwner();
      const id = await invite('guest@example.com');
      const weak = await signUp(auth, { email: 'guest@example.com', password: 'x' });
      expect(weak.reply.status).toBe(400);
      const { rows } = await db.run('select accepted_at from invites where id = ?', [id]);
      expect(rows[0]?.accepted_at).toBeNull();
      expect((await signUp(auth, { email: 'guest@example.com' })).reply.status).toBe(200);
    });

    it('answers a missing, an expired, a cancelled and a used invitation alike', async () => {
      const auth = await withOwner();
      await invite('expired@example.com', { expiresAt: Date.now() - 1000 });
      await invite('cancelled@example.com', { cancelledAt: Date.now() - 1000 });
      await invite('used@example.com', { acceptedAt: Date.now() - 1000 });
      const answers = [];
      for (const email of [
        'nobody@example.com',
        'expired@example.com',
        'cancelled@example.com',
        'used@example.com',
      ]) {
        const { reply } = await signUp(auth, { email });
        answers.push({ status: reply.status, code: reply.body.code, message: reply.body.message });
      }
      expect(new Set(answers.map((a) => JSON.stringify(a))).size).toBe(1);
      expect(answers[0]?.status).toBe(403);
    });

    it('is still limited per address, so invitations cannot be guessed at speed', async () => {
      const auth = await withOwner();
      const address = '203.0.113.9';
      let last = 0;
      for (let i = 0; i < 20 && last !== 429; i++) {
        last = (
          await call(auth, 'POST', '/sign-up/email', {
            address,
            body: { name: 'G', email: freshEmail(), password: PASSWORD },
          })
        ).status;
      }
      expect(last).toBe(429);
    });
  });

  describe('open sign-up', () => {
    it('lets anyone sign up, as a user, with no invitation', async () => {
      const auth = await withOwner(OPEN);
      const { reply, email } = await signUp(auth);
      expect(reply.status).toBe(200);
      expect(await roleOf(email)).toBe('platform:user');
    });

    it('does not mark an unrelated invitation used', async () => {
      const auth = await withOwner(OPEN);
      const id = await invite('other@example.com');
      await signUp(auth);
      const { rows } = await db.run('select accepted_at from invites where id = ?', [id]);
      expect(rows[0]?.accepted_at).toBeNull();
    });
  });

  describe('the registration setting', () => {
    const cipher = FieldCipher.fromKeyRing(`k1:${Buffer.alloc(32, 7).toString('base64')}`);
    const policy = (env: Record<string, string> = {}) => {
      const store = new SettingsStore({
        database: db,
        cipher,
        config: config.load({
          SV_URL: 'http://localhost:3000',
          SV_AUTH_SECRET: 'a-secret-that-is-long-enough-to-pass-validation',
          ...env,
        }),
        cacheMs: 0,
      });
      return { store, registration: registrationFrom(store) };
    };
    const signsUp = async (registration: ReturnType<typeof policy>['registration']) => {
      const auth = makeAuth(db, {}, registration);
      return (await signUp(auth)).reply.status === 200;
    };

    beforeEach(async () => {
      await signUp(makeAuth(db, {}, OPEN), { email: 'owner@example.com' });
    });

    it('is invite-only when nothing says otherwise: a setting left unset never opens access', async () => {
      expect(await signsUp(policy().registration)).toBe(false);
    });

    it('follows SV_AUTH_INVITE_ONLY', async () => {
      expect(await signsUp(policy({ SV_AUTH_INVITE_ONLY: 'false' }).registration)).toBe(true);
      expect(await signsUp(policy({ SV_AUTH_INVITE_ONLY: 'true' }).registration)).toBe(false);
    });

    it('is overridden by a value saved in the Console, either way', async () => {
      const closed = policy({ SV_AUTH_INVITE_ONLY: 'false' });
      await closed.store.set(SETTINGS.inviteOnly, true);
      expect(await signsUp(closed.registration)).toBe(false);

      const open = policy({ SV_AUTH_INVITE_ONLY: 'true' });
      await open.store.set(SETTINGS.inviteOnly, false);
      expect(await signsUp(open.registration)).toBe(true);
    });

    it('applies at once, and clearing the saved value returns to the environment', async () => {
      const { store, registration } = policy({ SV_AUTH_INVITE_ONLY: 'true' });
      const auth = makeAuth(db, {}, registration);
      expect((await signUp(auth)).reply.status).toBe(403);
      await store.set(SETTINGS.inviteOnly, false);
      expect((await signUp(auth)).reply.status).toBe(200);
      await store.clear(SETTINGS.inviteOnly);
      expect((await signUp(auth)).reply.status).toBe(403);
    });

    it('closes sign-up when the setting cannot be read, never opens it', async () => {
      const broken = makeAuth(
        db,
        {},
        {
          inviteOnly: () => Promise.reject(new Error('the settings are unavailable')),
        },
      );
      const before = await count('users');
      expect((await signUp(broken)).reply.status).toBeGreaterThanOrEqual(400);
      expect(await count('users')).toBe(before);
    });
  });

  describe('what the sign-up page tells a visitor', () => {
    it('is the first account on an empty instance, whatever the policy', async () => {
      expect(await registrationMode(db, INVITE_ONLY)).toBe('first-account');
      expect(await registrationMode(db, OPEN)).toBe('first-account');
    });

    it('is by invitation, or open, once an account exists', async () => {
      await signUp(makeAuth(db, {}, OPEN));
      expect(await registrationMode(db, INVITE_ONLY)).toBe('invite-only');
      expect(await registrationMode(db, OPEN)).toBe('open');
    });
  });

  describe('an instance that already had accounts before roles', () => {
    // Accounts made while sign-up was open and nobody could hold a role. The migration makes the
    // oldest the owner, so there is one owner at all times and the next sign-up is not "first".
    it('gets its first account as the owner, and the rest as users', async () => {
      const older = await createDatabase();
      const old = await older.open();
      try {
        const migrations = readMigrations(path.join(MIGRATIONS, old.family));
        await migrate(old, migrations.slice(0, 2));
        const when = (ms: number) => (old.family === 'postgres' ? new Date(ms) : ms);
        const flag = old.family === 'postgres' ? false : 0;
        for (const [id, email, created] of [
          ['u-late', 'late@example.com', 3000],
          ['u-first', 'first@example.com', 1000],
          ['u-mid', 'mid@example.com', 2000],
        ] as const) {
          await old.run(
            'insert into users (id, name, email, email_verified, created_at, updated_at) values (?, ?, ?, ?, ?, ?)',
            [id, id, email, flag, when(created), when(created)],
          );
        }

        const result = await migrateCore(old, MIGRATIONS);
        expect(result.applied).toHaveLength(migrations.length - 2);

        const { rows } = await old.run('select id, role from users order by id');
        expect(rows).toEqual([
          { id: 'u-first', role: 'platform:owner' },
          { id: 'u-late', role: 'platform:user' },
          { id: 'u-mid', role: 'platform:user' },
        ]);

        // and the next sign-up is not the first account
        const reply = await signUp(makeAuth(old, {}, INVITE_ONLY));
        expect(reply.reply.status).toBe(403);
      } finally {
        await old.close().catch(() => undefined);
        await older.cleanup();
      }
    });

    it('is left without an owner only when it has no accounts at all', async () => {
      const { rows } = await db.run(
        "select count(*) as n from users where role = 'platform:owner'",
      );
      expect(Number(rows[0]?.n)).toBe(0);
      expect(await count('users')).toBe(0);
    });
  });

  it('keeps the cookie jar out of it: a refusal sets no session', async () => {
    const auth = await withOwner();
    const jar = new Jar();
    const reply = await call(auth, 'POST', '/sign-up/email', {
      jar,
      body: { name: 'Eve', email: freshEmail(), password: PASSWORD },
    });
    expect(reply.status).toBe(403);
    expect(reply.setCookies).toEqual([]);
  });
}
