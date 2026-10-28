/**
 * The person's own sessions (core-app §3.11) against a real database, through better-auth's HTTP handler:
 * listing them, ending one, ending the others. One suite, run by `sessions.test.ts` on a SQLite file (a
 * plain `pnpm test` covers it) and by `sessions.db.test.ts` on whichever dialect the CI leg started.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Database } from '@sovereignfs/database';
import type { TestDatabase } from '@sovereignfs/database/testing';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { migrateCore } from '../db/migrate';
import { endOtherSessions, endSession, listSessions } from '../sessions/sessions';
import { call, freshAddress, Jar, makeAuth, PASSWORD, signedInAs, signUp } from './auth-harness';

const MIGRATIONS = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../migrations');
const SESSION_COOKIE = 'better-auth.session_token';
const DAY = 24 * 60 * 60 * 1000;

export function sessionsSuite(createDatabase: () => Promise<TestDatabase>): void {
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

  const idOf = async (email: string) =>
    String((await db.run('select id from users where email = ?', [email])).rows[0]?.id);
  const sessionIdsOf = async (userId: string) =>
    (await db.run('select id from sessions where user_id = ?', [userId])).rows.map((row) =>
      String(row.id),
    );
  const alive = async (a: ReturnType<typeof auth>, jar: Jar) =>
    signedInAs(await call(a, 'GET', '/get-session?disableCookieCache=true', { jar }));
  const signIn = async (a: ReturnType<typeof auth>, email: string, userAgent: string) => {
    const jar = new Jar();
    const reply = await call(a, 'POST', '/sign-in/email', {
      jar,
      address: freshAddress(),
      headers: { 'user-agent': userAgent },
      body: { email, password: PASSWORD },
    });
    expect(reply.status).toBe(200);
    return jar;
  };
  const CHROME =
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
  const FIREFOX =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:132.0) Gecko/20100101 Firefox/132.0';

  /** A person with two sessions, on two kinds of device, and someone else with one. */
  async function people() {
    const a = auth();
    const first = await signUp(a);
    const second = await signUp(a);
    const email = second.email;
    const laptop = await signIn(a, email, CHROME);
    const desktop = await signIn(a, email, FIREFOX);
    const userId = await idOf(email);
    const stranger = await idOf(first.email);
    return { a, email, userId, stranger, laptop, desktop, strangerJar: first.jar };
  }
  const currentOf = async (userId: string, jar: Jar) => {
    const token = jar.get(SESSION_COOKIE)?.split('.')[0] ?? '';
    const { rows } = await db.run('select id from sessions where user_id = ? and token = ?', [
      userId,
      token,
    ]);
    return String(rows[0]?.id);
  };

  describe('listing', () => {
    it('shows the person’s own sessions, labelled by device, with this one marked', async () => {
      const { userId, laptop } = await people();
      const current = await currentOf(userId, laptop);
      const list = await listSessions(db, userId, current);
      expect(list).toHaveLength(3);
      expect(list.filter((session) => session.current)).toHaveLength(1);
      expect(list.find((session) => session.current)?.device).toBe('Chrome on macOS');
      expect(list.map((session) => session.device)).toEqual(
        expect.arrayContaining(['Chrome on macOS', 'Firefox on Windows']),
      );
    });

    it('never shows anyone else’s sessions', async () => {
      const { userId, stranger } = await people();
      const strangers = new Set(await sessionIdsOf(stranger));
      const mine = await listSessions(db, userId, 'none');
      expect(mine.some((session) => strangers.has(session.id))).toBe(false);
      expect(await listSessions(db, stranger, 'none')).toHaveLength(1);
    });

    it('never carries the token, which is the secret behind the cookie', async () => {
      const { userId, laptop } = await people();
      const text = JSON.stringify(await listSessions(db, userId, 'none'));
      const { rows } = await db.run('select token from sessions where user_id = ?', [userId]);
      for (const row of rows) expect(text).not.toContain(String(row.token));
      expect(text).not.toContain(laptop.get(SESSION_COOKIE) ?? 'no-cookie');
      expect(Object.keys((await listSessions(db, userId, 'none'))[0] ?? {})).not.toContain('token');
    });

    it('leaves out a session that has expired', async () => {
      const { userId } = await people();
      const [expiring] = await sessionIdsOf(userId);
      await db.run('update sessions set expires_at = ? where id = ?', [
        db.family === 'postgres' ? new Date(Date.now() - DAY) : Date.now() - DAY,
        expiring,
      ]);
      const list = await listSessions(db, userId, 'none');
      expect(list).toHaveLength(2);
      expect(list.some((session) => session.id === expiring)).toBe(false);
    });

    it('puts the most recently active first, with times as numbers on every dialect', async () => {
      const { userId } = await people();
      const [oldest] = await sessionIdsOf(userId);
      await db.run('update sessions set updated_at = ? where id = ?', [
        db.family === 'postgres' ? new Date(Date.now() - 5 * DAY) : Date.now() - 5 * DAY,
        oldest,
      ]);
      const list = await listSessions(db, userId, 'none');
      expect(list.at(-1)?.id).toBe(oldest);
      for (const session of list) {
        expect(Number.isFinite(session.signedInAt)).toBe(true);
        expect(Number.isFinite(session.lastActiveAt)).toBe(true);
      }
    });
  });

  describe('ending a session', () => {
    it('signs that browser out: its next request has no session', async () => {
      const { a, userId, laptop, desktop } = await people();
      const target = await currentOf(userId, desktop);
      expect(await alive(a, desktop)).not.toBeNull();
      expect(await endSession(db, userId, target)).toBe(true);
      expect(await alive(a, desktop)).toBeNull();
      expect(await alive(a, laptop)).not.toBeNull();
    });

    it('can end the one in use, which signs this browser out', async () => {
      const { a, userId, laptop } = await people();
      expect(await endSession(db, userId, await currentOf(userId, laptop))).toBe(true);
      expect(await alive(a, laptop)).toBeNull();
    });

    it('never ends another person’s session, and says it was not found', async () => {
      const { a, userId, stranger, strangerJar } = await people();
      const theirs = await sessionIdsOf(stranger);
      expect(await endSession(db, userId, theirs[0] ?? '')).toBe(false);
      expect(await sessionIdsOf(stranger)).toEqual(theirs);
      expect(await alive(a, strangerJar)).not.toBeNull();
    });

    it('says so when the session is already gone', async () => {
      const { userId } = await people();
      expect(await endSession(db, userId, 'no-such-session')).toBe(false);
    });
  });

  describe('ending the others', () => {
    it('ends every session but the one in use, and says how many', async () => {
      const { a, userId, laptop, desktop } = await people();
      const current = await currentOf(userId, laptop);
      expect(await endOtherSessions(db, userId, current)).toBe(2);
      expect(await sessionIdsOf(userId)).toEqual([current]);
      expect(await alive(a, laptop)).not.toBeNull();
      expect(await alive(a, desktop)).toBeNull();
    });

    it('leaves other people alone', async () => {
      const { a, userId, stranger, strangerJar } = await people();
      await endOtherSessions(db, userId, 'none');
      expect(await sessionIdsOf(userId)).toEqual([]);
      expect(await sessionIdsOf(stranger)).toHaveLength(1);
      expect(await alive(a, strangerJar)).not.toBeNull();
    });
  });

  describe('changing the password', () => {
    it('ends every other session when asked, and keeps this one', async () => {
      const { a, userId, laptop, desktop } = await people();
      const reply = await call(a, 'POST', '/change-password', {
        jar: laptop,
        address: freshAddress(),
        body: {
          currentPassword: PASSWORD,
          newPassword: 'a different long passphrase',
          revokeOtherSessions: true,
        },
      });
      expect(reply.status, JSON.stringify(reply.body)).toBe(200);
      expect(await alive(a, desktop)).toBeNull();
      expect((await sessionIdsOf(userId)).length).toBeGreaterThanOrEqual(1);
    });

    it('asks for the current password, and refuses a wrong one without changing anything', async () => {
      const { a, email, laptop } = await people();
      const reply = await call(a, 'POST', '/change-password', {
        jar: laptop,
        address: freshAddress(),
        body: { currentPassword: 'not it', newPassword: 'a different long passphrase' },
      });
      expect(reply.status).toBeGreaterThanOrEqual(400);
      const signIn = await call(a, 'POST', '/sign-in/email', {
        address: freshAddress(),
        body: { email, password: PASSWORD },
      });
      expect(signIn.status).toBe(200);
    });

    it('holds the new password to the policy', async () => {
      const { a, laptop } = await people();
      const reply = await call(a, 'POST', '/change-password', {
        jar: laptop,
        address: freshAddress(),
        body: { currentPassword: PASSWORD, newPassword: 'x' },
      });
      expect(reply.status).toBe(400);
      expect(reply.body.code).toBe('PASSWORD_DOES_NOT_MEET_POLICY');
    });
  });
}
