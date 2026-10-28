/**
 * Passkeys (core-app §3.4.2) against a real database, through better-auth's HTTP handler. One suite,
 * run by `passkey.test.ts` on a SQLite file (a plain `pnpm test` covers it) and by
 * `passkey.db.test.ts` on whichever dialect the CI leg started. The device is `webauthn.ts`'s
 * software authenticator, which follows the standard and shares nothing with the library.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Database } from '@sovereignfs/database';
import type { TestDatabase } from '@sovereignfs/database/testing';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
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

export function passkeySuite(createDatabase: () => Promise<TestDatabase>): void {
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
      'passkeys',
      'accounts',
      'verifications',
      'users',
    ]) {
      await db.run(`delete from ${table}`);
    }
  });

  const device = (settings: Partial<ConstructorParameters<typeof VirtualAuthenticator>[0]> = {}) =>
    new VirtualAuthenticator({ origin: BASE_URL, ...settings });
  const count = async (table: string) => {
    const { rows } = await db.run(`select count(*) as n from ${table}`);
    return Number(rows[0]?.n);
  };
  const stored = async () => (await db.run('select * from passkeys order by created_at')).rows;

  const registerOptions = (a: Auth, jar: Jar, name = 'Laptop') =>
    call(a, 'GET', `/passkey/generate-register-options?name=${encodeURIComponent(name)}`, {
      jar,
      address: freshAddress(),
    });
  const verifyRegistration = (a: Auth, jar: Jar, response: unknown, name = 'Laptop') =>
    call(a, 'POST', '/passkey/verify-registration', {
      jar,
      address: freshAddress(),
      body: { response, name },
    });
  /** A signed-in person adds a passkey the way the page does: options, the device's answer, verify. */
  async function addPasskey(a: Auth, jar: Jar, dev: VirtualAuthenticator, name = 'Laptop') {
    const options = await registerOptions(a, jar, name);
    expect(options.status, JSON.stringify(options.body)).toBe(200);
    return verifyRegistration(
      a,
      jar,
      dev.register(options.body as unknown as CreationOptions),
      name,
    );
  }
  /** Signing in with a passkey: options (no session, no email), the device's answer, verify. */
  async function signInWithPasskey(
    a: Auth,
    dev: VirtualAuthenticator,
    options: { tamper?: boolean } = {},
  ) {
    const jar = new Jar();
    const asked = await call(a, 'GET', '/passkey/generate-authenticate-options', {
      jar,
      address: freshAddress(),
    });
    expect(asked.status).toBe(200);
    const answer = dev.authenticate(asked.body as unknown as RequestOptions, options.tamper);
    const reply = await call(a, 'POST', '/passkey/verify-authentication', {
      jar,
      address: freshAddress(),
      body: { response: answer },
    });
    return { reply, jar, answer };
  }
  const setVerified = (email: string, value = true) =>
    db.run('update users set email_verified = ? where email = ?', [
      db.family === 'postgres' ? value : value ? 1 : 0,
      email,
    ]);
  const signedIn = async (a: Auth, jar: Jar) =>
    signedInAs(await call(a, 'GET', '/get-session?disableCookieCache=true', { jar }));

  describe('adding a passkey', () => {
    it('asks the device for a passkey that is unlocked and findable without typing an address', async () => {
      const a = auth();
      const { jar } = await signUp(a);
      const options = await registerOptions(a, jar);
      expect(options.status).toBe(200);
      const selection = (options.body as unknown as CreationOptions).authenticatorSelection;
      expect(selection?.residentKey).toBe('required');
      expect(selection?.userVerification).toBe('required');
    });

    it('is bound to the instance: its domain and name are in the request', async () => {
      const a = auth();
      const { jar } = await signUp(a);
      const options = (await registerOptions(a, jar)).body as unknown as CreationOptions;
      expect(options.rp).toMatchObject({ id: 'localhost', name: 'Sovereign' });
    });

    it('stores the passkey for the signed-in person, with the name they gave', async () => {
      const a = auth();
      const { jar, email } = await signUp(a);
      const dev = device();
      const reply = await addPasskey(a, jar, dev, 'Work laptop');
      expect(reply.status, JSON.stringify(reply.body)).toBe(200);
      const rows = await stored();
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ name: 'Work laptop', credential_id: dev.id, counter: 0 });
      const { rows: owner } = await db.run(
        'select u.email from passkeys p join users u on u.id = p.user_id',
      );
      expect(owner[0]?.email).toBe(email);
    });

    it('is listed for the person who made it, and for nobody else', async () => {
      const a = auth();
      const one = await signUp(a);
      const two = await signUp(a);
      await addPasskey(a, one.jar, device(), 'Mine');
      const mine = await call(a, 'GET', '/passkey/list-user-passkeys', { jar: one.jar });
      expect((mine.body as unknown as { name: string }[]).map((p) => p.name)).toEqual(['Mine']);
      const theirs = await call(a, 'GET', '/passkey/list-user-passkeys', { jar: two.jar });
      expect(theirs.body).toEqual([]);
    });

    it('needs a session, for the options and for the answer', async () => {
      const a = auth();
      const { jar } = await signUp(a);
      const options = (await registerOptions(a, jar)).body as unknown as CreationOptions;
      const answer = device().register(options);
      expect((await registerOptions(a, new Jar())).status).toBe(401);
      expect((await verifyRegistration(a, new Jar(), answer)).status).toBe(401);
      expect(await count('passkeys')).toBe(0);
    });

    it('refuses a device that was not unlocked, and stores nothing', async () => {
      const a = auth();
      const { jar } = await signUp(a);
      const reply = await addPasskey(a, jar, device({ userVerified: false }));
      expect(reply.status).toBe(400);
      expect(reply.body.code).toBe('PASSKEY_NOT_UNLOCKED');
      expect(await count('passkeys')).toBe(0);
    });

    it('refuses an answer made for another site, and stores nothing', async () => {
      const a = auth();
      const { jar } = await signUp(a);
      const reply = await addPasskey(a, jar, device({ origin: 'https://evil.example' }));
      expect(reply.status).toBeGreaterThanOrEqual(400);
      expect(await count('passkeys')).toBe(0);
    });

    it('answers each request for options with a challenge that works once', async () => {
      const a = auth();
      const { jar } = await signUp(a);
      const options = await registerOptions(a, jar);
      const answer = device().register(options.body as unknown as CreationOptions);
      expect((await verifyRegistration(a, jar, answer)).status).toBe(200);
      const again = await verifyRegistration(a, jar, answer);
      expect(again.status).toBeGreaterThanOrEqual(400);
      expect(await count('passkeys')).toBe(1);
    });

    it('does not offer a device a passkey it already holds', async () => {
      const a = auth();
      const { jar } = await signUp(a);
      const dev = device();
      await addPasskey(a, jar, dev);
      const options = (await registerOptions(a, jar)).body as unknown as {
        excludeCredentials?: { id: string }[];
      };
      expect(options.excludeCredentials?.map((c) => c.id)).toEqual([dev.id]);
    });
  });

  describe('signing in with a passkey', () => {
    async function withPasskey() {
      const a = auth();
      const { jar, email } = await signUp(a);
      const dev = device();
      await addPasskey(a, jar, dev);
      return { a, jar, email, dev };
    }

    it('opens a session with no password and no address typed', async () => {
      const { a, email, dev } = await withPasskey();
      await db.run('delete from sessions');
      const { reply, jar } = await signInWithPasskey(a, dev);
      expect(reply.status, JSON.stringify(reply.body)).toBe(200);
      expect(jar.get(SESSION_COOKIE)).toBeTruthy();
      expect((await signedIn(a, jar))?.email).toBe(email);
    });

    it('raises the device’s counter, which is how a cloned passkey is noticed', async () => {
      const { a, dev } = await withPasskey();
      await signInWithPasskey(a, dev);
      await signInWithPasskey(a, dev);
      expect((await stored())[0]?.counter).toBe(2);
    });

    it('signs in the person whose passkey it is, not another', async () => {
      const a = auth();
      const one = await signUp(a);
      const two = await signUp(a);
      await addPasskey(a, one.jar, device());
      const devTwo = device();
      await addPasskey(a, two.jar, devTwo);
      const { jar } = await signInWithPasskey(a, devTwo);
      expect((await signedIn(a, jar))?.email).toBe(two.email);
    });

    it('asks for no second step, because a passkey that must be unlocked is two factors already', async () => {
      const { a, jar, email, dev } = await withPasskey();
      await setVerified(email);
      const enabled = await call(a, 'POST', '/two-factor/enable', {
        jar,
        address: freshAddress(),
        body: { password: PASSWORD },
      });
      expect(enabled.status).toBe(200);
      const on = await call(a, 'POST', '/two-factor/verify-totp', {
        jar,
        address: freshAddress(),
        body: { code: totp(secretOf(String(enabled.body.totpURI))) },
      });
      expect(on.status).toBe(200);

      // the password now asks for a code...
      const withPassword = await call(a, 'POST', '/sign-in/email', {
        jar: new Jar(),
        address: freshAddress(),
        body: { email, password: PASSWORD },
      });
      expect(withPassword.body.twoFactorRedirect).toBe(true);
      // ...and the passkey does not
      const { reply, jar: opened } = await signInWithPasskey(a, dev);
      expect(reply.status).toBe(200);
      expect(opened.get(SESSION_COOKIE)).toBeTruthy();
    });

    it('refuses an answer from a device that was not unlocked, and opens no session', async () => {
      const { a, dev } = await withPasskey();
      await db.run('delete from sessions');
      dev.settings.userVerified = false;
      const { reply, jar } = await signInWithPasskey(a, dev);
      expect(reply.status).toBe(400);
      expect(reply.body.code).toBe('PASSKEY_NOT_UNLOCKED');
      expect(jar.get(SESSION_COOKIE)).toBeUndefined();
      expect(await count('sessions')).toBe(0);
      expect((await stored())[0]?.counter).toBe(0);
    });

    it('refuses an answer with a bad signature', async () => {
      const { a, dev } = await withPasskey();
      await db.run('delete from sessions');
      const { reply, jar } = await signInWithPasskey(a, dev, { tamper: true });
      expect(reply.status).toBeGreaterThanOrEqual(400);
      expect(jar.get(SESSION_COOKIE)).toBeUndefined();
      expect(await count('sessions')).toBe(0);
    });

    it('refuses a passkey it has never seen', async () => {
      const { a } = await withPasskey();
      await db.run('delete from sessions');
      const { reply, jar } = await signInWithPasskey(a, device());
      expect(reply.status).toBe(401);
      expect(jar.get(SESSION_COOKIE)).toBeUndefined();
    });

    it('refuses an answer made for another site', async () => {
      const { a, dev } = await withPasskey();
      await db.run('delete from sessions');
      dev.settings.origin = 'https://evil.example';
      const { reply } = await signInWithPasskey(a, dev);
      expect(reply.status).toBeGreaterThanOrEqual(400);
      expect(await count('sessions')).toBe(0);
    });

    it('refuses the same answer a second time: each challenge works once', async () => {
      const { a, dev } = await withPasskey();
      await db.run('delete from sessions');
      const first = await signInWithPasskey(a, dev);
      expect(first.reply.status).toBe(200);
      const replay = await call(a, 'POST', '/passkey/verify-authentication', {
        jar: first.jar,
        address: freshAddress(),
        body: { response: first.answer },
      });
      expect(replay.status).toBeGreaterThanOrEqual(400);
    });

    it('is limited per address, so challenges cannot be asked for at speed', async () => {
      const a = auth();
      const address = freshAddress();
      const statuses: number[] = [];
      for (let i = 0; i < 8; i++) {
        statuses.push(
          (await call(a, 'GET', '/passkey/generate-authenticate-options', { address })).status,
        );
      }
      expect(statuses.slice(0, 5).every((status) => status === 200)).toBe(true);
      expect(statuses).toContain(429);
    });

    it('is refused for an account whose address is not verified, while verification is required', async () => {
      const { email, dev } = await withPasskey();
      await db.run('delete from sessions');
      const strict = makeAuth(db, { SV_AUTH_REQUIRE_EMAIL_VERIFICATION: 'true' });
      const refused = await signInWithPasskey(strict, dev);
      expect(refused.reply.status).toBe(403);
      expect(refused.reply.body.code).toBe('EMAIL_NOT_VERIFIED');
      expect(refused.jar.get(SESSION_COOKIE)).toBeUndefined();
      expect(await count('sessions')).toBe(0);

      await setVerified(email);
      const allowed = await signInWithPasskey(strict, dev);
      expect(allowed.reply.status).toBe(200);
    });
  });

  describe('naming and removing passkeys', () => {
    const rename = (a: Auth, jar: Jar, id: string, name: string) =>
      call(a, 'POST', '/passkey/update-passkey', {
        jar,
        address: freshAddress(),
        body: { id, name },
      });
    const remove = (a: Auth, jar: Jar, id: string) =>
      call(a, 'POST', '/passkey/delete-passkey', { jar, address: freshAddress(), body: { id } });

    it('renames a passkey', async () => {
      const a = auth();
      const { jar } = await signUp(a);
      const added = await addPasskey(a, jar, device(), 'Laptop');
      expect((await rename(a, jar, String(added.body.id), 'Old laptop')).status).toBe(200);
      expect((await stored())[0]?.name).toBe('Old laptop');
    });

    it('lets nobody rename or remove another person’s passkey', async () => {
      const a = auth();
      const owner = await signUp(a);
      const other = await signUp(a);
      const added = await addPasskey(a, owner.jar, device(), 'Mine');
      const id = String(added.body.id);
      expect((await rename(a, other.jar, id, 'Taken')).status).toBeGreaterThanOrEqual(400);
      expect((await remove(a, other.jar, id)).status).toBeGreaterThanOrEqual(400);
      expect(await stored()).toHaveLength(1);
      expect((await stored())[0]?.name).toBe('Mine');
    });

    it('needs a session', async () => {
      const a = auth();
      const { jar } = await signUp(a);
      const added = await addPasskey(a, jar, device());
      expect((await remove(a, new Jar(), String(added.body.id))).status).toBe(401);
      expect(await count('passkeys')).toBe(1);
    });

    it('stops that passkey signing in, and leaves the other working', async () => {
      const a = auth();
      const { jar } = await signUp(a);
      const phone = device();
      const laptop = device();
      const first = await addPasskey(a, jar, phone, 'Phone');
      await addPasskey(a, jar, laptop, 'Laptop');
      expect((await remove(a, jar, String(first.body.id))).status).toBe(200);
      expect((await signInWithPasskey(a, phone)).reply.status).toBe(401);
      expect((await signInWithPasskey(a, laptop)).reply.status).toBe(200);
    });

    it('leaves password sign-in working when the last passkey is removed', async () => {
      const a = auth();
      const { jar, email } = await signUp(a);
      const dev = device();
      const added = await addPasskey(a, jar, dev);
      expect((await remove(a, jar, String(added.body.id))).status).toBe(200);
      expect(await count('passkeys')).toBe(0);
      expect((await signInWithPasskey(a, dev)).reply.status).toBe(401);
      const fresh = new Jar();
      const reply = await call(a, 'POST', '/sign-in/email', {
        jar: fresh,
        address: freshAddress(),
        body: { email, password: PASSWORD },
      });
      expect(reply.status).toBe(200);
      expect(fresh.get(SESSION_COOKIE)).toBeTruthy();
    });

    it('goes with the account', async () => {
      const a = auth();
      const { jar, email } = await signUp(a);
      await addPasskey(a, jar, device());
      expect(await count('passkeys')).toBe(1);
      await db.run('delete from users where email = ?', [email]);
      expect(await count('passkeys')).toBe(0);
    });
  });
}
