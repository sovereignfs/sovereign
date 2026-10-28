/**
 * Two-factor sign-in with an authenticator app and backup codes (core-app §3.4.1), against a real
 * database, through better-auth's HTTP handler. One suite, run by `twofactor.test.ts` on a SQLite
 * file (a plain `pnpm test` covers it) and by `twofactor.db.test.ts` on whichever dialect the CI leg
 * started. Codes come from `totp.ts`, which follows RFC 6238 and shares nothing with better-auth.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Database } from '@sovereignfs/database';
import type { TestDatabase } from '@sovereignfs/database/testing';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { migrateCore } from '../db/migrate';
import { call, freshAddress, Jar, makeAuth, PASSWORD, signedInAs, signUp } from './auth-harness';
import { secretOf, totp } from './totp';

const MIGRATIONS = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../migrations');
const SESSION_COOKIE = 'better-auth.session_token';
const BACKUP_CODE = /^[A-Za-z0-9]{5}-[A-Za-z0-9]{5}$/;

export function twoFactorSuite(createDatabase: () => Promise<TestDatabase>): void {
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
      'two_factors',
      'accounts',
      'verifications',
      'users',
    ]) {
      await db.run(`delete from ${table}`);
    }
  });

  const verify = async (email: string) =>
    db.run('update users set email_verified = ? where email = ?', [
      db.family === 'postgres' ? true : 1,
      email,
    ]);
  const row = async (email: string) => {
    const { rows } = await db.run(
      'select u.two_factor_enabled as enabled, t.verified, t.secret, t.backup_codes, t.failed_verification_count as failures, t.locked_until from users u left join two_factors t on t.user_id = u.id where u.email = ?',
      [email],
    );
    const r = rows[0];
    if (!r) throw new Error(`no account for ${email}`);
    return {
      enabled: r.enabled === true || r.enabled === 1,
      hasRow: r.secret !== null && r.secret !== undefined,
      verified: r.verified === true || r.verified === 1,
      secret: r.secret as string | null,
      backupCodes: r.backup_codes as string | null,
      failures: Number(r.failures ?? 0),
      lockedUntil: r.locked_until,
    };
  };
  const count = async (table: string) => {
    const { rows } = await db.run(`select count(*) as n from ${table}`);
    return Number(rows[0]?.n);
  };

  /** A signed-in person with a verified address, before any two-factor. */
  async function person() {
    const a = auth();
    const { jar, email } = await signUp(a);
    await verify(email);
    return { a, jar, email };
  }

  const enable = (a: ReturnType<typeof auth>, jar: Jar, password: string | null = PASSWORD) =>
    call(a, 'POST', '/two-factor/enable', {
      jar,
      address: freshAddress(),
      body: password === null ? {} : { password },
    });

  /** Enrolled and turned on: the secret as an app holds it, and the backup codes. */
  async function enrolled() {
    const p = await person();
    const reply = await enable(p.a, p.jar);
    expect(reply.status).toBe(200);
    const secret = secretOf(String(reply.body.totpURI));
    const backupCodes = reply.body.backupCodes as string[];
    const on = await call(p.a, 'POST', '/two-factor/verify-totp', {
      jar: p.jar,
      address: freshAddress(),
      body: { code: totp(secret) },
    });
    expect(on.status, JSON.stringify(on.body)).toBe(200);
    return { ...p, secret, backupCodes };
  }

  /** The first step of signing in again, in a fresh browser. */
  async function firstStep(a: ReturnType<typeof auth>, email: string, password = PASSWORD) {
    const jar = new Jar();
    const reply = await call(a, 'POST', '/sign-in/email', {
      jar,
      address: freshAddress(),
      body: { email, password },
    });
    return { jar, reply };
  }
  const second = (
    a: ReturnType<typeof auth>,
    jar: Jar,
    path: 'verify-totp' | 'verify-backup-code',
    code: string,
    extra: Record<string, unknown> = {},
  ) =>
    call(a, 'POST', `/two-factor/${path}`, {
      jar,
      address: freshAddress(),
      body: { code, ...extra },
    });
  const signedIn = async (a: ReturnType<typeof auth>, jar: Jar) =>
    signedInAs(await call(a, 'GET', '/get-session?disableCookieCache=true', { jar }));

  describe('enrolling', () => {
    it('needs the password: none, or a wrong one, is refused and changes nothing', async () => {
      const { a, jar, email } = await person();
      for (const password of [null, `${PASSWORD}x`, '']) {
        const reply = await enable(a, jar, password);
        expect(reply.status, String(password)).toBe(400);
      }
      expect((await row(email)).hasRow).toBe(false);
    });

    it('needs a session', async () => {
      const reply = await enable(auth(), new Jar());
      expect(reply.status).toBe(401);
    });

    it('gives the key as an address an app can read, and ten backup codes', async () => {
      const { a, jar } = await person();
      const reply = await enable(a, jar);
      expect(reply.status).toBe(200);
      const uri = new URL(String(reply.body.totpURI));
      expect(uri.protocol).toBe('otpauth:');
      expect(uri.host).toBe('totp');
      expect(uri.searchParams.get('secret')).toMatch(/^[A-Z2-7]+$/);
      expect(uri.searchParams.get('digits')).toBe('6');
      expect(uri.searchParams.get('period')).toBe('30');
      const codes = reply.body.backupCodes as string[];
      expect(codes).toHaveLength(10);
      expect(new Set(codes).size).toBe(10);
      for (const code of codes) expect(code).toMatch(BACKUP_CODE);
    });

    it('is not on until a valid code is entered: sign-in is unchanged before that', async () => {
      const { a, jar, email } = await person();
      await enable(a, jar);
      expect((await row(email)).enabled).toBe(false);
      expect((await row(email)).verified).toBe(false);
      const { reply, jar: fresh } = await firstStep(a, email);
      expect(reply.status).toBe(200);
      expect(reply.body.twoFactorRedirect).toBeUndefined();
      expect(fresh.get(SESSION_COOKIE)).toBeTruthy();
    });

    it('is not turned on by a wrong code', async () => {
      const { a, jar, email } = await person();
      const reply = await enable(a, jar);
      const secret = secretOf(String(reply.body.totpURI));
      const good = totp(secret);
      const wrong = good === '000000' ? '000001' : '000000';
      const refused = await second(a, jar, 'verify-totp', wrong);
      expect(refused.status).toBe(401);
      expect((await row(email)).enabled).toBe(false);
    });

    it('is turned on by a valid code, and the person stays signed in', async () => {
      const { a, jar, email } = await person();
      const reply = await enable(a, jar);
      const on = await second(a, jar, 'verify-totp', totp(secretOf(String(reply.body.totpURI))));
      expect(on.status).toBe(200);
      expect((await row(email)).enabled).toBe(true);
      expect((await signedIn(a, jar))?.email).toBe(email);
    });

    it('can be started again while it is not on: the new key replaces the old', async () => {
      const { a, jar, email } = await person();
      const first = await enable(a, jar);
      const again = await enable(a, jar);
      expect(again.status).toBe(200);
      const oldSecret = secretOf(String(first.body.totpURI));
      const newSecret = secretOf(String(again.body.totpURI));
      expect(newSecret).not.toBe(oldSecret);
      const stale = await second(a, jar, 'verify-totp', totp(oldSecret));
      expect(stale.status).toBe(401);
      expect((await row(email)).enabled).toBe(false);
      expect((await second(a, jar, 'verify-totp', totp(newSecret))).status).toBe(200);
    });

    it('cannot be started again once it is on', async () => {
      const { a, jar } = await enrolled();
      const reply = await enable(a, jar);
      expect(reply.status).toBe(400);
      expect(reply.body.code).toBe('TOTP_ALREADY_ENABLED');
    });

    it('is not offered by email or text', async () => {
      const { a, jar } = await person();
      const reply = await call(a, 'POST', '/two-factor/enable', {
        jar,
        address: freshAddress(),
        body: { password: PASSWORD, method: 'otp' },
      });
      expect(reply.status).toBe(400);
      expect(
        (await row((await signedInAs(await call(a, 'GET', '/get-session', { jar })))?.email ?? ''))
          .enabled,
      ).toBe(false);
    });

    it('needs an address that has been verified, so an unverified account cannot turn it on', async () => {
      const a = auth();
      const { jar, email } = await signUp(a);
      const reply = await enable(a, jar);
      expect(reply.status).toBe(400);
      expect(reply.body.code).toBe('EMAIL_NOT_VERIFIED');
      expect((await row(email)).hasRow).toBe(false);
      await verify(email);
      expect((await enable(a, jar)).status).toBe(200);
    });

    it('keeps the key and the backup codes out of the database in the clear', async () => {
      const { secret, backupCodes, email } = await enrolled();
      const stored = await row(email);
      expect(stored.secret).not.toContain(secret);
      for (const code of backupCodes) {
        expect(stored.backupCodes).not.toContain(code);
        expect(stored.backupCodes).not.toContain(code.replace('-', ''));
      }
    });

    it('is removed with the account', async () => {
      const { email } = await enrolled();
      expect(await count('two_factors')).toBe(1);
      await db.run('delete from users where email = ?', [email]);
      expect(await count('two_factors')).toBe(0);
    });
  });

  describe('signing in with it on', () => {
    it('does not sign in on the password alone: it asks for the second step, and opens no session', async () => {
      const { a, email } = await enrolled();
      await db.run('delete from sessions');
      const { reply, jar } = await firstStep(a, email);
      expect(reply.status).toBe(200);
      expect(reply.body.twoFactorRedirect).toBe(true);
      expect(reply.body.token).toBeUndefined();
      expect(jar.get(SESSION_COOKIE)).toBeUndefined();
      expect(await count('sessions')).toBe(0);
      expect(await signedIn(a, jar)).toBeNull();
    });

    it('signs in with a valid code', async () => {
      const { a, email, secret } = await enrolled();
      const { jar } = await firstStep(a, email);
      const reply = await second(a, jar, 'verify-totp', totp(secret));
      expect(reply.status).toBe(200);
      expect(jar.get(SESSION_COOKIE)).toBeTruthy();
      expect((await signedIn(a, jar))?.email).toBe(email);
    });

    it('does not sign in with a wrong code, and says so the same way every time', async () => {
      const { a, email, secret } = await enrolled();
      const { jar } = await firstStep(a, email);
      const good = totp(secret);
      const wrong = good === '123456' ? '654321' : '123456';
      const reply = await second(a, jar, 'verify-totp', wrong);
      expect(reply.status).toBe(401);
      expect(jar.get(SESSION_COOKIE)).toBeUndefined();
      expect(await signedIn(a, jar)).toBeNull();
    });

    it('does not take the second step from someone who has not done the first', async () => {
      const { a, secret } = await enrolled();
      const reply = await second(a, new Jar(), 'verify-totp', totp(secret));
      expect(reply.status).toBe(401);
    });

    it('does not sign in for a wrong password, whatever the code would have been', async () => {
      const { a, email } = await enrolled();
      const { reply } = await firstStep(a, email, `${PASSWORD}x`);
      expect(reply.status).toBe(401);
      expect(reply.body.twoFactorRedirect).toBeUndefined();
    });

    it('lets one challenge be tried only a few times, then wants the password again', async () => {
      const { a, email, secret } = await enrolled();
      const { jar } = await firstStep(a, email);
      const good = totp(secret);
      const wrong = good === '123456' ? '654321' : '123456';
      for (let i = 0; i < 5; i++) {
        expect((await second(a, jar, 'verify-totp', wrong)).status).toBe(401);
      }
      // the sixth try is refused even with the right code: the challenge is spent
      const spent = await second(a, jar, 'verify-totp', totp(secret));
      expect(spent.status).toBeGreaterThanOrEqual(400);
      expect(jar.get(SESSION_COOKIE)).toBeUndefined();
    });

    it('locks the second step for a while after many wrong codes, even for the right one', async () => {
      const { a, email, secret } = await enrolled();
      const good = totp(secret);
      const wrong = good === '123456' ? '654321' : '123456';
      for (let round = 0; round < 2; round++) {
        const { jar } = await firstStep(a, email);
        for (let i = 0; i < 5; i++) await second(a, jar, 'verify-totp', wrong);
      }
      expect((await row(email)).failures).toBeGreaterThanOrEqual(10);
      const { jar } = await firstStep(a, email);
      const reply = await second(a, jar, 'verify-totp', totp(secret));
      expect(reply.status).toBe(429);
      expect(jar.get(SESSION_COOKIE)).toBeUndefined();
    });

    it('refuses a request to trust the device, so the second step is never skipped for a month', async () => {
      const { a, email, secret } = await enrolled();
      const { jar } = await firstStep(a, email);
      const reply = await second(a, jar, 'verify-totp', totp(secret), { trustDevice: true });
      expect(reply.status).toBe(400);
      expect(reply.body.code).toBe('TRUST_DEVICE_NOT_OFFERED');
      expect(jar.get(SESSION_COOKIE)).toBeUndefined();
      expect(jar.get('better-auth.trust_device')).toBeUndefined();
    });

    it('is limited per address, so codes cannot be tried at speed', async () => {
      const { a, email } = await enrolled();
      const address = freshAddress();
      const { jar } = await firstStep(a, email);
      const statuses: number[] = [];
      for (let i = 0; i < 5; i++) {
        statuses.push(
          (
            await call(a, 'POST', '/two-factor/verify-totp', {
              jar,
              address,
              body: { code: '000000' },
            })
          ).status,
        );
      }
      expect(statuses).toContain(429);
    });
  });

  describe('backup codes', () => {
    it('sign in once each: the code works, and then stops working', async () => {
      const { a, email, backupCodes } = await enrolled();
      const code = backupCodes[0] ?? '';

      const first = await firstStep(a, email);
      const reply = await second(a, first.jar, 'verify-backup-code', code);
      expect(reply.status).toBe(200);
      expect((await signedIn(a, first.jar))?.email).toBe(email);

      const again = await firstStep(a, email);
      const reused = await second(a, again.jar, 'verify-backup-code', code);
      expect(reused.status).toBe(401);
      expect(again.jar.get(SESSION_COOKIE)).toBeUndefined();
    });

    it('leave the others working', async () => {
      const { a, email, backupCodes } = await enrolled();
      for (const code of backupCodes.slice(0, 3)) {
        const { jar } = await firstStep(a, email);
        expect((await second(a, jar, 'verify-backup-code', code)).status).toBe(200);
      }
      const { jar } = await firstStep(a, email);
      expect((await second(a, jar, 'verify-backup-code', backupCodes[9] ?? '')).status).toBe(200);
    });

    it('are refused when wrong, with nothing used up', async () => {
      const { a, email, backupCodes } = await enrolled();
      const { jar } = await firstStep(a, email);
      expect((await second(a, jar, 'verify-backup-code', 'aaaaa-bbbbb')).status).toBe(401);
      expect((await second(a, jar, 'verify-backup-code', backupCodes[0] ?? '')).status).toBe(200);
    });

    it('are not a way past the second step without the first', async () => {
      const { a, backupCodes } = await enrolled();
      const reply = await second(a, new Jar(), 'verify-backup-code', backupCodes[0] ?? '');
      expect(reply.status).toBe(401);
    });
  });

  describe('regenerating backup codes', () => {
    const regenerate = (a: ReturnType<typeof auth>, jar: Jar, password?: string) =>
      call(a, 'POST', '/two-factor/generate-backup-codes', {
        jar,
        address: freshAddress(),
        body: password === undefined ? {} : { password },
      });

    it('needs the password', async () => {
      const { a, jar, backupCodes } = await enrolled();
      for (const password of [undefined, `${PASSWORD}x`]) {
        expect((await regenerate(a, jar, password)).status, String(password)).toBe(400);
      }
      // nothing changed: an old code still works
      const email = (await signedIn(a, jar))?.email ?? '';
      const { jar: other } = await firstStep(a, email);
      expect((await second(a, other, 'verify-backup-code', backupCodes[0] ?? '')).status).toBe(200);
    });

    it('needs a session', async () => {
      expect((await regenerate(auth(), new Jar(), PASSWORD)).status).toBe(401);
    });

    it('gives ten new codes and retires every old one', async () => {
      const { a, jar, email, backupCodes } = await enrolled();
      const reply = await regenerate(a, jar, PASSWORD);
      expect(reply.status).toBe(200);
      const fresh = reply.body.backupCodes as string[];
      expect(fresh).toHaveLength(10);
      for (const code of fresh) expect(code).toMatch(BACKUP_CODE);
      expect(fresh.filter((code) => backupCodes.includes(code))).toEqual([]);

      const old = await firstStep(a, email);
      expect((await second(a, old.jar, 'verify-backup-code', backupCodes[0] ?? '')).status).toBe(
        401,
      );
      const next = await firstStep(a, email);
      expect((await second(a, next.jar, 'verify-backup-code', fresh[0] ?? '')).status).toBe(200);
    });

    it('is refused when two-factor is not on', async () => {
      const { a, jar } = await person();
      const reply = await regenerate(a, jar, PASSWORD);
      expect(reply.status).toBe(400);
    });
  });

  describe('turning it off', () => {
    const disable = (a: ReturnType<typeof auth>, jar: Jar, password?: string) =>
      call(a, 'POST', '/two-factor/disable', {
        jar,
        address: freshAddress(),
        body: password === undefined ? {} : { password },
      });

    it('needs the password: none, or a wrong one, is refused and leaves it on', async () => {
      const { a, jar, email } = await enrolled();
      for (const password of [undefined, `${PASSWORD}x`]) {
        expect((await disable(a, jar, password)).status, String(password)).toBe(400);
      }
      expect((await row(email)).enabled).toBe(true);
    });

    it('needs a session', async () => {
      expect((await disable(auth(), new Jar(), PASSWORD)).status).toBe(401);
    });

    it('still works three days after signing in: it asks for the password, not for a fresh session', async () => {
      const { a, jar, email } = await enrolled();
      const longAgo = Date.now() - 3 * 24 * 60 * 60 * 1000;
      await db.run('update sessions set created_at = ?', [
        db.family === 'postgres' ? new Date(longAgo) : longAgo,
      ]);
      const reply = await disable(a, jar.without('better-auth.session_data'), PASSWORD);
      expect(reply.status, JSON.stringify(reply.body)).toBe(200);
      expect((await row(email)).enabled).toBe(false);
    });

    it('removes the key and the codes, and sign-in goes back to the password alone', async () => {
      const { a, jar, email } = await enrolled();
      const reply = await disable(a, jar, PASSWORD);
      expect(reply.status).toBe(200);
      const stored = await row(email);
      expect(stored.enabled).toBe(false);
      expect(stored.hasRow).toBe(false);
      const { reply: signIn, jar: fresh } = await firstStep(a, email);
      expect(signIn.body.twoFactorRedirect).toBeUndefined();
      expect(fresh.get(SESSION_COOKIE)).toBeTruthy();
    });

    it('can be turned on again from the start', async () => {
      const { a, jar } = await enrolled();
      await disable(a, jar, PASSWORD);
      const reply = await enable(a, jar);
      expect(reply.status).toBe(200);
      expect(reply.body.backupCodes).toHaveLength(10);
    });
  });

  describe('a store from before two-factor', () => {
    it('keeps its accounts, with it off', async () => {
      const { email } = await person();
      const stored = await row(email);
      expect(stored.enabled).toBe(false);
      expect(stored.hasRow).toBe(false);
    });
  });

  it('does not let one person’s code open another’s account', async () => {
    const one = await enrolled();
    const other = await enrolled();
    // two six-digit codes are the same by chance one time in a million
    if (totp(other.secret) === totp(one.secret)) return;
    const { jar } = await firstStep(one.a, one.email);
    const reply = await second(one.a, jar, 'verify-totp', totp(other.secret));
    expect(reply.status).toBe(401);
  });
}
