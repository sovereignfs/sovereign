/**
 * Notifications for apps (core-app §4.1) against a real database: who may be written to, what a message may say, how many, what a
 * person controls, and what ends them. One suite, run by `notifications.test.ts` on a SQLite file and by
 * `notifications.db.test.ts` on whichever dialect the CI leg started.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Database } from '@sovereignfs/database';
import type { TestDatabase } from '@sovereignfs/database/testing';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AccountManager } from '../accounts/manage';
import { AccountStates } from '../accounts/states';
import { migrateCore } from '../db/migrate';
import {
  APP_LIMIT,
  NotificationError,
  NotificationService,
  PAIR_LIMIT,
} from '../notifications/service';
import { removeAccess } from '../oauth/revocation';
import { coreApiResource } from '../oauth/provider';
import { BASE_URL, makeAuthWithTasks, signUp } from './auth-harness';
import { REDIRECT, actorOf, personToken, registryFor, useDatabase } from './oauth-harness';

const MIGRATIONS = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../migrations');
const TABLES = [
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

export function notificationsSuite(createDatabase: () => Promise<TestDatabase>): void {
  let target: TestDatabase;
  let db: Database;
  let clock = Date.now();

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
    for (const table of TABLES) await db.run(`delete from ${table}`);
  });

  const service = () => new NotificationService(db, { now: () => clock, development: true });

  /** An owner, an app that may send, and a person who has used it (and agreed to it). */
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
        appScopes: ['notifications:send'],
        launcher: { launchUrl: 'https://reminders.example.test/' },
        ...extra,
      });
      return { clientId: client.clientId, secret };
    };
    const use = async (
      jar: typeof ada.jar,
      app: { clientId: string; secret: string | undefined },
    ) => personToken(auth, jar, app, { audience: AUDIENCE });
    const app = await make('Reminders');
    await use(ada.jar, app);
    return {
      auth,
      registry,
      asOwner,
      app,
      make,
      use,
      ada: { ...ada, id: await idOf(ada.email) },
      bo: { ...bo, id: await idOf(bo.email) },
      ownerId: await idOf(owner.email),
    };
  }

  const count = async (where = '1 = 1') =>
    Number((await db.run(`select count(*) as n from notifications where ${where}`)).rows[0]?.n);
  const message = (to: string, extra: Record<string, unknown> = {}) => ({
    to,
    title: 'Due today',
    ...extra,
  });
  const failed = async (run: () => Promise<unknown>) => {
    try {
      await run();
    } catch (error) {
      if (error instanceof NotificationError) return error;
      throw error;
    }
    return undefined;
  };

  describe('sending', () => {
    it('keeps a notification for a person who has used the app, from the app and no one else', async () => {
      const ctx = await instance();
      const sent = await service().send(
        ctx.app.clientId,
        message(ctx.ada.id, { body: 'Water the plants' }),
      );
      const [item] = await service().list(ctx.ada.id);
      expect(item).toMatchObject({
        id: sent.id,
        clientId: ctx.app.clientId,
        appName: 'Reminders',
        title: 'Due today',
        body: 'Water the plants',
        url: null,
        category: 'info',
        readAt: null,
      });
      expect(item?.expiresAt).toBe(clock + 30 * DAY);
      expect(await service().unreadCount(ctx.ada.id)).toBe(1);
    });

    it('answers a send to someone who may not receive it exactly as a delivered one, and keeps nothing', async () => {
      const ctx = await instance();
      const delivered = await service().send(ctx.app.clientId, message(ctx.ada.id));
      const never = await service().send(ctx.app.clientId, message(ctx.bo.id)); // never used the app
      const nobody = await service().send(ctx.app.clientId, message('no-such-account'));
      expect(Object.keys(never)).toEqual(Object.keys(delivered));
      expect(Object.keys(nobody)).toEqual(Object.keys(delivered));
      expect(await count()).toBe(1);
      await new AccountStates(db, { log: () => undefined }).deactivate(ctx.ada.id);
      await service().send(ctx.app.clientId, message(ctx.ada.id));
      expect(await count()).toBe(1);
    });

    it('drops a send to someone who switched the app off, and writes again when they switch it on', async () => {
      const ctx = await instance();
      await service().setEnabled(ctx.ada.id, ctx.app.clientId, false);
      const dropped = await service().send(ctx.app.clientId, message(ctx.ada.id));
      expect(dropped.id).toBeTruthy();
      expect(await count()).toBe(0);
      await service().setEnabled(ctx.ada.id, ctx.app.clientId, true);
      await service().send(ctx.app.clientId, message(ctx.ada.id));
      expect(await count()).toBe(1);
    });

    it('refuses what cannot be used, saying every thing wrong, before it counts or keeps anything', async () => {
      const ctx = await instance();
      const error = await failed(() =>
        service().send(ctx.app.clientId, {
          to: '',
          title: 'x'.repeat(121),
          body: 'y'.repeat(501),
          category: 'loud',
          url: 'http://reminders.example.test/',
          expiresAt: 'tomorrow',
          key: 'k'.repeat(101),
        }),
      );
      expect(error?.code).toBe('invalid');
      expect(error?.problems.map((problem) => problem.field).sort()).toEqual(
        ['body', 'category', 'expiresAt', 'key', 'title', 'to', 'url'].sort(),
      );
      expect(await count()).toBe(0);
      const kept = await db.run("select count(*) as n from rate_limits where key like 'notify-%'");
      expect(Number(kept.rows[0]?.n)).toBe(0);
    });

    it('takes text and not markup or control characters, and a title that is not only spaces', async () => {
      const ctx = await instance();
      for (const extra of [
        { title: '   ' },
        { title: 'a\u0000b' },
        { body: 'a\u001bb' },
        { title: 5 },
      ]) {
        expect(
          (await failed(() => service().send(ctx.app.clientId, message(ctx.ada.id, extra))))?.code,
        ).toBe('invalid');
      }
      await service().send(ctx.app.clientId, message(ctx.ada.id, { title: '<b>Hi</b> & welcome' }));
      expect((await service().list(ctx.ada.id))[0]?.title).toBe('<b>Hi</b> & welcome');
    });

    it('lets a link go only to an https address on one of the app’s own, and nowhere else', async () => {
      const ctx = await instance();
      const ok = await service().send(
        ctx.app.clientId,
        message(ctx.ada.id, { url: 'https://reminders.example.test/tasks/3' }),
      );
      expect(ok.id).toBeTruthy();
      const redirectOrigin = new URL(REDIRECT).origin;
      await service().send(ctx.app.clientId, message(ctx.ada.id, { url: `${redirectOrigin}/x` }));
      for (const url of [
        'https://evil.example.test/',
        'https://user:pw@reminders.example.test/',
        'javascript:alert(1)',
        'not an address',
        'http://reminders.example.test/',
      ]) {
        const error = await failed(() =>
          service().send(ctx.app.clientId, message(ctx.ada.id, { url })),
        );
        expect(error?.problems[0]?.field, url).toBe('url');
      }
    });

    it('gives it a life of 30 days unless told, and at most 90', async () => {
      const ctx = await instance();
      const soon = new Date(clock + DAY).toISOString();
      await service().send(ctx.app.clientId, message(ctx.ada.id, { expiresAt: soon }));
      expect((await service().list(ctx.ada.id))[0]?.expiresAt).toBe(Date.parse(soon));
      for (const expiresAt of [
        new Date(clock - 1000).toISOString(),
        new Date(clock + 91 * DAY).toISOString(),
      ]) {
        expect(
          (await failed(() => service().send(ctx.app.clientId, message(ctx.ada.id, { expiresAt }))))
            ?.code,
        ).toBe('invalid');
      }
    });

    it('treats a repeated key within a day as the same send', async () => {
      const ctx = await instance();
      const first = await service().send(ctx.app.clientId, message(ctx.ada.id, { key: 'due-3' }));
      const again = await service().send(ctx.app.clientId, message(ctx.ada.id, { key: 'due-3' }));
      expect(again.id).toBe(first.id);
      expect(await count()).toBe(1);
      clock += DAY + 1000;
      const later = await service().send(ctx.app.clientId, message(ctx.ada.id, { key: 'due-3' }));
      expect(later.id).not.toBe(first.id);
      expect(await count()).toBe(2);
    });

    it('stops an app that sends one person too many in an hour, with a time to wait, and not another person', async () => {
      const ctx = await instance();
      for (let i = 0; i < PAIR_LIMIT.count; i += 1)
        await service().send(ctx.app.clientId, message(ctx.ada.id));
      const error = await failed(() => service().send(ctx.app.clientId, message(ctx.ada.id)));
      expect(error?.code).toBe('rate-limited');
      expect(error?.retryAfter).toBeGreaterThan(0);
      await service().send(ctx.app.clientId, message(ctx.bo.id));
    });

    it('has a limit for the whole app, too', () => {
      expect(APP_LIMIT.count).toBe(600);
    });

    it('keeps a person’s newest 200 from one app, and removes the oldest', async () => {
      const ctx = await instance();
      // Spread over hours so the per-person limit of an hour is not met; the cap is the thing under test.
      for (let i = 0; i < 205; i += 1) {
        clock += 90_000;
        await service().send(ctx.app.clientId, message(ctx.ada.id, { title: `n${i}` }));
      }
      expect(await count()).toBe(200);
      const titles = new Set(
        (await db.run('select title from notifications')).rows.map((row) => String(row.title)),
      );
      expect(titles.has('n0')).toBe(false);
      expect(titles.has('n204')).toBe(true);
    });

    it('does not show one that expired, and removes it with the next send', async () => {
      const ctx = await instance();
      await service().send(ctx.app.clientId, message(ctx.ada.id));
      clock += 31 * DAY;
      expect(await service().list(ctx.ada.id)).toEqual([]);
      expect(await service().unreadCount(ctx.ada.id)).toBe(0);
      expect(await count()).toBe(1);
      await service().send(ctx.app.clientId, message(ctx.ada.id, { title: 'New' }));
      expect(await count()).toBe(1);
    });
  });

  describe('reading and changing', () => {
    it('lists newest first, only the unread when asked, and no more than the limit', async () => {
      const ctx = await instance();
      for (const title of ['one', 'two', 'three']) {
        clock += 1000;
        await service().send(ctx.app.clientId, message(ctx.ada.id, { title }));
      }
      const all = await service().list(ctx.ada.id);
      expect(all.map((item) => item.title)).toEqual(['three', 'two', 'one']);
      await service().markRead(ctx.ada.id, all[0]?.id as string);
      expect(
        (await service().list(ctx.ada.id, { unreadOnly: true })).map((item) => item.title),
      ).toEqual(['two', 'one']);
      expect(await service().list(ctx.ada.id, { limit: 1 })).toHaveLength(1);
      expect(await service().unreadCount(ctx.ada.id)).toBe(2);
    });

    it('marks one read once, marks all read, dismisses one and all', async () => {
      const ctx = await instance();
      for (const title of ['a', 'b', 'c']) {
        clock += 1000;
        await service().send(ctx.app.clientId, message(ctx.ada.id, { title }));
      }
      const [first, second] = await service().list(ctx.ada.id);
      const read = await service().markRead(ctx.ada.id, first?.id as string);
      expect(read?.readAt).toBe(clock);
      clock += 5000;
      expect((await service().markRead(ctx.ada.id, first?.id as string))?.readAt).toBe(
        read?.readAt,
      );
      expect(await service().markAllRead(ctx.ada.id)).toBe(2);
      expect(await service().unreadCount(ctx.ada.id)).toBe(0);
      await service().dismiss(ctx.ada.id, second?.id as string);
      expect(await service().list(ctx.ada.id)).toHaveLength(2);
      expect(await service().dismissAll(ctx.ada.id)).toBe(2);
      expect(await service().list(ctx.ada.id)).toEqual([]);
    });

    it('lets a person change only their own, and an app only what it sent', async () => {
      const ctx = await instance();
      const other = await ctx.make('Other');
      await ctx.use(ctx.ada.jar, other);
      await service().send(ctx.app.clientId, message(ctx.ada.id, { title: 'from reminders' }));
      await service().send(other.clientId, message(ctx.ada.id, { title: 'from other' }));
      const [theirs] = (await service().list(ctx.ada.id)).filter(
        (item) => item.title === 'from reminders',
      );
      // Another person cannot touch it.
      expect(await service().markRead(ctx.bo.id, theirs?.id as string)).toBeUndefined();
      expect(await service().dismiss(ctx.bo.id, theirs?.id as string)).toBeUndefined();
      // Another app cannot either, and sees only its own.
      expect(
        await service().markRead(ctx.ada.id, theirs?.id as string, other.clientId),
      ).toBeUndefined();
      expect(
        (await service().list(ctx.ada.id, { clientId: other.clientId })).map((item) => item.title),
      ).toEqual(['from other']);
      expect(await service().markAllRead(ctx.ada.id, other.clientId)).toBe(1);
      expect(await service().unreadCount(ctx.ada.id)).toBe(1);
      expect(await service().dismissAll(ctx.ada.id, other.clientId)).toBe(1);
      expect((await service().list(ctx.ada.id)).map((item) => item.title)).toEqual([
        'from reminders',
      ]);
      expect(await service().list(ctx.bo.id)).toEqual([]);
    });
  });

  describe('what a person controls', () => {
    it('lists the apps that can write to them, with a switch, and not an app that cannot', async () => {
      const ctx = await instance();
      const quiet = await ctx.make('Quiet', { appScopes: [] });
      await ctx.use(ctx.ada.jar, quiet);
      expect(await service().apps(ctx.ada.id)).toEqual([
        { clientId: ctx.app.clientId, name: 'Reminders', enabled: true },
      ]);
      await service().setEnabled(ctx.ada.id, ctx.app.clientId, false);
      expect((await service().apps(ctx.ada.id))[0]?.enabled).toBe(false);
      // Someone who has used nothing sees nothing.
      expect(await service().apps(ctx.bo.id)).toEqual([]);
    });

    it('clears everything, from every app', async () => {
      const ctx = await instance();
      await service().send(ctx.app.clientId, message(ctx.ada.id));
      expect(await service().clearAll(ctx.ada.id)).toBe(1);
      expect(await service().list(ctx.ada.id)).toEqual([]);
    });
  });

  describe('what ends them', () => {
    it('is Remove access: what the app sent goes, the switch goes, and the app can write no more', async () => {
      const ctx = await instance();
      await service().setEnabled(ctx.ada.id, ctx.app.clientId, true);
      await service().send(ctx.app.clientId, message(ctx.ada.id));
      await removeAccess(db, ctx.ada.id, ctx.app.clientId);
      expect(await count()).toBe(0);
      expect(
        Number((await db.run('select count(*) as n from notification_settings')).rows[0]?.n),
      ).toBe(0);
      await service().send(ctx.app.clientId, message(ctx.ada.id));
      expect(await count()).toBe(0);
      expect(await service().apps(ctx.ada.id)).toEqual([]);
    });

    it('is deleting the app', async () => {
      const ctx = await instance();
      await service().send(ctx.app.clientId, message(ctx.ada.id));
      await ctx.registry.remove(ctx.asOwner, ctx.app.clientId);
      expect(await count()).toBe(0);
    });

    it('is deleting the account', async () => {
      const ctx = await instance();
      await service().send(ctx.app.clientId, message(ctx.ada.id));
      await service().setEnabled(ctx.ada.id, ctx.app.clientId, false);
      const manager = new AccountManager(db, new AccountStates(db, { log: () => undefined }), {
        log: () => undefined,
      });
      await manager.deleteSelf({ id: ctx.ada.id, role: 'platform:user' });
      expect(await count()).toBe(0);
      expect(
        Number((await db.run('select count(*) as n from notification_settings')).rows[0]?.n),
      ).toBe(0);
    });
  });
}
