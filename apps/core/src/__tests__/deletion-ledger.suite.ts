/**
 * Carrying deletions across a restore (core-app §4.5, "After a restore") against a real database: that every deletion is remembered, what
 * is exported, and that applying it to a database that brought the accounts back deletes them again, tells their apps, and happens once.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Database } from '@sovereignfs/database';
import type { TestDatabase } from '@sovereignfs/database/testing';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AccountManager } from '../accounts/manage';
import { AccountStates } from '../accounts/states';
import {
  APPLIED_KEY,
  LedgerError,
  applyDeletions,
  exportDeletions,
  parseDeletions,
  type DeletionsFile,
} from '../accounts/deletion-ledger';
import { DONE_KEPT_FOR } from '../accounts/deletion-notices';
import { ROLE_OWNER } from '../auth/roles';
import { migrateCore } from '../db/migrate';
import { coreApiResource } from '../oauth/provider';
import { BASE_URL, makeAuthWithTasks, signUp } from './auth-harness';
import { REDIRECT, actorOf, personToken, registryFor, useDatabase } from './oauth-harness';

const MIGRATIONS = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../migrations');
const TABLES = [
  'deleted_accounts',
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
  'instance_settings',
  'users',
];
const AUDIENCE = coreApiResource(new URL(BASE_URL).origin);
const DAY = 24 * 60 * 60 * 1000;

export function deletionLedgerSuite(createDatabase: () => Promise<TestDatabase>): void {
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

  /** An owner, two people who used an app that wants to be told, and that app. */
  async function instance() {
    const { auth } = makeAuthWithTasks(db);
    const owner = await signUp(auth, { name: 'Olive Owner' });
    const ada = await signUp(auth, { name: 'Ada Lovelace', email: 'ada@sovereign.local' });
    const bo = await signUp(auth, { name: 'Bo Barnes', email: 'bo@sovereign.local' });
    const registry = registryFor(auth);
    const asOwner = await actorOf(auth, owner.jar);
    const idOf = async (email: string) =>
      String((await db.run('select id from users where email = ?', [email])).rows[0]?.id);
    const { client, secret } = await registry.register(asOwner, {
      name: 'Reminders',
      redirectUris: [REDIRECT],
      scopes: ['openid', 'profile', 'directory'],
      accountDeletedUri: 'https://reminders.sovereign.local/gone',
    });
    const app = { clientId: client.clientId, secret };
    await personToken(auth, ada.jar, app, { audience: AUDIENCE });
    await personToken(auth, bo.jar, app, { audience: AUDIENCE });
    return {
      app,
      ownerId: await idOf(owner.email),
      ada: await idOf(ada.email),
      bo: await idOf(bo.email),
    };
  }
  const exists = async (id: string) =>
    (await db.run('select 1 from users where id = ?', [id])).rows.length > 0;
  const notices = async () =>
    (await db.run('select * from account_deletion_notices order by sub')).rows;
  const fileOf = (
    deletions: DeletionsFile['deletions'],
    exportedAt = new Date().toISOString(),
  ): DeletionsFile => ({ version: 1, exportedAt, deletions });

  describe('remembering', () => {
    it('writes every deletion down, including one that had no app to tell', async () => {
      const ctx = await instance();
      await db.run('delete from oauth_consents');
      await db.run('delete from oauth_access_tokens');
      await db.run('delete from oauth_refresh_tokens');
      await db.run('delete from token_revocations');
      await manager().deleteSelf({ id: ctx.ada, role: 'platform:user' });
      expect(await notices()).toEqual([]);
      const { rows } = await db.run('select sub, deleted_at from deleted_accounts');
      expect(rows.map((row) => row.sub)).toEqual([ctx.ada]);
      expect(Number(rows[0]?.deleted_at)).toBeGreaterThan(Date.now() - 60_000);
    });

    it('forgets it after 90 days, with the notices', async () => {
      const ctx = await instance();
      await manager().deleteSelf({ id: ctx.ada, role: 'platform:user' });
      await db.run('update deleted_accounts set deleted_at = ?', [
        Date.now() - DONE_KEPT_FOR - 1000,
      ]);
      await manager().deleteSelf({ id: ctx.bo, role: 'platform:user' });
      expect((await db.run('select sub from deleted_accounts')).rows.map((r) => r.sub)).toEqual([
        ctx.bo,
      ]);
    });
  });

  describe('exporting', () => {
    it('lists each deleted account with when and the apps that were to be told, and nothing else of a person', async () => {
      const ctx = await instance();
      await manager().deleteSelf({ id: ctx.ada, role: 'platform:user' });
      const file = await exportDeletions(db);
      expect(file.version).toBe(1);
      expect(file.deletions).toEqual([
        { sub: ctx.ada, deletedAt: expect.any(String), apps: [ctx.app.clientId] },
      ]);
      expect(JSON.stringify(file)).not.toContain('ada@sovereign.local');
      expect(JSON.stringify(file)).not.toContain('Ada');
      expect(parseDeletions(JSON.stringify(file))).toEqual(file);
    });

    it('is empty on an instance where nobody left', async () => {
      await instance();
      expect((await exportDeletions(db)).deletions).toEqual([]);
    });
  });

  describe('reading it', () => {
    it.each([
      ['not json', 'nope'],
      [
        'another version',
        JSON.stringify({ version: 2, exportedAt: new Date().toISOString(), deletions: [] }),
      ],
      ['no export time', JSON.stringify({ version: 1, deletions: [] })],
      ['no list', JSON.stringify({ version: 1, exportedAt: new Date().toISOString() })],
      [
        'a deletion with no sub',
        JSON.stringify(fileOf([{ sub: '', deletedAt: new Date().toISOString(), apps: [] }])),
      ],
      [
        'a deletion with no date',
        JSON.stringify({ ...fileOf([]), deletions: [{ sub: 'a', deletedAt: 'x', apps: [] }] }),
      ],
      [
        'apps that are not names',
        JSON.stringify({
          ...fileOf([]),
          deletions: [{ sub: 'a', deletedAt: new Date().toISOString(), apps: [1] }],
        }),
      ],
    ])('refuses %s', (_name, text) => {
      expect(() => parseDeletions(text)).toThrow(LedgerError);
    });
  });

  describe('applying it to a database that brought the accounts back', () => {
    it('deletes the accounts again, tells their apps, keeps the date of the deletion, and leaves everyone else', async () => {
      const ctx = await instance();
      const deletedAt = new Date(Date.now() - 3 * DAY).toISOString();
      const file = fileOf([{ sub: ctx.ada, deletedAt, apps: [ctx.app.clientId] }]);
      const applyAt = Date.now() + 1000;
      const done = await applyDeletions(db, manager(), file, applyAt);
      expect(done).toEqual({
        skipped: false,
        deletedAgain: 1,
        alreadyGone: 0,
        kept: 0,
        notices: 0,
      });
      expect(await exists(ctx.ada)).toBe(false);
      expect(await exists(ctx.bo)).toBe(true);
      // The deletion made its own notice for the app Ada used; the file's was the same app, so there is one.
      expect((await notices()).map((row) => [row.sub, row.client_id, row.state])).toEqual([
        [ctx.ada, ctx.app.clientId, 'pending'],
      ]);
      expect(
        Number(
          (await db.run('select deleted_at from deleted_accounts where sub = ?', [ctx.ada])).rows[0]
            ?.deleted_at,
        ),
      ).toBe(Date.parse(deletedAt));
    });

    it('tells the apps of an account the restored database does not have, from the start of the 30 days', async () => {
      const ctx = await instance();
      const applyAt = Date.now() + 5000;
      const file = fileOf([
        {
          sub: 'gone-before-the-backup',
          deletedAt: new Date(Date.now() - 40 * DAY).toISOString(),
          apps: [ctx.app.clientId, 'an-app-made-later'],
        },
      ]);
      const done = await applyDeletions(db, manager(), file, applyAt);
      expect(done).toMatchObject({ deletedAgain: 0, alreadyGone: 1, notices: 1 });
      const [notice] = await notices();
      expect(notice).toMatchObject({
        sub: 'gone-before-the-backup',
        client_id: ctx.app.clientId,
        state: 'pending',
      });
      expect(Number(notice?.deleted_at)).toBe(applyAt);
      expect((await db.run('select sub from deleted_accounts')).rows.map((r) => r.sub)).toEqual([
        'gone-before-the-backup',
      ]);
    });

    it('never deletes the owner', async () => {
      const ctx = await instance();
      const file = fileOf([{ sub: ctx.ownerId, deletedAt: new Date().toISOString(), apps: [] }]);
      const done = await applyDeletions(db, manager(), file);
      expect(done).toMatchObject({ kept: 1, deletedAgain: 0 });
      expect(await exists(ctx.ownerId)).toBe(true);
      expect(
        (await db.run('select role from users where id = ?', [ctx.ownerId])).rows[0]?.role,
      ).toBe(ROLE_OWNER);
    });

    it('is done once: the same file, or an older one, changes nothing, and a newer one is applied', async () => {
      const ctx = await instance();
      const first = fileOf(
        [{ sub: ctx.ada, deletedAt: new Date().toISOString(), apps: [ctx.app.clientId] }],
        new Date(Date.now() + 10_000).toISOString(),
      );
      expect((await applyDeletions(db, manager(), first)).skipped).toBe(false);
      await db.run('delete from account_deletion_notices');
      expect(await applyDeletions(db, manager(), first)).toMatchObject({
        skipped: true,
        notices: 0,
      });
      const older = { ...first, exportedAt: new Date(Date.now() - DAY).toISOString() };
      expect((await applyDeletions(db, manager(), older)).skipped).toBe(true);
      expect(await notices()).toEqual([]);
      const newer = fileOf(
        [{ sub: ctx.bo, deletedAt: new Date().toISOString(), apps: [] }],
        new Date(Date.now() + 60_000).toISOString(),
      );
      expect(await applyDeletions(db, manager(), newer)).toMatchObject({
        skipped: false,
        deletedAgain: 1,
      });
      expect(await exists(ctx.bo)).toBe(false);
      expect(
        Number(
          (await db.run('select value from instance_settings where key = ?', [APPLIED_KEY])).rows[0]
            ?.value,
        ),
      ).toBe(Date.parse(newer.exportedAt));
    });

    it('holds nothing of the person but the sub, and carries on to the next restore', async () => {
      const ctx = await instance();
      await applyDeletions(
        db,
        manager(),
        fileOf([{ sub: ctx.ada, deletedAt: new Date().toISOString(), apps: [ctx.app.clientId] }]),
      );
      const again = await exportDeletions(db);
      expect(again.deletions.map((entry) => entry.sub)).toEqual([ctx.ada]);
      expect(again.deletions[0]?.apps).toEqual([ctx.app.clientId]);
    });
  });
}
