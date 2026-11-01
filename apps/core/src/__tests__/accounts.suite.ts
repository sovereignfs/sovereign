/**
 * Account states (core-app §3.3.6) against a real database, through better-auth's HTTP handler: what
 * deactivating does, what it stops, and what reactivating restores. One suite, run by
 * `accounts.test.ts` on a SQLite file (a plain `pnpm test` covers it) and by `accounts.db.test.ts` on
 * whichever dialect the CI leg started.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Database } from '@sovereignfs/database';
import type { TestDatabase } from '@sovereignfs/database/testing';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { AccountStateError, AccountStates } from '../accounts/states';
import type { Auth } from '../auth/auth';
import { migrateCore } from '../db/migrate';
import {
  BASE_URL,
  call,
  freshAddress,
  Jar,
  makeAuth,
  PASSWORD,
  signedInAs,
  signUp,
} from './auth-harness';
import { secretOf, totp } from './totp';
import { VirtualAuthenticator, type CreationOptions, type RequestOptions } from './webauthn';

const MIGRATIONS = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../migrations');
const SESSION_COOKIE = 'better-auth.session_token';

export function accountsSuite(createDatabase: () => Promise<TestDatabase>): void {
  let target: TestDatabase;
  let db: Database;
  let logged: string[];
  let states: AccountStates;
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
    logged = [];
    states = new AccountStates(db, { log: (message) => logged.push(message) });
    for (const table of [
      'rate_limits',
      'sessions',
      'two_factors',
      'passkeys',
      'accounts',
      'verifications',
      'users',
    ]) {
      await db.run(`delete from ${table}`);
    }
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const count = async (table: string, where = '', args: unknown[] = []) => {
    const { rows } = await db.run(`select count(*) as n from ${table} ${where}`, args);
    return Number(rows[0]?.n);
  };
  const idOf = async (email: string) => {
    const { rows } = await db.run('select id from users where email = ?', [email]);
    return String(rows[0]?.id);
  };
  const deactivatedAt = async (email: string) => {
    const { rows } = await db.run('select deactivated_at from users where email = ?', [email]);
    return rows[0]?.deactivated_at ?? null;
  };
  const signedIn = async (a: Auth, jar: Jar, cache = false) =>
    signedInAs(
      await call(a, 'GET', `/get-session${cache ? '' : '?disableCookieCache=true'}`, { jar }),
    );
  const signIn = (a: Auth, email: string, password = PASSWORD, jar = new Jar()) =>
    call(a, 'POST', '/sign-in/email', {
      jar,
      address: freshAddress(),
      body: { email, password },
    }).then((reply) => ({ reply, jar }));

  /** An instance with its owner, and an ordinary person signed in. */
  async function people() {
    const a = auth();
    await signUp(a);
    const person = await signUp(a);
    return { a, ...person, id: await idOf(person.email) };
  }

  describe('deactivating', () => {
    it('ends every session the account had, and says how many', async () => {
      const { a, email, id } = await people();
      await signIn(a, email);
      await signIn(a, email);
      expect(await count('sessions', 'where user_id = ?', [id])).toBe(3);
      const result = await states.deactivate(id);
      expect(result).toEqual({ changed: true, sessionsEnded: 3 });
      expect(await count('sessions', 'where user_id = ?', [id])).toBe(0);
      expect(await deactivatedAt(email)).not.toBeNull();
    });

    it('leaves other accounts and their sessions alone', async () => {
      const { a, id } = await people();
      const other = await signUp(a);
      await states.deactivate(id);
      expect((await signedIn(a, other.jar))?.email).toBe(other.email);
      expect(await deactivatedAt(other.email)).toBeNull();
    });

    it('is safe to repeat: the second time changes nothing but still ends any session', async () => {
      const { id, email } = await people();
      await states.deactivate(id);
      const first = await deactivatedAt(email);
      await db.run(
        "insert into sessions (id, expires_at, token, created_at, updated_at, user_id) values ('late', ?, 'late-token', ?, ?, ?)",
        db.family === 'postgres'
          ? [new Date(Date.now() + 1e7), new Date(), new Date(), id]
          : [Date.now() + 1e7, Date.now(), Date.now(), id],
      );
      const again = await states.deactivate(id);
      expect(again).toEqual({ changed: false, sessionsEnded: 1 });
      expect(await deactivatedAt(email)).toEqual(first);
      expect(await count('sessions', 'where user_id = ?', [id])).toBe(0);
    });

    it('stops the open session working on the server at once', async () => {
      const { a, jar, email, id } = await people();
      expect((await signedIn(a, jar))?.email).toBe(email);
      await states.deactivate(id);
      expect(await signedIn(a, jar)).toBeNull();
    });

    it('stops it working through better-auth’s own session endpoint at once: there is no signed cache to lag', async () => {
      const { a, jar, id } = await people();
      // Nothing is cached in the browser, so no endpoint can answer from a copy that has gone stale.
      expect(jar.get('better-auth.session_data')).toBeUndefined();
      await states.deactivate(id);
      expect(await signedIn(a, jar, true)).toBeNull();
    });

    it('cannot be done to the owner, so the instance always has someone who can sign in as it', async () => {
      const a = auth();
      const owner = await signUp(a);
      await expect(states.deactivate(await idOf(owner.email))).rejects.toMatchObject({
        code: 'owner',
      });
      expect(await deactivatedAt(owner.email)).toBeNull();
      expect((await signedIn(a, owner.jar))?.email).toBe(owner.email);
    });

    it('says so when there is no such account', async () => {
      await expect(states.deactivate('nobody')).rejects.toBeInstanceOf(AccountStateError);
      await expect(states.deactivate('nobody')).rejects.toMatchObject({ code: 'not-found' });
    });
  });

  describe('a deactivated account', () => {
    it('cannot sign in with its password, and opens no session', async () => {
      const { a, email, id } = await people();
      await states.deactivate(id);
      const { reply, jar } = await signIn(a, email);
      expect(reply.status).toBe(403);
      expect(reply.body.code).toBe('ACCOUNT_DEACTIVATED');
      expect(jar.get(SESSION_COOKIE)).toBeUndefined();
      expect(await count('sessions', 'where user_id = ?', [id])).toBe(0);
    });

    it('is not told apart from an unknown account by someone who does not have the password', async () => {
      const { a, email, id } = await people();
      await states.deactivate(id);
      const wrong = await signIn(a, email, `${PASSWORD}x`);
      const unknown = await signIn(a, 'nobody@sovereign.local');
      expect(wrong.reply.status).toBe(401);
      expect(wrong.reply.body.code).toBe(unknown.reply.body.code);
    });

    it('cannot finish a sign-in that was begun before: the second step opens no session', async () => {
      const a = auth();
      await signUp(a);
      const { jar, email } = await signUp(a);
      await db.run('update users set email_verified = ? where email = ?', [
        db.family === 'postgres' ? true : 1,
        email,
      ]);
      const enabled = await call(a, 'POST', '/two-factor/enable', {
        jar,
        address: freshAddress(),
        body: { password: PASSWORD },
      });
      const secret = secretOf(String(enabled.body.totpURI));
      await call(a, 'POST', '/two-factor/verify-totp', {
        jar,
        address: freshAddress(),
        body: { code: totp(secret) },
      });

      const begun = await signIn(a, email);
      expect(begun.reply.body.twoFactorRedirect).toBe(true);
      await states.deactivate(await idOf(email));
      const finished = await call(a, 'POST', '/two-factor/verify-totp', {
        jar: begun.jar,
        address: freshAddress(),
        body: { code: totp(secret) },
      });
      expect(finished.status).toBe(403);
      expect(begun.jar.get(SESSION_COOKIE)).toBeUndefined();
      expect(await count('sessions')).toBe(1);
    });

    it('cannot sign in with a passkey either', async () => {
      const a = auth();
      await signUp(a);
      const { jar, email } = await signUp(a);
      const dev = new VirtualAuthenticator({ origin: BASE_URL });
      const options = await call(a, 'GET', '/passkey/generate-register-options', {
        jar,
        address: freshAddress(),
      });
      await call(a, 'POST', '/passkey/verify-registration', {
        jar,
        address: freshAddress(),
        body: { response: dev.register(options.body as unknown as CreationOptions) },
      });
      await states.deactivate(await idOf(email));

      const fresh = new Jar();
      const asked = await call(a, 'GET', '/passkey/generate-authenticate-options', {
        jar: fresh,
        address: freshAddress(),
      });
      const reply = await call(a, 'POST', '/passkey/verify-authentication', {
        jar: fresh,
        address: freshAddress(),
        body: { response: dev.authenticate(asked.body as unknown as RequestOptions) },
      });
      expect(reply.status).toBe(403);
      expect(reply.body.code).toBe('ACCOUNT_DEACTIVATED');
      expect(fresh.get(SESSION_COOKIE)).toBeUndefined();
    });

    it('can still ask for a password reset, which opens no session and ends none', async () => {
      const { a, email, id } = await people();
      await states.deactivate(id);
      const reply = await call(a, 'POST', '/request-password-reset', {
        address: freshAddress(),
        body: { email },
      });
      expect(reply.status).toBeLessThan(500);
      expect(await count('sessions', 'where user_id = ?', [id])).toBe(0);
    });
  });

  describe('reactivating', () => {
    it('lets the account sign in again, and restores nothing else', async () => {
      const { a, jar, email, id } = await people();
      await states.deactivate(id);
      expect(await states.reactivate(id)).toEqual({ changed: true });
      expect(await deactivatedAt(email)).toBeNull();
      expect(await signedIn(a, jar)).toBeNull();
      const { reply, jar: fresh } = await signIn(a, email);
      expect(reply.status).toBe(200);
      expect(fresh.get(SESSION_COOKIE)).toBeTruthy();
    });

    it('does nothing to an account that is active', async () => {
      const { id, jar, a } = await people();
      expect(await states.reactivate(id)).toEqual({ changed: false });
      expect(await signedIn(a, jar)).not.toBeNull();
    });

    it('says so when there is no such account', async () => {
      await expect(states.reactivate('nobody')).rejects.toMatchObject({ code: 'not-found' });
    });
  });

  describe('the places other features add to it', () => {
    it('runs a step in the same transaction: if a later step fails, the account is still active', async () => {
      const { a, jar, email, id } = await people();
      const marked: string[] = [];
      states.addStep(async (transaction, userId) => {
        await transaction.run(
          'insert into verifications (id, identifier, value, expires_at, created_at, updated_at) values (?, ?, ?, ?, ?, ?)',
          [
            'step-row',
            'step',
            userId,
            db.family === 'postgres' ? new Date() : Date.now(),
            db.family === 'postgres' ? new Date() : Date.now(),
            db.family === 'postgres' ? new Date() : Date.now(),
          ],
        );
        marked.push(userId);
      });
      states.addStep(() => Promise.reject(new Error('the tokens could not be revoked')));

      await expect(states.deactivate(id)).rejects.toThrow('could not be revoked');
      expect(marked).toEqual([id]);
      expect(await deactivatedAt(email)).toBeNull();
      expect(await count('verifications', "where identifier = 'step'")).toBe(0);
      expect((await signedIn(a, jar))?.email).toBe(email);
    });

    it('keeps what a step wrote when every step succeeds', async () => {
      const { id } = await people();
      states.addStep(async (transaction, userId) => {
        await transaction.run(
          'insert into verifications (id, identifier, value, expires_at, created_at, updated_at) values (?, ?, ?, ?, ?, ?)',
          [
            'step-row',
            'step',
            userId,
            db.family === 'postgres' ? new Date() : Date.now(),
            db.family === 'postgres' ? new Date() : Date.now(),
            db.family === 'postgres' ? new Date() : Date.now(),
          ],
        );
      });
      await states.deactivate(id);
      expect(await count('verifications', "where identifier = 'step'")).toBe(1);
    });

    it('tells a listener after the commit, with the account and the sessions that ended', async () => {
      const { a, email, id } = await people();
      await signIn(a, email);
      const heard: { userId: string; tokens: number; stateSeen: unknown }[] = [];
      states.afterDeactivation(async ({ userId, sessionTokens }) => {
        heard.push({ userId, tokens: sessionTokens.length, stateSeen: await deactivatedAt(email) });
      });
      await states.deactivate(id);
      expect(heard).toHaveLength(1);
      expect(heard[0]).toMatchObject({ userId: id, tokens: 2 });
      expect(heard[0]?.stateSeen).not.toBeNull();
    });

    it('logs a listener that fails and does not undo the deactivation', async () => {
      const { id, email } = await people();
      states.afterDeactivation(() => Promise.reject(new Error('the app did not answer')));
      let second = false;
      states.afterDeactivation(() => {
        second = true;
      });
      await expect(states.deactivate(id)).resolves.toMatchObject({ changed: true });
      expect(second).toBe(true);
      expect(logged.join('\n')).toContain('the app did not answer');
      expect(await deactivatedAt(email)).not.toBeNull();
    });

    it('does not tell a listener about a deactivation that failed', async () => {
      const { id } = await people();
      let told = false;
      states.afterDeactivation(() => {
        told = true;
      });
      states.addStep(() => Promise.reject(new Error('no')));
      await expect(states.deactivate(id)).rejects.toThrow();
      expect(told).toBe(false);
    });
  });
}
