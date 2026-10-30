/**
 * Email for apps (core-app §4.2) against a real database: who may be written to, what a message may say, how many, what a person
 * controls, and what ends them. One suite, run by `mail-for-apps.test.ts` on a SQLite file and by `mail-for-apps.db.test.ts` on
 * whichever dialect the CI leg started.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Database } from '@sovereignfs/database';
import type { TestDatabase } from '@sovereignfs/database/testing';
import { renderEmail, type SentMail, type SmtpStatus } from '@sovereignfs/mailer';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AccountManager } from '../accounts/manage';
import { AccountStates } from '../accounts/states';
import { migrateCore } from '../db/migrate';
import {
  APP_LIMIT,
  AppMailError,
  MailForAppsService,
  PAIR_DAY_LIMIT,
  PAIR_HOUR_LIMIT,
  type AppMailTransport,
} from '../mail/apps';
import { coreApiResource } from '../oauth/provider';
import { removeAccess } from '../oauth/revocation';
import { BASE_URL, makeAuthWithTasks, signUp } from './auth-harness';
import { REDIRECT, actorOf, personToken, registryFor, useDatabase } from './oauth-harness';

const MIGRATIONS = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../migrations');
const TABLES = [
  'app_mail_settings',
  'app_mail_keys',
  'notification_settings',
  'notifications',
  'app_token_revocations',
  'managed_clients',
  'token_revocations',
  'oauth_access_tokens',
  'oauth_refresh_tokens',
  'oauth_consents',
  'oauth_client_resources',
  'oauth_clients',
  'oauth_resources',
  'jwks',
  'capability_overrides',
  'rate_limits',
  'sessions',
  'accounts',
  'verifications',
  'users',
];
const AUDIENCE = coreApiResource(new URL(BASE_URL).origin);
const DAY = 24 * 60 * 60 * 1000;
const CONFIGURED: SmtpStatus = {
  state: 'configured',
  settings: { host: 'smtp.example.test', port: 587, from: 'core@example.test' },
};
const NOT_CONFIGURED: SmtpStatus = {
  state: 'not-configured',
  reasons: ['SV_SMTP_HOST is not set'],
};

type Sent = { to: string; subject: string; text: string; html: string; unsubscribe: string };

export function mailForAppsSuite(createDatabase: () => Promise<TestDatabase>): void {
  let target: TestDatabase;
  let db: Database;
  let clock = Date.now();
  let status: SmtpStatus = CONFIGURED;
  let sent: Sent[] = [];
  let log: string[] = [];
  /** When set, the mail server takes its time: a send waits for `release`. */
  let hold: Promise<void> | undefined;
  let failWith: Error | undefined;

  const bool = (value: boolean) => (db.family === 'postgres' ? value : value ? 1 : 0);

  beforeAll(async () => {
    target = await createDatabase();
    db = await target.open();
    await migrateCore(db, MIGRATIONS);
    useDatabase(db);
  });
  afterAll(async () => {
    await db.close().catch(() => undefined);
    await target.cleanup();
  });
  beforeEach(async () => {
    clock = Date.now();
    status = CONFIGURED;
    sent = [];
    log = [];
    hold = undefined;
    failWith = undefined;
    for (const table of TABLES) await db.run(`delete from ${table}`);
  });

  const transport: AppMailTransport = {
    status: () => Promise.resolve(status),
    async send(message): Promise<SentMail> {
      if (hold) await hold;
      if (failWith) throw failWith;
      sent.push(message);
      return { accepted: [message.to], rejected: [] };
    },
  };
  const service = () =>
    new MailForAppsService(
      db,
      transport,
      (request) => renderEmail(request, { name: 'Acme Identity', instanceUrl: BASE_URL }),
      `${BASE_URL}/preferences`,
      { now: () => clock, development: true, log: (line) => log.push(line) },
    );

  /** An owner, an app that may email, and a person who has used it and whose address is verified. */
  async function instance() {
    const { auth } = makeAuthWithTasks(db);
    const owner = await signUp(auth, { name: 'Olive Owner' });
    const ada = await signUp(auth, { name: 'Ada Lovelace', email: 'ada@example.com' });
    const bo = await signUp(auth, { name: 'Bo Barnes', email: 'bo@example.com' });
    const registry = registryFor(auth);
    const asOwner = await actorOf(auth, owner.jar);
    const idOf = async (email: string) =>
      String((await db.run('select id from users where email = ?', [email])).rows[0]?.id);
    const make = async (name: string, extra: Record<string, unknown> = {}) => {
      const { client, secret } = await registry.register(asOwner, {
        name,
        redirectUris: [REDIRECT],
        scopes: ['openid', 'profile', 'directory'],
        appScopes: ['email:send'],
        launcher: { launchUrl: 'https://reminders.example.test/' },
        ...extra,
      });
      return { clientId: client.clientId, secret };
    };
    const use = async (
      jar: typeof ada.jar,
      app: { clientId: string; secret: string | undefined },
    ) => personToken(auth, jar, app, { audience: AUDIENCE });
    const verify = (id: string) =>
      db.run('update users set email_verified = ? where id = ?', [bool(true), id]);
    const app = await make('Reminders');
    await use(ada.jar, app);
    const adaId = await idOf(ada.email);
    await verify(adaId);
    return {
      auth,
      registry,
      asOwner,
      app,
      make,
      use,
      verify,
      ada: { ...ada, id: adaId },
      bo: { ...bo, id: await idOf(bo.email) },
    };
  }

  const message = (to: string, extra: Record<string, unknown> = {}) => ({
    to,
    subject: 'Your task is due',
    body: 'Water the plants.',
    ...extra,
  });
  const failed = async (run: () => Promise<unknown>) => {
    try {
      await run();
    } catch (error) {
      if (error instanceof AppMailError) return error;
      throw error;
    }
    return undefined;
  };
  const keys = async () =>
    Number((await db.run('select count(*) as n from app_mail_keys')).rows[0]?.n);

  describe('sending', () => {
    it('sends to a person who has used the app, from the instance, under the app’s name, to their address', async () => {
      const ctx = await instance();
      const mail = service();
      const answer = await mail.send(ctx.app.clientId, message(ctx.ada.id));
      await mail.settled();
      expect(answer.id).toBeTruthy();
      expect(sent).toHaveLength(1);
      expect(sent[0]).toMatchObject({
        to: 'ada@example.com',
        subject: 'Reminders: Your task is due',
      });
      expect(sent[0]?.text).toContain('Water the plants.');
      expect(sent[0]?.text).toContain('From Reminders, through Acme Identity');
      expect(sent[0]?.text).toContain(`${BASE_URL}/preferences`);
      expect(sent[0]?.unsubscribe).toBe(`${BASE_URL}/preferences`);
    });

    it('gives the app its id and nothing of the person’s address', async () => {
      const ctx = await instance();
      const mail = service();
      const answer = await mail.send(ctx.app.clientId, message(ctx.ada.id));
      await mail.settled();
      expect(Object.keys(answer)).toEqual(['id']);
      expect(JSON.stringify(answer)).not.toContain('ada@example.com');
      expect(log.join('\n')).not.toContain('ada@example.com');
    });

    it('answers a send to someone who may not receive it exactly as a delivered one, and sends nothing', async () => {
      const ctx = await instance();
      const mail = service();
      const delivered = await mail.send(ctx.app.clientId, message(ctx.ada.id));
      const never = await mail.send(ctx.app.clientId, message(ctx.bo.id)); // never used the app
      await ctx.use(ctx.bo.jar, ctx.app); // has used it, but the address is not verified
      const unverified = await mail.send(ctx.app.clientId, message(ctx.bo.id));
      const nobody = await mail.send(ctx.app.clientId, message('no-such-account'));
      await mail.settled();
      for (const other of [never, unverified, nobody]) {
        expect(Object.keys(other)).toEqual(Object.keys(delivered));
      }
      expect(sent).toHaveLength(1);
      await ctx.verify(ctx.bo.id);
      await new AccountStates(db, { log: () => undefined }).deactivate(ctx.bo.id);
      await mail.send(ctx.app.clientId, message(ctx.bo.id));
      await mail.settled();
      expect(sent).toHaveLength(1);
    });

    it('tells the operator why a send was dropped, without the text or the person', async () => {
      const ctx = await instance();
      const mail = service();
      await ctx.verify(ctx.bo.id);
      await mail.send(ctx.app.clientId, message(ctx.bo.id, { body: 'a secret body' }));
      const lines = log.join('\n');
      expect(lines).toContain(ctx.app.clientId);
      expect(lines).toContain('has not used the app');
      expect(lines).not.toContain('a secret body');
      expect(lines).not.toContain(ctx.bo.id);
      expect(lines).not.toContain('bo@example.com');
    });

    it('drops a send to someone who switched the app’s email off, and sends again when they switch it on', async () => {
      const ctx = await instance();
      const mail = service();
      await mail.setEnabled(ctx.ada.id, ctx.app.clientId, false);
      const dropped = await mail.send(ctx.app.clientId, message(ctx.ada.id));
      await mail.settled();
      expect(dropped.id).toBeTruthy();
      expect(sent).toHaveLength(0);
      await mail.setEnabled(ctx.ada.id, ctx.app.clientId, true);
      await mail.send(ctx.app.clientId, message(ctx.ada.id));
      await mail.settled();
      expect(sent).toHaveLength(1);
    });

    it('is not there on an instance with no mail: the operation fails before anything is counted', async () => {
      const ctx = await instance();
      status = NOT_CONFIGURED;
      const mail = service();
      expect(await mail.available()).toBe(false);
      const error = await failed(() => mail.send(ctx.app.clientId, message(ctx.ada.id)));
      expect(error?.code).toBe('unavailable');
      const counted = await db.run("select count(*) as n from rate_limits where key like 'mail-%'");
      expect(Number(counted.rows[0]?.n)).toBe(0);
    });

    it('answers before the mail server has the message, so a delivered send takes no longer than a dropped one', async () => {
      const ctx = await instance();
      let release: () => void = () => undefined;
      hold = new Promise<void>((resolve) => (release = resolve));
      const mail = service();
      const answer = await mail.send(ctx.app.clientId, message(ctx.ada.id));
      expect(answer.id).toBeTruthy();
      expect(sent).toHaveLength(0);
      release();
      await mail.settled();
      expect(sent).toHaveLength(1);
    });

    it('drops, logs and does not retry a message the mail server could not take', async () => {
      const ctx = await instance();
      failWith = new Error('connection refused at smtp.example.test for ada@example.com');
      const mail = service();
      const answer = await mail.send(ctx.app.clientId, message(ctx.ada.id));
      await mail.settled();
      expect(answer.id).toBeTruthy();
      expect(sent).toHaveLength(0);
      expect(log.join('\n')).toContain('could not be sent');
      expect(log.join('\n')).not.toContain('ada@example.com');
    });

    it('refuses what cannot be used, saying every thing wrong, before it counts or keeps anything', async () => {
      const ctx = await instance();
      const error = await failed(() =>
        service().send(ctx.app.clientId, {
          to: '',
          subject: 'x'.repeat(151),
          body: 'y'.repeat(5001),
          link: 'http://reminders.example.test/',
          key: 'k'.repeat(101),
        }),
      );
      expect(error?.code).toBe('invalid');
      expect(error?.problems.map((problem) => problem.field).sort()).toEqual(
        ['body', 'key', 'link', 'subject', 'to'].sort(),
      );
      const counted = await db.run("select count(*) as n from rate_limits where key like 'mail-%'");
      expect(Number(counted.rows[0]?.n)).toBe(0);
      expect(await keys()).toBe(0);
    });

    it('takes plain text: a subject is one line, a body keeps its line breaks, and neither is read as markup', async () => {
      const ctx = await instance();
      const mail = service();
      for (const extra of [
        { subject: '   ' },
        { subject: 'two\nlines' },
        { subject: 'a\u0000b' },
        { body: 'a\u001bb' },
        { body: '' },
        { subject: 5 },
      ]) {
        expect(
          (await failed(() => mail.send(ctx.app.clientId, message(ctx.ada.id, extra))))?.code,
        ).toBe('invalid');
      }
      await mail.send(
        ctx.app.clientId,
        message(ctx.ada.id, { subject: '<b>Hi</b> & welcome', body: 'one\n\ttwo\r\nthree' }),
      );
      await mail.settled();
      expect(sent[0]?.subject).toBe('Reminders: <b>Hi</b> & welcome');
      expect(sent[0]?.text).toContain('one\n\ttwo\nthree');
      expect(sent[0]?.html).not.toContain('<b>Hi</b>');
    });

    it('lets a link go only to an https address on one of the app’s own, and nowhere else', async () => {
      const ctx = await instance();
      const mail = service();
      await mail.send(
        ctx.app.clientId,
        message(ctx.ada.id, { link: 'https://reminders.example.test/tasks/3' }),
      );
      await mail.send(
        ctx.app.clientId,
        message(ctx.ada.id, { link: `${new URL(REDIRECT).origin}/x` }),
      );
      await mail.settled();
      expect(sent[0]?.text).toContain('Open Reminders: https://reminders.example.test/tasks/3');
      for (const link of [
        'https://evil.example.test/',
        `${BASE_URL}/reset-password`, // core's own address is not the app's
        'https://user:pw@reminders.example.test/',
        'javascript:alert(1)',
        'not an address',
        'http://reminders.example.test/',
      ]) {
        const error = await failed(() =>
          mail.send(ctx.app.clientId, message(ctx.ada.id, { link })),
        );
        expect(error?.problems[0]?.field, link).toBe('link');
      }
    });

    it('treats a repeated key within a day as the same send, and keeps only the key', async () => {
      const ctx = await instance();
      const mail = service();
      const first = await mail.send(ctx.app.clientId, message(ctx.ada.id, { key: 'due-3' }));
      const again = await mail.send(ctx.app.clientId, message(ctx.ada.id, { key: 'due-3' }));
      await mail.settled();
      expect(again.id).toBe(first.id);
      expect(sent).toHaveLength(1);
      const row = (await db.run('select * from app_mail_keys')).rows[0];
      expect(JSON.stringify(row)).not.toContain('Water the plants');
      clock += DAY + 1000;
      const later = await mail.send(ctx.app.clientId, message(ctx.ada.id, { key: 'due-3' }));
      await mail.settled();
      expect(later.id).not.toBe(first.id);
      expect(sent).toHaveLength(2);
      expect(await keys()).toBe(1); // the old key was removed with the new one
    });

    it('keeps no key for a send that carried none or that was dropped', async () => {
      const ctx = await instance();
      const mail = service();
      await mail.send(ctx.app.clientId, message(ctx.ada.id));
      await mail.send(ctx.app.clientId, message(ctx.bo.id, { key: 'k' }));
      expect(await keys()).toBe(0);
    });

    it('stops an app that writes to one person too often, with a time to wait, and not another person', async () => {
      const ctx = await instance();
      const mail = service();
      for (let i = 0; i < PAIR_HOUR_LIMIT.count; i += 1)
        await mail.send(ctx.app.clientId, message(ctx.ada.id));
      const error = await failed(() => mail.send(ctx.app.clientId, message(ctx.ada.id)));
      expect(error?.code).toBe('rate-limited');
      expect(error?.retryAfter).toBeGreaterThan(0);
      await mail.send(ctx.app.clientId, message(ctx.bo.id));
      await mail.settled();
      expect(sent).toHaveLength(PAIR_HOUR_LIMIT.count);
    });

    it('allows a person only so many from one app in a day, however it is spread', async () => {
      const ctx = await instance();
      const mail = service();
      // Windows are fixed: start a minute into a day so the sends below stay in one day and never more than five in an hour.
      clock = Math.floor(Date.now() / DAY) * DAY + 60_000;
      for (let i = 0; i < PAIR_DAY_LIMIT.count; i += 1) {
        clock += 13 * 60_000; // never more than the hour's limit
        await mail.send(ctx.app.clientId, message(ctx.ada.id));
      }
      clock += 13 * 60_000;
      expect((await failed(() => mail.send(ctx.app.clientId, message(ctx.ada.id))))?.code).toBe(
        'rate-limited',
      );
      clock += DAY;
      await mail.send(ctx.app.clientId, message(ctx.ada.id));
    });

    it('has a limit for the whole app, too', () => {
      expect(APP_LIMIT.count).toBe(100);
      expect(PAIR_HOUR_LIMIT.count).toBe(5);
      expect(PAIR_DAY_LIMIT.count).toBe(20);
    });
  });

  describe('what a person controls', () => {
    it('lists the apps that can email them, with a switch, and not an app that cannot', async () => {
      const ctx = await instance();
      const quiet = await ctx.make('Quiet', { appScopes: ['notifications:send'] });
      await ctx.use(ctx.ada.jar, quiet);
      const mail = service();
      expect(await mail.apps(ctx.ada.id)).toEqual([
        { clientId: ctx.app.clientId, name: 'Reminders', enabled: true },
      ]);
      await mail.setEnabled(ctx.ada.id, ctx.app.clientId, false);
      expect((await mail.apps(ctx.ada.id))[0]?.enabled).toBe(false);
      expect(await mail.apps(ctx.bo.id)).toEqual([]);
    });

    it('is a switch for each app, apart from the others’', async () => {
      const ctx = await instance();
      const other = await ctx.make('Other');
      await ctx.use(ctx.ada.jar, other);
      const mail = service();
      await mail.setEnabled(ctx.ada.id, ctx.app.clientId, false);
      await mail.send(other.clientId, message(ctx.ada.id));
      await mail.send(ctx.app.clientId, message(ctx.ada.id));
      await mail.settled();
      expect(sent.map((email) => email.subject)).toEqual(['Other: Your task is due']);
    });
  });

  describe('what ends them', () => {
    it('is Remove access: the switch and the keys go, and the app can write no more', async () => {
      const ctx = await instance();
      const mail = service();
      await mail.setEnabled(ctx.ada.id, ctx.app.clientId, true);
      await mail.send(ctx.app.clientId, message(ctx.ada.id, { key: 'k' }));
      await mail.settled();
      await removeAccess(db, ctx.ada.id, ctx.app.clientId);
      expect(await keys()).toBe(0);
      expect(Number((await db.run('select count(*) as n from app_mail_settings')).rows[0]?.n)).toBe(
        0,
      );
      await mail.send(ctx.app.clientId, message(ctx.ada.id));
      await mail.settled();
      expect(sent).toHaveLength(1);
      expect(await mail.apps(ctx.ada.id)).toEqual([]);
    });

    it('is deleting the app', async () => {
      const ctx = await instance();
      const mail = service();
      await mail.setEnabled(ctx.ada.id, ctx.app.clientId, false);
      await mail.send(ctx.app.clientId, message(ctx.ada.id, { key: 'k' }));
      await ctx.registry.remove(ctx.asOwner, ctx.app.clientId);
      expect(Number((await db.run('select count(*) as n from app_mail_settings')).rows[0]?.n)).toBe(
        0,
      );
      expect(await keys()).toBe(0);
    });

    it('is deleting the account', async () => {
      const ctx = await instance();
      const mail = service();
      await mail.send(ctx.app.clientId, message(ctx.ada.id, { key: 'k' }));
      await mail.setEnabled(ctx.ada.id, ctx.app.clientId, false);
      const manager = new AccountManager(db, new AccountStates(db, { log: () => undefined }), {
        log: () => undefined,
      });
      await manager.deleteSelf({ id: ctx.ada.id, role: 'platform:user' });
      expect(await keys()).toBe(0);
      expect(Number((await db.run('select count(*) as n from app_mail_settings')).rows[0]?.n)).toBe(
        0,
      );
    });
  });
}
