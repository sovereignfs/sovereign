/**
 * The notices that tell apps an account was deleted (core-app §4.5), against a real database and the real provider: which apps get
 * one, that it is written by the deletion's own transaction and holds nothing of the person, and what removes it.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Database } from '@sovereignfs/database';
import type { TestDatabase } from '@sovereignfs/database/testing';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AccountManager, type Actor } from '../accounts/manage';
import { AccountStates } from '../accounts/states';
import {
  DONE_KEPT_FOR,
  planDeletionNotices,
  purgeDoneNotices,
  queueDeletionNotice,
} from '../accounts/deletion-notices';
import { ROLE_OWNER } from '../auth/roles';
import { ClientRegistryError } from '../clients/registry';
import { migrateCore } from '../db/migrate';
import { coreApiResource } from '../oauth/provider';
import { removeAccess } from '../oauth/revocation';
import { BASE_URL, makeAuthWithTasks, signUp } from './auth-harness';
import { REDIRECT, actorOf, personToken, registryFor, useDatabase } from './oauth-harness';

const MIGRATIONS = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../migrations');
const TABLES = [
  'account_deletion_notices',
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
const NOTICE = 'https://reminders.example.test/hooks/account-deleted';

export function deletionNoticesSuite(createDatabase: () => Promise<TestDatabase>): void {
  let target: TestDatabase;
  let db: Database;

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
    for (const table of TABLES) await db.run(`delete from ${table}`);
  });

  const manager = () =>
    new AccountManager(db, new AccountStates(db, { log: () => undefined }), {
      log: () => undefined,
    });

  /** An owner, an admin, a person, and three apps: one with an account-deleted address, one without, one the person never used. */
  async function instance() {
    const { auth } = makeAuthWithTasks(db);
    const owner = await signUp(auth, { name: 'Olive Owner' });
    const ada = await signUp(auth, { name: 'Ada Lovelace', email: 'ada@example.com' });
    const registry = registryFor(auth);
    const asOwner = await actorOf(auth, owner.jar);
    const idOf = async (email: string) =>
      String((await db.run('select id from users where email = ?', [email])).rows[0]?.id);
    const make = async (name: string, extra: Record<string, unknown> = {}) => {
      const { client, secret } = await registry.register(asOwner, {
        name,
        redirectUris: [REDIRECT],
        scopes: ['openid', 'profile', 'directory'],
        ...extra,
      });
      return { clientId: client.clientId, secret };
    };
    const use = (jar: typeof ada.jar, app: { clientId: string; secret: string | undefined }) =>
      personToken(auth, jar, app, { audience: AUDIENCE });
    const told = await make('Reminders', { accountDeletedUri: NOTICE });
    const silent = await make('Photos');
    const stranger = await make('Maps', { accountDeletedUri: 'https://maps.example.test/gone' });
    await use(ada.jar, told);
    await use(ada.jar, silent);
    const ownerId = await idOf(owner.email);
    return {
      auth,
      owner,
      registry,
      asOwner,
      told,
      silent,
      stranger,
      make,
      use,
      ada: { ...ada, id: await idOf(ada.email) },
      ownerId,
      asActor: { id: ownerId, role: ROLE_OWNER } satisfies Actor,
    };
  }

  const notices = async () =>
    (await db.run('select * from account_deletion_notices order by id')).rows;
  const count = async () => (await notices()).length;

  describe('which apps get one', () => {
    it('is each app the person used that has an account-deleted address, when they delete their own account', async () => {
      const ctx = await instance();
      await manager().deleteSelf({ id: ctx.ada.id, role: 'platform:user' });
      const [only, ...rest] = await notices();
      expect(rest).toEqual([]);
      expect(only).toMatchObject({
        client_id: ctx.told.clientId,
        sub: ctx.ada.id,
        state: 'pending',
        attempts: 0,
      });
      expect(Number(only?.deleted_at)).toBeGreaterThan(Date.now() - 60_000);
      expect(Number(only?.next_attempt_at)).toBe(Number(only?.deleted_at));
    });

    it('is the same when an operator deletes the account', async () => {
      const ctx = await instance();
      await manager().delete(ctx.asActor, ctx.ada.id);
      expect(await count()).toBe(1);
      expect((await notices())[0]?.client_id).toBe(ctx.told.clientId);
    });

    it('counts an app whose access the person had already removed, since it still holds what it held', async () => {
      const ctx = await instance();
      await removeAccess(db, ctx.ada.id, ctx.told.clientId);
      await manager().deleteSelf({ id: ctx.ada.id, role: 'platform:user' });
      expect((await notices()).map((row) => row.client_id)).toEqual([ctx.told.clientId]);
    });

    it('is no app the person never used, and none when there is no app with an address', async () => {
      const ctx = await instance();
      await ctx.registry.update(ctx.asOwner, ctx.told.clientId, { accountDeletedUri: '' });
      await manager().deleteSelf({ id: ctx.ada.id, role: 'platform:user' });
      expect(await count()).toBe(0);
    });

    it('is not made twice for an app that already has one pending for the same person', async () => {
      const ctx = await instance();
      expect(
        await db.transaction((tx) => queueDeletionNotice(tx, ctx.told.clientId, 'someone')),
      ).toBe(true);
      expect(
        await db.transaction((tx) => queueDeletionNotice(tx, ctx.told.clientId, 'someone')),
      ).toBe(false);
      await db.run("update account_deletion_notices set state = 'delivered'");
      expect(
        await db.transaction((tx) => queueDeletionNotice(tx, ctx.told.clientId, 'someone')),
      ).toBe(true);
      expect(await count()).toBe(2);
    });

    it('is none for an app that is gone', async () => {
      const ctx = await instance();
      expect(await db.transaction((tx) => queueDeletionNotice(tx, 'no-such-app', 'someone'))).toBe(
        false,
      );
      expect(ctx).toBeDefined();
    });
  });

  describe('written with the deletion', () => {
    it('is left out when the deletion does not happen: the owner cannot be deleted', async () => {
      const ctx = await instance();
      await ctx.use(ctx.owner.jar, ctx.told);
      await expect(manager().deleteSelf(ctx.asActor)).rejects.toMatchObject({ code: 'owner' });
      expect(await count()).toBe(0);
    });

    it('is rolled back with the deletion when a later step fails', async () => {
      const ctx = await instance();
      await expect(
        db.transaction(async (tx) => {
          await planDeletionNotices(tx, ctx.ada.id);
          throw new Error('the deletion failed');
        }),
      ).rejects.toThrow('the deletion failed');
      expect(await count()).toBe(0);
    });

    it('holds nothing of the person but the sub', async () => {
      const ctx = await instance();
      await manager().deleteSelf({ id: ctx.ada.id, role: 'platform:user' });
      const text = JSON.stringify(await notices());
      expect(text).not.toContain('ada@example.com');
      expect(text).not.toContain('Ada');
      expect(Object.keys((await notices())[0] ?? {}).sort()).toEqual(
        [
          'attempts',
          'client_id',
          'deleted_at',
          'done_at',
          'id',
          'last_failure',
          'lease_until',
          'next_attempt_at',
          'state',
          'sub',
        ].sort(),
      );
    });
  });

  describe('what removes one', () => {
    it('is deleting the app', async () => {
      const ctx = await instance();
      await manager().deleteSelf({ id: ctx.ada.id, role: 'platform:user' });
      await ctx.registry.remove(ctx.asOwner, ctx.told.clientId);
      expect(await count()).toBe(0);
    });

    it('is time: a notice done 90 days ago goes with the next deletion, and one still pending never does', async () => {
      const ctx = await instance();
      const now = Date.now();
      await db.transaction(async (tx) => {
        await queueDeletionNotice(tx, ctx.told.clientId, 'old-done', now - 200 * DAY);
        await queueDeletionNotice(tx, ctx.told.clientId, 'old-pending', now - 200 * DAY);
        await queueDeletionNotice(tx, ctx.told.clientId, 'recent-done', now - 10 * DAY);
      });
      await db.run(
        "update account_deletion_notices set state = 'delivered', done_at = ? where sub = 'old-done'",
        [now - DONE_KEPT_FOR - 1000],
      );
      await db.run(
        "update account_deletion_notices set state = 'delivered', done_at = ? where sub = 'recent-done'",
        [now - 10 * DAY],
      );
      await manager().deleteSelf({ id: ctx.ada.id, role: 'platform:user' });
      expect((await notices()).map((row) => row.sub).sort()).toEqual(
        ['old-pending', 'recent-done', ctx.ada.id].sort(),
      );
      await purgeDoneNotices(db, now + 400 * DAY);
      expect((await notices()).map((row) => row.sub).sort()).toEqual(
        ['old-pending', ctx.ada.id].sort(),
      );
    });
  });

  describe('the address on an app', () => {
    it('is kept, shown, changed and cleared like the app’s other addresses', async () => {
      const ctx = await instance();
      const read = async () =>
        (await ctx.registry.list(ctx.asOwner)).find((app) => app.clientId === ctx.told.clientId);
      expect((await read())?.accountDeletedUri).toBe(NOTICE);
      await ctx.registry.update(ctx.asOwner, ctx.told.clientId, {
        accountDeletedUri: 'https://reminders.example.test/other',
      });
      expect((await read())?.accountDeletedUri).toBe('https://reminders.example.test/other');
      await ctx.registry.update(ctx.asOwner, ctx.told.clientId, { name: 'Renamed' });
      expect((await read())?.accountDeletedUri).toBe('https://reminders.example.test/other');
      await ctx.registry.update(ctx.asOwner, ctx.told.clientId, { accountDeletedUri: '' });
      expect((await read())?.accountDeletedUri).toBeUndefined();
    });

    it('must be https, like a redirect address', async () => {
      const ctx = await instance();
      const error = await ctx.registry
        .update(ctx.asOwner, ctx.told.clientId, {
          accountDeletedUri: 'http://reminders.example.test/x',
        })
        .catch((e: unknown) => e);
      expect(error).toBeInstanceOf(ClientRegistryError);
      expect((error as ClientRegistryError).problems.map((problem) => problem.field)).toEqual([
        'accountDeletedUri',
      ]);
    });
  });
}
