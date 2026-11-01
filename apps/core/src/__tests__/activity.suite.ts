/**
 * Activity (core-app §4.3) against a real database: who may be recorded about, what an entry may say, how many are kept, what the
 * person can do with their record, and what ends it. One suite, run by `activity.test.ts` on a SQLite file and by
 * `activity.db.test.ts` on whichever dialect the CI leg started.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Database } from '@sovereignfs/database';
import type { TestDatabase } from '@sovereignfs/database/testing';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AccountManager } from '../accounts/manage';
import { AccountStates } from '../accounts/states';
import { ActivityError, ActivityService, APP_LIMIT, PAIR_LIMIT } from '../activity/service';
import { migrateCore } from '../db/migrate';
import { coreApiResource } from '../oauth/provider';
import { removeAccess } from '../oauth/revocation';
import { BASE_URL, makeAuthWithTasks, signUp } from './auth-harness';
import { REDIRECT, actorOf, personToken, registryFor, useDatabase } from './oauth-harness';

const MIGRATIONS = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../migrations');
const TABLES = [
  'activity',
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

export function activitySuite(createDatabase: () => Promise<TestDatabase>): void {
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

  const service = () => new ActivityService(db, { now: () => clock, development: true });

  /** An owner, an app that may record, and a person who has used it (and agreed to it). */
  async function instance() {
    const { auth } = makeAuthWithTasks(db);
    const owner = await signUp(auth, { name: 'Olive Owner' });
    const ada = await signUp(auth, { name: 'Ada Lovelace', email: 'ada@sovereign.local' });
    const bo = await signUp(auth, { name: 'Bo Barnes', email: 'bo@sovereign.local' });
    const registry = registryFor(auth);
    const asOwner = await actorOf(auth, owner.jar);
    const idOf = async (email: string) =>
      String((await db.run('select id from users where email = ?', [email])).rows[0]?.id);
    const make = async (name: string, extra: Record<string, unknown> = {}) => {
      const { client, secret } = await registry.register(asOwner, {
        name,
        redirectUris: [REDIRECT],
        scopes: ['openid', 'profile', 'directory'],
        appScopes: ['activity:write'],
        launcher: { launchUrl: 'https://reminders.sovereign.local/' },
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
    };
  }

  const count = async (where = '1 = 1') =>
    Number((await db.run(`select count(*) as n from activity where ${where}`)).rows[0]?.n);
  const entry = (to: string, extra: Record<string, unknown> = {}) => ({
    to,
    summary: 'You completed Water the plants',
    ...extra,
  });
  const failed = async (run: () => Promise<unknown>) => {
    try {
      await run();
    } catch (error) {
      if (error instanceof ActivityError) return error;
      throw error;
    }
    return undefined;
  };

  describe('recording', () => {
    it('keeps an entry for a person who has used the app, from the app and no one else', async () => {
      const ctx = await instance();
      const recorded = await service().record(ctx.app.clientId, entry(ctx.ada.id));
      const [item] = await service().list(ctx.ada.id);
      expect(item).toMatchObject({
        id: recorded.id,
        clientId: ctx.app.clientId,
        appName: 'Reminders',
        summary: 'You completed Water the plants',
        link: null,
        at: clock,
      });
    });

    it('answers a record about someone who may not have it exactly as a kept one, and keeps nothing', async () => {
      const ctx = await instance();
      const kept = await service().record(ctx.app.clientId, entry(ctx.ada.id));
      const never = await service().record(ctx.app.clientId, entry(ctx.bo.id)); // never used the app
      const nobody = await service().record(ctx.app.clientId, entry('no-such-account'));
      expect(Object.keys(never)).toEqual(Object.keys(kept));
      expect(Object.keys(nobody)).toEqual(Object.keys(kept));
      expect(await count()).toBe(1);
      await new AccountStates(db, { log: () => undefined }).deactivate(ctx.ada.id);
      await service().record(ctx.app.clientId, entry(ctx.ada.id));
      expect(await count()).toBe(1);
    });

    it('has no switch for the person: what an app did is recorded, and the person deletes what they do not want', async () => {
      const ctx = await instance();
      await service().record(ctx.app.clientId, entry(ctx.ada.id));
      expect(await service().deleteAll(ctx.ada.id)).toBe(1);
      await service().record(ctx.app.clientId, entry(ctx.ada.id));
      expect(await count()).toBe(1);
    });

    it('refuses what cannot be used, saying every thing wrong, before it counts or keeps anything', async () => {
      const ctx = await instance();
      const error = await failed(() =>
        service().record(ctx.app.clientId, {
          to: '',
          summary: 'x'.repeat(201),
          link: 'http://reminders.sovereign.local/',
          at: 'yesterday',
          key: 'k'.repeat(101),
        }),
      );
      expect(error?.code).toBe('invalid');
      expect(error?.problems.map((problem) => problem.field).sort()).toEqual(
        ['at', 'key', 'link', 'summary', 'to'].sort(),
      );
      expect(await count()).toBe(0);
      const counted = await db.run(
        "select count(*) as n from rate_limits where key like 'activity-%'",
      );
      expect(Number(counted.rows[0]?.n)).toBe(0);
    });

    it('takes one line of text, not markup or control characters, and a summary that is not only spaces', async () => {
      const ctx = await instance();
      for (const extra of [
        { summary: '   ' },
        { summary: 'two\nlines' },
        { summary: 'a\u0000b' },
        { summary: 5 },
      ]) {
        expect(
          (await failed(() => service().record(ctx.app.clientId, entry(ctx.ada.id, extra))))?.code,
        ).toBe('invalid');
      }
      await service().record(
        ctx.app.clientId,
        entry(ctx.ada.id, { summary: '<b>Hi</b> & welcome' }),
      );
      expect((await service().list(ctx.ada.id))[0]?.summary).toBe('<b>Hi</b> & welcome');
    });

    it('lets a link go only to an https address on one of the app’s own, and nowhere else', async () => {
      const ctx = await instance();
      await service().record(
        ctx.app.clientId,
        entry(ctx.ada.id, { link: 'https://reminders.sovereign.local/tasks/3' }),
      );
      expect((await service().list(ctx.ada.id))[0]?.link).toBe(
        'https://reminders.sovereign.local/tasks/3',
      );
      for (const link of [
        'https://evil.sovereign.local/',
        'https://user:pw@reminders.sovereign.local/',
        'javascript:alert(1)',
        'not an address',
        'http://reminders.sovereign.local/',
      ]) {
        const error = await failed(() =>
          service().record(ctx.app.clientId, entry(ctx.ada.id, { link })),
        );
        expect(error?.problems[0]?.field, link).toBe('link');
      }
    });

    it('takes the time it happened, within the last day and not ahead, and records now when not given', async () => {
      const ctx = await instance();
      const earlier = new Date(clock - 3 * 60 * 60 * 1000).toISOString();
      await service().record(ctx.app.clientId, entry(ctx.ada.id, { at: earlier }));
      expect((await service().list(ctx.ada.id))[0]?.at).toBe(Date.parse(earlier));
      for (const at of [
        new Date(clock - 2 * DAY).toISOString(),
        new Date(clock + 5 * 60_000).toISOString(),
      ]) {
        expect(
          (await failed(() => service().record(ctx.app.clientId, entry(ctx.ada.id, { at }))))?.code,
        ).toBe('invalid');
      }
    });

    it('treats a repeated key within a day as the same record', async () => {
      const ctx = await instance();
      const first = await service().record(ctx.app.clientId, entry(ctx.ada.id, { key: 'done-3' }));
      const again = await service().record(ctx.app.clientId, entry(ctx.ada.id, { key: 'done-3' }));
      expect(again.id).toBe(first.id);
      expect(await count()).toBe(1);
      clock += DAY + 1000;
      const later = await service().record(ctx.app.clientId, entry(ctx.ada.id, { key: 'done-3' }));
      expect(later.id).not.toBe(first.id);
      expect(await count()).toBe(2);
    });

    it('stops an app that records about one person too often, with a time to wait, and not another person', async () => {
      const ctx = await instance();
      await ctx.use(ctx.bo.jar, ctx.app);
      for (let i = 0; i < PAIR_LIMIT.count; i += 1)
        await service().record(ctx.app.clientId, entry(ctx.ada.id, { summary: `n${i}` }));
      const error = await failed(() => service().record(ctx.app.clientId, entry(ctx.ada.id)));
      expect(error?.code).toBe('rate-limited');
      expect(error?.retryAfter).toBeGreaterThan(0);
      await service().record(ctx.app.clientId, entry(ctx.bo.id));
    });

    it('has a limit for the whole app, too', () => {
      expect(APP_LIMIT.count).toBe(600);
      expect(PAIR_LIMIT.count).toBe(120);
    });

    it('keeps a person’s newest 500 in all, and removes the oldest', async () => {
      const ctx = await instance();
      const other = await ctx.make('Other');
      await ctx.use(ctx.ada.jar, other);
      // Spread over hours so the per-person limit of an hour is not met; the cap is the thing under test.
      for (let i = 0; i < 252; i += 1) {
        clock += 60_000;
        await service().record(ctx.app.clientId, entry(ctx.ada.id, { summary: `a${i}` }));
        await service().record(other.clientId, entry(ctx.ada.id, { summary: `b${i}` }));
      }
      expect(await count()).toBe(500);
      const summaries = new Set(
        (await db.run('select summary from activity')).rows.map((row) => String(row.summary)),
      );
      expect(summaries.has('a0')).toBe(false);
      expect(summaries.has('b251')).toBe(true);
    }, 180_000);

    it('does not show what happened more than 90 days ago, and removes it with the next record', async () => {
      const ctx = await instance();
      await service().record(ctx.app.clientId, entry(ctx.ada.id));
      clock += 91 * DAY;
      expect(await service().list(ctx.ada.id)).toEqual([]);
      expect(await service().apps(ctx.ada.id)).toEqual([]);
      expect(await count()).toBe(1);
      await service().record(ctx.app.clientId, entry(ctx.ada.id, { summary: 'New' }));
      expect(await count()).toBe(1);
    });
  });

  describe('the person’s own record', () => {
    it('lists newest first by when it happened, and one app’s on its own', async () => {
      const ctx = await instance();
      const other = await ctx.make('Other');
      await ctx.use(ctx.ada.jar, other);
      const hour = 60 * 60 * 1000;
      await service().record(
        ctx.app.clientId,
        entry(ctx.ada.id, { summary: 'one', at: new Date(clock - 3 * hour).toISOString() }),
      );
      await service().record(
        other.clientId,
        entry(ctx.ada.id, { summary: 'two', at: new Date(clock - hour).toISOString() }),
      );
      await service().record(
        ctx.app.clientId,
        entry(ctx.ada.id, { summary: 'three', at: new Date(clock - 2 * hour).toISOString() }),
      );
      expect((await service().list(ctx.ada.id)).map((item) => item.summary)).toEqual([
        'two',
        'three',
        'one',
      ]);
      expect(
        (await service().list(ctx.ada.id, { clientId: ctx.app.clientId })).map(
          (item) => item.summary,
        ),
      ).toEqual(['three', 'one']);
      expect(await service().apps(ctx.ada.id)).toEqual([
        { clientId: other.clientId, name: 'Other', count: 1 },
        { clientId: ctx.app.clientId, name: 'Reminders', count: 2 },
      ]);
    });

    it('is the person’s alone: another person sees none of it and can delete none of it', async () => {
      const ctx = await instance();
      const recorded = await service().record(ctx.app.clientId, entry(ctx.ada.id));
      expect(await service().list(ctx.bo.id)).toEqual([]);
      expect(await service().apps(ctx.bo.id)).toEqual([]);
      expect(await service().delete(ctx.bo.id, recorded.id)).toBe(false);
      expect(await service().deleteApp(ctx.bo.id, ctx.app.clientId)).toBe(0);
      expect(await service().deleteAll(ctx.bo.id)).toBe(0);
      expect(await count()).toBe(1);
    });

    it('deletes one entry, one app’s, or all', async () => {
      const ctx = await instance();
      const other = await ctx.make('Other');
      await ctx.use(ctx.ada.jar, other);
      const first = await service().record(ctx.app.clientId, entry(ctx.ada.id, { summary: 'a' }));
      await service().record(ctx.app.clientId, entry(ctx.ada.id, { summary: 'b' }));
      await service().record(other.clientId, entry(ctx.ada.id, { summary: 'c' }));
      expect(await service().delete(ctx.ada.id, first.id)).toBe(true);
      expect(await service().delete(ctx.ada.id, first.id)).toBe(false);
      expect(await service().deleteApp(ctx.ada.id, ctx.app.clientId)).toBe(1);
      expect((await service().list(ctx.ada.id)).map((item) => item.summary)).toEqual(['c']);
      expect(await service().deleteAll(ctx.ada.id)).toBe(1);
      expect(await count()).toBe(0);
    });
  });

  describe('what ends it', () => {
    it('is Remove access: what the app recorded goes, and it can record no more', async () => {
      const ctx = await instance();
      await service().record(ctx.app.clientId, entry(ctx.ada.id));
      await removeAccess(db, ctx.ada.id, ctx.app.clientId);
      expect(await count()).toBe(0);
      await service().record(ctx.app.clientId, entry(ctx.ada.id));
      expect(await count()).toBe(0);
    });

    it('is deleting the app', async () => {
      const ctx = await instance();
      await service().record(ctx.app.clientId, entry(ctx.ada.id));
      await ctx.registry.remove(ctx.asOwner, ctx.app.clientId);
      expect(await count()).toBe(0);
    });

    it('is deleting the account', async () => {
      const ctx = await instance();
      await service().record(ctx.app.clientId, entry(ctx.ada.id));
      const manager = new AccountManager(db, new AccountStates(db, { log: () => undefined }), {
        log: () => undefined,
      });
      await manager.deleteSelf({ id: ctx.ada.id, role: 'platform:user' });
      expect(await count()).toBe(0);
    });
  });
}
