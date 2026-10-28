/**
 * Email verification, password reset and the emails around them, against a real database and the
 * real mail service on a transport that keeps what it is given, through better-auth's HTTP handler.
 * One suite, run by `verification.test.ts` on a SQLite file (a plain `pnpm test` covers it) and by
 * `verification.db.test.ts` on whichever dialect the CI leg started.
 */
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FieldCipher } from '@sovereignfs/crypto';
import type { Database } from '@sovereignfs/database';
import type { TestDatabase } from '@sovereignfs/database/testing';
import {
  createMemoryTransport,
  type ComposedMessage,
  type MemoryTransport,
  type Transport,
} from '@sovereignfs/mailer';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAuth, type Auth } from '../auth/auth';
import { authMailFrom } from '../auth/mail';
import { registrationFrom } from '../auth/registration';
import { resolveAuthSettings } from '../auth/settings';
import { config } from '../config';
import { migrateCore } from '../db/migrate';
import { EmailService } from '../mail/emails';
import { MailService } from '../mail/service';
import { SettingsStore } from '../settings/store';
import { SETTINGS } from '../settings/definitions';
import {
  BASE_URL,
  call,
  freshAddress,
  freshEmail,
  Jar,
  PASSWORD,
  SECRET,
  signedInAs,
  signUp,
  type Reply,
} from './auth-harness';

const MIGRATIONS = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../migrations');
const SESSION_COOKIE = 'better-auth.session_token';
const HOUR = 60 * 60 * 1000;
const NEW_PASSWORD = 'a different long passphrase';
const SMTP = {
  SV_SMTP_HOST: 'smtp.example.com',
  SV_SMTP_FROM: 'Sovereign <no-reply@core.example.com>',
};

/** The first link in an email's text part. */
const linkIn = (message: ComposedMessage | undefined): string => {
  const link = /https?:\/\/[^\s)\]>"']+/.exec(message?.text ?? '')?.[0];
  if (!link) throw new Error('the email carries no link');
  return link;
};

/** What a person sees of an answer, apart from anything that differs by nature (dates, ids). */
const visible = (reply: Reply) => ({
  status: reply.status,
  type: reply.headers.get('content-type'),
  body: reply.body.message ?? reply.body.status ?? Object.keys(reply.body).sort(),
});

export function verificationSuite(createDatabase: () => Promise<TestDatabase>): void {
  let target: TestDatabase;
  let db: Database;
  let transport: MemoryTransport;
  let pending: Promise<unknown>[];

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
    transport = createMemoryTransport();
    pending = [];
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
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

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  const count = async (table: string, where = '', args: unknown[] = []) => {
    const { rows } = await db.run(`select count(*) as n from ${table} ${where}`, args);
    return Number(rows[0]?.n);
  };
  const verified = async (email: string) => {
    const { rows } = await db.run('select email_verified from users where email = ?', [email]);
    return rows[0]?.email_verified === true || rows[0]?.email_verified === 1;
  };

  /**
   * Core's auth with its real mail service. Sends run in the background, as in production, and
   * `settled()` waits for them.
   */
  function start(
    options: {
      env?: Record<string, string>;
      inviteOnly?: boolean;
      via?: Transport;
      noMail?: boolean;
    } = {},
  ) {
    const cfg = config.load({
      SV_URL: BASE_URL,
      SV_AUTH_SECRET: SECRET,
      SV_AUTH_REQUIRE_EMAIL_VERIFICATION: 'true',
      SV_AUTH_INVITE_ONLY: String(options.inviteOnly ?? false),
      ...(options.noMail ? {} : SMTP),
      ...options.env,
    });
    const store = new SettingsStore({
      database: db,
      cipher: FieldCipher.fromKeyRing(`k1:${randomBytes(32).toString('base64')}`),
      config: cfg,
      cacheMs: 0,
    });
    const mail = new MailService(store, { createTransport: () => options.via ?? transport });
    const emails = new EmailService({ mail, settings: store, config: cfg });
    const auth: Auth = createAuth(db, resolveAuthSettings(cfg), {
      registration: registrationFrom(store),
      mail: authMailFrom(emails, mail),
      background: (task) => void pending.push(task),
    });
    const settled = async () => {
      while (pending.length > 0) await Promise.all(pending.splice(0));
    };
    return { auth, store, settled };
  }

  const to = (email: string) => transport.sent.filter((message) => message.to.includes(email));
  const bySubject = (email: string, pattern: RegExp) =>
    to(email).filter((message) => pattern.test(message.subject));

  /** What following an emailed link does: the same request the browser makes. */
  const follow = (auth: Auth, link: string, jar = new Jar()) =>
    call(auth, 'GET', link.replace(`${BASE_URL}/api/auth`, ''), { jar, origin: null });

  const tokenOf = (link: string) => new URL(link).pathname.split('/').at(-1) ?? '';

  async function accountThatIsNotVerified() {
    const { auth, settled } = start();
    const { email, reply } = await signUp(auth);
    expect(reply.status).toBe(200);
    await settled();
    return { auth, settled, email, link: linkIn(transport.last) };
  }

  describe('signing up while verification is required', () => {
    it('makes the account, signs nobody in, and sends a link to the address', async () => {
      const { auth, settled } = start();
      const { reply, jar, email } = await signUp(auth);
      await settled();
      expect(reply.status).toBe(200);
      expect(jar.get(SESSION_COOKIE)).toBeUndefined();
      expect(await count('sessions')).toBe(0);
      expect(await verified(email)).toBe(false);
      expect(to(email)).toHaveLength(1);
      expect(to(email)[0]?.subject).toMatch(/verify/i);
      expect(linkIn(transport.last).startsWith(`${BASE_URL}/api/auth/verify-email?token=`)).toBe(
        true,
      );
    });

    it('does not sign the person in at sign-in either, until the address is verified', async () => {
      const { auth, settled, email } = await accountThatIsNotVerified();
      const jar = new Jar();
      const reply = await call(auth, 'POST', '/sign-in/email', {
        jar,
        body: { email, password: PASSWORD },
      });
      await settled();
      expect(reply.status).toBe(403);
      expect(reply.body.code).toBe('EMAIL_NOT_VERIFIED');
      expect(jar.get(SESSION_COOKIE)).toBeUndefined();
      expect(await count('sessions')).toBe(0);
    });

    it('keeps a wrong password a wrong password, so an unverified address is not confirmed', async () => {
      const { auth, email } = await accountThatIsNotVerified();
      const wrong = await call(auth, 'POST', '/sign-in/email', {
        body: { email, password: `${PASSWORD}x` },
      });
      const unknown = await call(auth, 'POST', '/sign-in/email', {
        body: { email: freshEmail(), password: PASSWORD },
      });
      expect(wrong.status).toBe(401);
      expect(visible(wrong)).toEqual(visible(unknown));
    });

    it('does not send another link when someone tries to sign in, so that cannot fill an inbox', async () => {
      const { auth, settled, email } = await accountThatIsNotVerified();
      for (let i = 0; i < 2; i++) {
        await call(auth, 'POST', '/sign-in/email', { body: { email, password: PASSWORD } });
      }
      await settled();
      expect(to(email)).toHaveLength(1);
    });

    it('says the same to an address that already has an account, and sends nothing', async () => {
      const { auth, settled, email } = await accountThatIsNotVerified();
      const again = await signUp(auth, { email });
      await settled();
      const fresh = await signUp(auth);
      await settled();
      expect(again.reply.status).toBe(200);
      expect(visible(again.reply)).toEqual(visible(fresh.reply));
      expect(await count('users', 'where email = ?', [email])).toBe(1);
      expect(to(email)).toHaveLength(1);
    });

    it('is refused while mail is not set up, for everyone, and stores nothing', async () => {
      const { auth, settled } = start({ noMail: true });
      const { reply, email } = await signUp(auth);
      await settled();
      expect(reply.status).toBe(503);
      expect(reply.body.code).toBe('EMAIL_NOT_AVAILABLE');
      expect(await count('users', 'where email = ?', [email])).toBe(0);
      const existing = await signUp(start().auth);
      const again = await signUp(auth, { email: existing.email });
      expect(visible(again.reply)).toEqual(visible(reply));
    });

    it('still refuses an uninvited address outright, in words a person can act on', async () => {
      await signUp(start().auth);
      const { auth } = start({ inviteOnly: true });
      const { reply } = await signUp(auth);
      expect(reply.status).toBe(422);
      expect(reply.body.code).toBe('INVITE_REQUIRED');
    });

    it('does not need mail when verification is off, and signs the person in', async () => {
      const { auth, settled } = start({
        noMail: true,
        env: { SV_AUTH_REQUIRE_EMAIL_VERIFICATION: 'false' },
      });
      const { reply, jar } = await signUp(auth);
      await settled();
      expect(reply.status).toBe(200);
      expect(jar.get(SESSION_COOKIE)).toBeTruthy();
      expect(transport.sent).toHaveLength(0);
    });
  });

  describe('the verification link', () => {
    it('is on core’s own address, whatever address the request was made to', async () => {
      const { auth, settled } = start();
      const { email } = await signUp(auth);
      await settled();
      const forged = await call(auth, 'POST', '/sign-up/email', {
        headers: { host: 'evil.example', 'x-forwarded-host': 'evil.example' },
        body: { name: 'Eve', email: 'forged@example.com', password: PASSWORD },
      });
      await settled();
      expect(forged.status).toBe(200);
      expect(to(email)).toHaveLength(1);
      for (const message of transport.sent) {
        expect(linkIn(message).startsWith(`${BASE_URL}/`)).toBe(true);
        expect(`${message.text}${message.html}`).not.toContain('evil.example');
      }
    });

    it('verifies the address and signs the person in', async () => {
      const { auth, email, link } = await accountThatIsNotVerified();
      const jar = new Jar();
      const reply = await follow(auth, link, jar);
      expect(reply.status).toBe(302);
      expect(await verified(email)).toBe(true);
      expect(jar.get(SESSION_COOKIE)).toBeTruthy();
      const session = await call(auth, 'GET', '/get-session', { jar });
      expect(signedInAs(session)?.email).toBe(email);
    });

    it('works once: followed again it opens no session, and leaves the account as it was', async () => {
      const { auth, email, link } = await accountThatIsNotVerified();
      await follow(auth, link);
      const sessions = await count('sessions');
      const jar = new Jar();
      const again = await follow(auth, link, jar);
      expect(again.status).toBeLessThan(400);
      expect(jar.get(SESSION_COOKIE)).toBeUndefined();
      expect(await count('sessions')).toBe(sessions);
      expect(await verified(email)).toBe(true);
    });

    it('lets the person sign in with their password afterwards', async () => {
      const { auth, email, link } = await accountThatIsNotVerified();
      await follow(auth, link);
      const jar = new Jar();
      const reply = await call(auth, 'POST', '/sign-in/email', {
        jar,
        body: { email, password: PASSWORD },
      });
      expect(reply.status).toBe(200);
      expect(jar.get(SESSION_COOKIE)).toBeTruthy();
    });

    it('is good for an hour and no longer', async () => {
      const { auth, email, link } = await accountThatIsNotVerified();
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(Date.now() + HOUR + 60_000);
      const jar = new Jar();
      const late = await follow(auth, link, jar);
      expect(late.headers.get('location')).toContain('error=');
      expect(jar.get(SESSION_COOKIE)).toBeUndefined();
      expect(await verified(email)).toBe(false);
    });

    it('is still good a minute before the hour is up', async () => {
      const { auth, email, link } = await accountThatIsNotVerified();
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(Date.now() + HOUR - 60_000);
      await follow(auth, link);
      expect(await verified(email)).toBe(true);
    });

    it('is refused when it has been changed, or was signed for another instance', async () => {
      const { auth, email, link } = await accountThatIsNotVerified();
      const url = new URL(link);
      const token = url.searchParams.get('token') ?? '';
      url.searchParams.set('token', `${token.slice(0, -2)}xx`);
      const jar = new Jar();
      const changed = await follow(auth, url.toString(), jar);
      expect(changed.headers.get('location')).toContain('error=');
      expect(jar.get(SESSION_COOKIE)).toBeUndefined();

      const other = start({ env: { SV_AUTH_SECRET: `other-${SECRET}` } });
      const foreign = await follow(other.auth, link, jar);
      expect(foreign.headers.get('location')).toContain('error=');
      expect(await verified(email)).toBe(false);
    });

    it('will not send the person anywhere but core', async () => {
      const { auth } = start();
      const reply = await call(auth, 'POST', '/sign-up/email', {
        body: {
          name: 'Eve',
          email: freshEmail(),
          password: PASSWORD,
          callbackURL: 'https://evil.example/landing',
        },
      });
      expect(reply.status).toBeGreaterThanOrEqual(400);
      expect(await count('users')).toBe(0);
    });
  });

  describe('asking for a new link', () => {
    it('sends one to an address that is not verified yet', async () => {
      const { auth, settled, email } = await accountThatIsNotVerified();
      const reply = await call(auth, 'POST', '/send-verification-email', { body: { email } });
      await settled();
      expect(reply.status).toBe(200);
      expect(to(email)).toHaveLength(2);
      const jar = new Jar();
      await follow(auth, linkIn(transport.last), jar);
      expect(await verified(email)).toBe(true);
    });

    it('answers alike for an address that is unknown, unverified or already verified', async () => {
      const { auth, settled, email } = await accountThatIsNotVerified();
      const done = await signUp(auth);
      await settled();
      await follow(auth, linkIn(to(done.email)[0]));
      await settled();
      transport.clear();

      const ask = (address: string) =>
        call(auth, 'POST', '/send-verification-email', { body: { email: address } });
      const unverified = await ask(email);
      const alreadyVerified = await ask(done.email);
      const unknown = await ask(freshEmail());
      await settled();
      expect(unverified.status).toBe(200);
      expect(visible(alreadyVerified)).toEqual(visible(unverified));
      expect(visible(unknown)).toEqual(visible(unverified));
      expect(to(done.email)).toHaveLength(0);
      expect(to(email)).toHaveLength(1);
    });

    it('is limited, so it cannot be used to fill an inbox', async () => {
      const { auth, email } = await accountThatIsNotVerified();
      const address = freshAddress();
      const statuses: number[] = [];
      for (let i = 0; i < 5; i++) {
        statuses.push(
          (await call(auth, 'POST', '/send-verification-email', { body: { email }, address }))
            .status,
        );
      }
      expect(statuses).toContain(429);
      expect(statuses.slice(0, 3)).toEqual([200, 200, 200]);
    });

    it('fails clearly, the same for everyone, while mail is not set up', async () => {
      const { auth } = start({ noMail: true });
      const known = await call(auth, 'POST', '/send-verification-email', {
        body: { email: (await accountThatIsNotVerified()).email },
      });
      const unknown = await call(auth, 'POST', '/send-verification-email', {
        body: { email: freshEmail() },
      });
      expect(known.status).toBe(503);
      expect(known.body.code).toBe('EMAIL_NOT_AVAILABLE');
      expect(visible(unknown)).toEqual(visible(known));
    });
  });

  describe('the account created email', () => {
    it('waits for the address to be verified when verification is required', async () => {
      const { auth, settled, email } = await accountThatIsNotVerified();
      expect(bySubject(email, /welcome|account|created/i)).toHaveLength(0);
      await follow(auth, linkIn(transport.last));
      await settled();
      const sent = to(email);
      expect(sent).toHaveLength(2);
      expect(sent[1]?.subject).not.toBe(sent[0]?.subject);
      expect(linkIn(sent[1])).toBe(`${BASE_URL}/sign-in`);
      expect(sent[1]?.text).toContain('Ada Lovelace');
    });

    it('is sent at sign-up when verification is off, and is the only email', async () => {
      const { auth, settled } = start({ env: { SV_AUTH_REQUIRE_EMAIL_VERIFICATION: 'false' } });
      const { email, reply } = await signUp(auth);
      await settled();
      expect(reply.status).toBe(200);
      expect(to(email)).toHaveLength(1);
      expect(linkIn(transport.last)).toBe(`${BASE_URL}/sign-in`);
    });

    it('is sent once: following the link again sends nothing more', async () => {
      const { auth, settled, link } = await accountThatIsNotVerified();
      await follow(auth, link);
      await follow(auth, link);
      await settled();
      expect(transport.sent).toHaveLength(2);
    });
  });

  describe('when the mail server is not working', () => {
    const slow = (delay: number): Transport => ({
      send: async (message) => {
        await new Promise((resolve) => setTimeout(resolve, delay));
        return transport.send(message);
      },
    });

    it('does not change what sign-up says, and says why in the log', async () => {
      const { auth, settled } = start();
      transport.failNextWith(new Error('connection refused'));
      const { reply, email } = await signUp(auth);
      await settled();
      expect(reply.status).toBe(200);
      expect(await count('users', 'where email = ?', [email])).toBe(1);
      expect(transport.sent).toHaveLength(0);
      expect(console.warn).toHaveBeenCalledWith(
        expect.stringContaining('Could not send the verification email'),
      );
    });

    it('does not make a reset request wait for the mail server, so its time tells nothing', async () => {
      const { email } = await accountThatIsNotVerified();
      const { auth, settled } = start({ via: slow(800) });
      const started = performance.now();
      const reply = await call(auth, 'POST', '/request-password-reset', { body: { email } });
      const took = performance.now() - started;
      expect(reply.status).toBe(200);
      expect(took).toBeLessThan(400);
      await settled();
      expect(bySubject(email, /reset/i)).toHaveLength(1);
    });
  });

  describe('forgetting a password', () => {
    async function accountWithPassword() {
      const { auth, settled } = start();
      const { email, reply } = await signUp(auth);
      expect(reply.status).toBe(200);
      await settled();
      await follow(auth, linkIn(transport.last));
      await settled();
      transport.clear();
      // Following the link signed the person in; these tests open their own sessions.
      await db.run('delete from sessions');
      return { auth, settled, email };
    }
    const requestReset = (auth: Auth, email: string, address = freshAddress()) =>
      call(auth, 'POST', '/request-password-reset', {
        body: { email, redirectTo: '/reset-password' },
        address,
      });
    const complete = (auth: Auth, token: string, newPassword = NEW_PASSWORD) =>
      call(auth, 'POST', '/reset-password', { body: { token, newPassword } });

    it('sends a link to a known address and tells the person to look for it', async () => {
      const { auth, settled, email } = await accountWithPassword();
      const reply = await requestReset(auth, email);
      await settled();
      expect(reply.status).toBe(200);
      expect(to(email)).toHaveLength(1);
      expect(to(email)[0]?.subject).toMatch(/reset/i);
      expect(linkIn(transport.last).startsWith(`${BASE_URL}/api/auth/reset-password/`)).toBe(true);
    });

    it('answers exactly the same for an address that has no account, and sends nothing', async () => {
      const { auth, settled, email } = await accountWithPassword();
      const known = await requestReset(auth, email);
      await settled();
      expect(transport.sent).toHaveLength(1);
      transport.clear();
      const unknown = await requestReset(auth, freshEmail());
      await settled();
      expect(visible(unknown)).toEqual(visible(known));
      expect(unknown.body).toEqual(known.body);
      expect(transport.sent).toHaveLength(0);
    });

    it('answers the same for an account that is not verified yet', async () => {
      const { auth, settled } = await accountWithPassword();
      const pendingAccount = await accountThatIsNotVerified();
      const reply = await requestReset(auth, pendingAccount.email);
      await settled();
      const unknown = await requestReset(auth, freshEmail());
      expect(visible(reply)).toEqual(visible(unknown));
    });

    it('sets the new password, and the old one stops working', async () => {
      const { auth, settled, email } = await accountWithPassword();
      await requestReset(auth, email);
      await settled();
      const token = tokenOf(linkIn(transport.last));
      const done = await complete(auth, token);
      expect(done.status).toBe(200);

      const old = await call(auth, 'POST', '/sign-in/email', {
        body: { email, password: PASSWORD },
      });
      expect(old.status).toBe(401);
      const jar = new Jar();
      const fresh = await call(auth, 'POST', '/sign-in/email', {
        jar,
        body: { email, password: NEW_PASSWORD },
      });
      expect(fresh.status).toBe(200);
    });

    it('goes through core’s own page, which gets the token and nothing about anyone', async () => {
      const { auth, settled, email } = await accountWithPassword();
      await requestReset(auth, email);
      await settled();
      const reply = await follow(auth, linkIn(transport.last));
      const location = new URL(reply.headers.get('location') ?? '', BASE_URL);
      expect(location.pathname).toBe('/reset-password');
      expect(location.searchParams.get('token')).toBeTruthy();
      expect(location.href).not.toContain(email);
    });

    it('works once', async () => {
      const { auth, settled, email } = await accountWithPassword();
      await requestReset(auth, email);
      await settled();
      const token = tokenOf(linkIn(transport.last));
      expect((await complete(auth, token)).status).toBe(200);
      const again = await complete(auth, token, 'yet another passphrase');
      expect(again.status).toBe(400);
      expect(again.body.code).toBe('INVALID_TOKEN');
      const jar = new Jar();
      const signIn = await call(auth, 'POST', '/sign-in/email', {
        jar,
        body: { email, password: NEW_PASSWORD },
      });
      expect(signIn.status).toBe(200);
    });

    it('is good for an hour and no longer', async () => {
      const { auth, settled, email } = await accountWithPassword();
      await requestReset(auth, email);
      await settled();
      const link = linkIn(transport.last);
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(Date.now() + HOUR + 60_000);
      const late = await follow(auth, link);
      expect(late.headers.get('location')).toContain('error=INVALID_TOKEN');
      const refused = await complete(auth, tokenOf(link));
      expect(refused.status).toBe(400);
      vi.setSystemTime(Date.now() - HOUR);
      const old = await call(auth, 'POST', '/sign-in/email', {
        body: { email, password: PASSWORD },
      });
      expect(old.status).toBe(200);
    });

    it('ends every session the account had, even one whose cookie still carries a signed cache', async () => {
      const { auth, settled, email } = await accountWithPassword();
      const phone = new Jar();
      const laptop = new Jar();
      for (const jar of [phone, laptop]) {
        const reply = await call(auth, 'POST', '/sign-in/email', {
          jar,
          body: { email, password: PASSWORD },
        });
        expect(reply.status).toBe(200);
        // The session answers from the signed cache first; warm it, as an open page would.
        expect(signedInAs(await call(auth, 'GET', '/get-session', { jar }))?.email).toBe(email);
      }
      expect(await count('sessions')).toBe(2);

      await requestReset(auth, email);
      await settled();
      expect((await complete(auth, tokenOf(linkIn(transport.last)))).status).toBe(200);

      expect(await count('sessions')).toBe(0);
      // What core's own pages ask: the database, not the signed cache (see auth/session.ts).
      for (const jar of [phone, laptop]) {
        const session = await call(auth, 'GET', '/get-session?disableCookieCache=true', { jar });
        expect(signedInAs(session)).toBeNull();
      }
    });

    it('refuses a password that breaks the policy and keeps the link for another try', async () => {
      const { auth, settled, email } = await accountWithPassword();
      await requestReset(auth, email);
      await settled();
      const token = tokenOf(linkIn(transport.last));
      const weak = await complete(auth, token, 'x');
      expect(weak.status).toBe(400);
      expect(weak.body.code).toBe('PASSWORD_DOES_NOT_MEET_POLICY');
      expect((await complete(auth, token)).status).toBe(200);
    });

    it('does not make an unverified address verified: that is for the verification link', async () => {
      const { auth, settled, email } = await accountThatIsNotVerified();
      await requestReset(auth, email);
      await settled();
      const token = tokenOf(linkIn(transport.last));
      expect((await complete(auth, token)).status).toBe(200);
      expect(await verified(email)).toBe(false);
      const signIn = await call(auth, 'POST', '/sign-in/email', {
        body: { email, password: NEW_PASSWORD },
      });
      expect(signIn.status).toBe(403);
    });

    it('will not send the person anywhere but core after the link', async () => {
      const { auth, email } = await accountWithPassword();
      const reply = await call(auth, 'POST', '/request-password-reset', {
        body: { email, redirectTo: 'https://evil.example/reset' },
      });
      expect(reply.status).toBeGreaterThanOrEqual(400);
      expect(transport.sent).toHaveLength(0);
    });

    it('is limited, so it cannot be used to fill an inbox', async () => {
      const { auth, email } = await accountWithPassword();
      const address = freshAddress();
      const statuses: number[] = [];
      for (let i = 0; i < 5; i++) statuses.push((await requestReset(auth, email, address)).status);
      expect(statuses.slice(0, 3)).toEqual([200, 200, 200]);
      expect(statuses).toContain(429);
    });

    it('fails clearly, the same for everyone, while mail is not set up', async () => {
      const { email } = await accountWithPassword();
      const { auth } = start({ noMail: true });
      const known = await requestReset(auth, email);
      const unknown = await requestReset(auth, freshEmail());
      expect(known.status).toBe(503);
      expect(known.body.code).toBe('EMAIL_NOT_AVAILABLE');
      expect(visible(unknown)).toEqual(visible(known));
    });

    it('needs no verification setting: reset works when verification is off', async () => {
      const { auth, settled } = start({ env: { SV_AUTH_REQUIRE_EMAIL_VERIFICATION: 'false' } });
      const { email } = await signUp(auth);
      await settled();
      transport.clear();
      await requestReset(auth, email);
      await settled();
      expect((await complete(auth, tokenOf(linkIn(transport.last)))).status).toBe(200);
    });
  });

  describe('the verification setting', () => {
    it('is on unless it is turned off', async () => {
      const on = start({ env: { SV_AUTH_REQUIRE_EMAIL_VERIFICATION: 'true' } });
      const { reply } = await signUp(on.auth);
      expect(reply.body.token).toBeNull();
      const settings = resolveAuthSettings(
        config.load({ SV_URL: BASE_URL, SV_AUTH_SECRET: SECRET }),
      );
      expect(settings.requireEmailVerification).toBe(true);
    });

    it('keeps instance settings reachable for the mail it needs', async () => {
      const { store } = start();
      await store.set(SETTINGS.instanceName, 'Our Place');
      const { auth, settled } = start();
      const { email } = await signUp(auth);
      await settled();
      expect(to(email)[0]?.html).toContain('Our Place');
    });
  });
}
