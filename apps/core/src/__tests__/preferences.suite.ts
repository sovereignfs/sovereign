/**
 * A person's preferences (core-app §3.11): the time zone and the language they save, as other apps see
 * them in the `zoneinfo` and `locale` claims. The server decides what is acceptable, on sign-up and on
 * every later change, whatever the page offered. One suite, run by `preferences.test.ts` on a SQLite
 * file and by `preferences.db.test.ts` on whichever dialect the CI leg started.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Database } from '@sovereignfs/database';
import type { TestDatabase } from '@sovereignfs/database/testing';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { migrateCore } from '../db/migrate';
import { call, freshEmail, makeAuth, PASSWORD, signUp } from './auth-harness';

const MIGRATIONS = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../migrations');

export function preferencesSuite(createDatabase: () => Promise<TestDatabase>): void {
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

  const stored = async (email: string) => {
    const { rows } = await db.run('select timezone, locale from users where email = ?', [
      email.toLowerCase(),
    ]);
    const row = rows[0];
    if (!row) throw new Error(`no account for ${email}`);
    return { timezone: row.timezone as string | null, locale: row.locale as string | null };
  };
  const count = async () => Number((await db.run('select count(*) as n from users')).rows[0]?.n);
  const signUpWith = (extra: Record<string, unknown>) =>
    call(auth(), 'POST', '/sign-up/email', {
      body: {
        name: 'Ada Lovelace',
        email: freshEmail(),
        password: PASSWORD,
        agreedToTerms: true,
        ...extra,
      },
    });

  describe('the language at sign-up', () => {
    it('is stored in its proper spelling, whatever case was sent', async () => {
      const email = freshEmail();
      expect((await signUpWith({ email, locale: 'en-gb' })).status).toBe(200);
      expect((await stored(email)).locale).toBe('en-GB');
    });

    it('is optional: an account with none has none', async () => {
      const email = freshEmail();
      expect((await signUpWith({ email })).status).toBe(200);
      expect(await stored(email)).toEqual({ timezone: null, locale: null });
    });

    it.each([
      'english',
      '',
      'en_GB',
      'en-',
      'und',
      'en,fr',
      'en-GB; drop table users',
      ' en-GB',
      'x'.repeat(200),
    ])('is never stored when it is not one: %j', async (locale) => {
      const reply = await signUpWith({ locale });
      expect(reply.status).toBe(400);
      expect(reply.body.code).toBe('INVALID_LOCALE');
      expect(await count()).toBe(0);
    });

    it.each([5, true, {}, ['en-GB']])('is never stored when it is not text: %j', async (locale) => {
      expect((await signUpWith({ locale })).status).toBeGreaterThanOrEqual(400);
      expect(await count()).toBe(0);
    });

    it('is checked on a server-side sign-up as well', async () => {
      await expect(
        auth().api.signUpEmail({
          body: {
            name: 'Eve',
            email: freshEmail(),
            password: PASSWORD,
            agreedToTerms: true,
            locale: 'klingon',
          },
        }),
      ).rejects.toMatchObject({ body: { code: 'INVALID_LOCALE' } });
      expect(await count()).toBe(0);
    });
  });

  describe('changing them later', () => {
    const update = (
      jar: Awaited<ReturnType<typeof signUp>>['jar'],
      body: Record<string, unknown>,
    ) => call(auth(), 'POST', '/update-user', { jar, body });

    it('saves both, each in its proper spelling', async () => {
      const { jar, email } = await signUp(auth());
      const reply = await update(jar, { timezone: 'europe/paris', locale: 'fr-fr' });
      expect(reply.status).toBe(200);
      expect(await stored(email)).toEqual({ timezone: 'Europe/Paris', locale: 'fr-FR' });
    });

    it('changes one without touching the other', async () => {
      const { jar, email } = await signUp(auth());
      await update(jar, { timezone: 'Asia/Tokyo', locale: 'ja-JP' });
      await update(jar, { locale: 'en-US' });
      expect(await stored(email)).toEqual({ timezone: 'Asia/Tokyo', locale: 'en-US' });
      await update(jar, { timezone: 'UTC' });
      expect(await stored(email)).toEqual({ timezone: 'UTC', locale: 'en-US' });
    });

    it('is refused when either is not real, and nothing changes, not even the good half', async () => {
      const { jar, email } = await signUp(auth());
      await update(jar, { timezone: 'Asia/Tokyo', locale: 'ja-JP' });

      const badZone = await update(jar, { timezone: 'Mars/Phobos', locale: 'en-GB' });
      expect(badZone.status).toBe(400);
      expect(badZone.body.code).toBe('INVALID_TIMEZONE');

      const badLocale = await update(jar, { timezone: 'Europe/Paris', locale: 'not a tag' });
      expect(badLocale.status).toBe(400);
      expect(badLocale.body.code).toBe('INVALID_LOCALE');

      expect(await stored(email)).toEqual({ timezone: 'Asia/Tokyo', locale: 'ja-JP' });
    });

    it('can be cleared, and clearing one leaves the other', async () => {
      const { jar, email } = await signUp(auth());
      await update(jar, { timezone: 'Asia/Tokyo', locale: 'ja-JP' });
      expect((await update(jar, { locale: null })).status).toBe(200);
      expect(await stored(email)).toEqual({ timezone: 'Asia/Tokyo', locale: null });
    });

    it('is the signed-in person’s own, and nobody else’s', async () => {
      const mine = await signUp(auth());
      const theirs = await signUp(auth());
      await update(theirs.jar, { timezone: 'Asia/Tokyo', locale: 'ja-JP' });
      await update(mine.jar, { timezone: 'Europe/Paris', locale: 'fr-FR' });
      expect(await stored(theirs.email)).toEqual({ timezone: 'Asia/Tokyo', locale: 'ja-JP' });
    });

    it('needs someone signed in', async () => {
      const reply = await call(auth(), 'POST', '/update-user', { body: { locale: 'en-GB' } });
      expect(reply.status).toBeGreaterThanOrEqual(400);
    });
  });
}
