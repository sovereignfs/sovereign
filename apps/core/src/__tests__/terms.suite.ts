/**
 * Accepting the terms and giving a time zone at sign-up, against a real database, through
 * better-auth's HTTP handler. One suite, run by `terms.test.ts` on a SQLite file (a plain
 * `pnpm test` covers it) and by `terms.db.test.ts` on whichever dialect the CI leg started.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { migrate, readMigrations, type Database } from '@sovereignfs/database';
import type { TestDatabase } from '@sovereignfs/database/testing';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { migrateCore } from '../db/migrate';
import { legalVersion } from '../legal/version';
import { call, freshEmail, INVITE_ONLY, makeAuth, PASSWORD, signUp } from './auth-harness';

const MIGRATIONS = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../migrations');

export function termsSuite(createDatabase: () => Promise<TestDatabase>): void {
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
    for (const table of [
      'rate_limits',
      'sessions',
      'accounts',
      'verifications',
      'invites',
      'users',
    ]) {
      await db.run(`delete from ${table}`);
    }
  });

  const count = async (table = 'users') => {
    const { rows } = await db.run(`select count(*) as n from ${table}`);
    return Number(rows[0]?.n);
  };
  const stored = async (email: string) => {
    const { rows } = await db.run(
      'select timezone, agreed_to_terms, terms_accepted_at, terms_version from users where email = ?',
      [email.toLowerCase()],
    );
    const row = rows[0];
    if (!row) throw new Error(`no account for ${email}`);
    return {
      timezone: row.timezone as string | null,
      agreed: row.agreed_to_terms === true || row.agreed_to_terms === 1,
      acceptedAt:
        row.terms_accepted_at === null
          ? null
          : new Date(row.terms_accepted_at as string | number).getTime(),
      version: row.terms_version as string | null,
    };
  };
  const body = (extra: Record<string, unknown> = {}) => ({
    name: 'Ada Lovelace',
    email: freshEmail(),
    password: PASSWORD,
    ...extra,
  });
  const signUpWith = (extra: Record<string, unknown>, a = auth()) =>
    call(a, 'POST', '/sign-up/email', { body: body(extra) });

  describe('accepting the terms', () => {
    it('is recorded with the account: that it was accepted, when, and which text', async () => {
      const before = Date.now();
      const { email, reply } = await signUp(auth());
      expect(reply.status).toBe(200);
      const record = await stored(email);
      expect(record.agreed).toBe(true);
      expect(record.version).toBe(legalVersion);
      expect(record.acceptedAt).toBeGreaterThanOrEqual(before - 1000);
      expect(record.acceptedAt).toBeLessThanOrEqual(Date.now() + 1000);
    });

    it.each([
      ['not sent', {}],
      ['false', { agreedToTerms: false }],
      ['the word true', { agreedToTerms: 'true' }],
      ['the number 1', { agreedToTerms: 1 }],
      ['null', { agreedToTerms: null }],
    ])(
      'is required: sign-up with it %s is refused by the server, and stores nothing',
      async (_n, extra) => {
        const reply = await signUpWith(extra);
        expect(reply.status).toBeGreaterThanOrEqual(400);
        expect(reply.status).toBeLessThan(500);
        expect(await count()).toBe(0);
        expect(await count('accounts')).toBe(0);
        expect(await count('sessions')).toBe(0);
      },
    );

    it('is refused in words, with a code the page can act on', async () => {
      const reply = await signUpWith({});
      expect(reply.status).toBe(400);
      expect(reply.body.code).toBe('TERMS_NOT_ACCEPTED');
      expect(reply.body.message).toMatch(/Terms of Service and the Privacy Policy/);
    });

    it('is required of a server-side sign-up too, where no page is involved', async () => {
      await expect(
        auth().api.signUpEmail({ body: { name: 'Eve', email: freshEmail(), password: PASSWORD } }),
      ).rejects.toMatchObject({ body: { code: 'TERMS_NOT_ACCEPTED' } });
      expect(await count()).toBe(0);
    });

    it('is required of the first account as well: nobody becomes the owner without it', async () => {
      const reply = await signUpWith({}, makeAuth(db, {}, INVITE_ONLY));
      expect(reply.status).toBe(400);
      expect(await count()).toBe(0);
    });

    it('is asked before the invitation, so a person told to accept is not told they are not invited', async () => {
      await signUp(auth());
      const reply = await signUpWith({}, makeAuth(db, {}, INVITE_ONLY));
      expect(reply.body.code).toBe('TERMS_NOT_ACCEPTED');
    });

    it.each([
      ['which text', { termsVersion: 'a version nobody was shown' }],
      ['when', { termsAcceptedAt: '2001-01-01T00:00:00.000Z' }],
    ])(
      'cannot say %s it was accepted: the server sets that, and refuses a request that tries',
      async (_n, extra) => {
        const reply = await signUpWith({ agreedToTerms: true, ...extra });
        expect(reply.status).toBe(400);
        expect(reply.body.code).toBe('FIELD_NOT_ALLOWED');
        expect(await count()).toBe(0);
      },
    );

    it('cannot be rewritten afterwards through an update of the account', async () => {
      const { jar, email } = await signUp(auth());
      const first = await stored(email);
      for (const change of [
        { agreedToTerms: false },
        { termsVersion: 'another' },
        { termsAcceptedAt: '2001-01-01T00:00:00.000Z' },
      ]) {
        const reply = await call(auth(), 'POST', '/update-user', { jar, body: change });
        expect(reply.status, JSON.stringify(change)).toBeGreaterThanOrEqual(400);
      }
      expect(await stored(email)).toEqual(first);
    });
  });

  describe('the time zone', () => {
    it('is stored when it is a real one', async () => {
      const email = freshEmail();
      expect(
        (await signUpWith({ email, agreedToTerms: true, timezone: 'Europe/London' })).status,
      ).toBe(200);
      expect((await stored(email)).timezone).toBe('Europe/London');
    });

    it('is kept in its proper spelling, whatever case was sent', async () => {
      const email = freshEmail();
      await signUpWith({ email, agreedToTerms: true, timezone: 'europe/LONDON' });
      expect((await stored(email)).timezone).toBe('Europe/London');
    });

    it('is optional: an account with none has none', async () => {
      const email = freshEmail();
      expect((await signUpWith({ email, agreedToTerms: true })).status).toBe(200);
      expect((await stored(email)).timezone).toBeNull();
    });

    it.each([
      'Mars/Phobos',
      '',
      '+05:30',
      'Europe/London; drop table users',
      ' Europe/London',
      'x'.repeat(200),
    ])('is never stored when it is not one: %j', async (timezone) => {
      const reply = await signUpWith({ agreedToTerms: true, timezone });
      expect(reply.status).toBe(400);
      expect(reply.body.code).toBe('INVALID_TIMEZONE');
      expect(await count()).toBe(0);
    });

    it.each([5, true, {}, ['Europe/London']])(
      'is never stored when it is not text: %j',
      async (timezone) => {
        const reply = await signUpWith({ agreedToTerms: true, timezone });
        expect(reply.status).toBeGreaterThanOrEqual(400);
        expect(await count()).toBe(0);
      },
    );

    it('is checked on a server-side sign-up as well', async () => {
      await expect(
        auth().api.signUpEmail({
          body: {
            name: 'Eve',
            email: freshEmail(),
            password: PASSWORD,
            agreedToTerms: true,
            timezone: 'Mars/Phobos',
          },
        }),
      ).rejects.toMatchObject({ body: { code: 'INVALID_TIMEZONE' } });
      expect(await count()).toBe(0);
    });

    it('can be changed later to another real one, and never to a bad one', async () => {
      const { jar, email } = await signUp(auth());
      const good = await call(auth(), 'POST', '/update-user', {
        jar,
        body: { timezone: 'asia/tokyo' },
      });
      expect(good.status).toBe(200);
      expect((await stored(email)).timezone).toBe('Asia/Tokyo');

      for (const timezone of ['Mars/Phobos', '+09:00', '']) {
        const bad = await call(auth(), 'POST', '/update-user', { jar, body: { timezone } });
        expect(bad.status, timezone).toBe(400);
      }
      expect((await stored(email)).timezone).toBe('Asia/Tokyo');
    });
  });

  describe('an account made before the terms were asked', () => {
    it('keeps its details and has no acceptance on record', async () => {
      const older = await createDatabase();
      const old = await older.open();
      try {
        const migrations = readMigrations(path.join(MIGRATIONS, old.family));
        await migrate(old, migrations.slice(0, 3));
        const now = old.family === 'postgres' ? new Date() : Date.now();
        await old.run(
          'insert into users (id, name, email, email_verified, created_at, updated_at) values (?, ?, ?, ?, ?, ?)',
          [
            'u-old',
            'Old Timer',
            'old@sovereign.local',
            old.family === 'postgres' ? true : 1,
            now,
            now,
          ],
        );

        await migrateCore(old, MIGRATIONS);

        const { rows } = await old.run(
          'select name, role, timezone, agreed_to_terms, terms_accepted_at, terms_version from users',
        );
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({
          name: 'Old Timer',
          timezone: null,
          terms_accepted_at: null,
          terms_version: null,
        });
        expect([false, 0]).toContain(rows[0]?.agreed_to_terms);
        // and the person can still sign in: nothing about them was invalidated
        const reply = await call(makeAuth(old), 'POST', '/sign-in/email', {
          body: { email: 'old@sovereign.local', password: PASSWORD },
        });
        expect(reply.status).toBe(401);
      } finally {
        await old.close().catch(() => undefined);
        await older.cleanup();
      }
    });
  });
}
