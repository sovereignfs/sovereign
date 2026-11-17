/**
 * Core's key vault (core-app §5.3, §5.4) against a real database: what it keeps for an account, that it is set up once, that a
 * session's secret is given only to a live session of its own, and that everything goes with the account.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Database } from '@sovereignfs/database';
import type { TestDatabase } from '@sovereignfs/database/testing';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AccountManager } from '../accounts/manage';
import { AccountStates } from '../accounts/states';
import { migrateCore } from '../db/migrate';
import { ensureInstanceId } from '../instance/instance-id';
import { KeyVault, VaultError } from '../keys/vault';
import { makeAuth, PASSWORD, signUp } from './auth-harness';

const MIGRATIONS = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../migrations');
const B64 = (byte: number) => Buffer.alloc(32, byte).toString('base64url');
const wrap = (tag: string) => JSON.stringify({ suite: 1, nonce: tag, ciphertext: tag });
const ACCOUNT = {
  suite: 1,
  unlockSalt: B64(1),
  signingPublic: B64(2),
  signingPrivate: wrap('signing'),
};
const SIGNATURE = 'A'.repeat(86);

export function keyVaultSuite(createDatabase: () => Promise<TestDatabase>): void {
  let target: TestDatabase;
  let db: Database;

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
      'key_session_secrets',
      'key_apps',
      'key_wraps',
      'key_accounts',
      'sessions',
      'accounts',
      'verifications',
      'rate_limits',
      'users',
    ]) {
      await db.run(`delete from ${table}`);
    }
    await db.run("delete from instance_settings where key = 'instance_id'");
  });

  /** A person, with their id and the id of the session they signed up with. */
  async function person() {
    const { email } = await signUp(makeAuth(db), { password: PASSWORD });
    const user = (await db.run('select id from users where email = ?', [email])).rows[0];
    const session = (await db.run('select id from sessions where user_id = ?', [user?.id])).rows[0];
    return { id: String(user?.id), sessionId: String(session?.id) };
  }

  describe('an account', () => {
    it('is nothing until it is set up, then its keys and ways in, and the kit not yet confirmed', async () => {
      const vault = new KeyVault(db);
      const { id } = await person();
      expect(await vault.read(id)).toEqual({ waysIn: [] });
      await vault.setUp(id, ACCOUNT, [{ way: 'password', id: 'p1', record: wrap('pw') }]);
      expect(await vault.read(id)).toEqual({
        account: { ...ACCOUNT, kitConfirmed: false },
        waysIn: [{ way: 'password', id: 'p1', record: wrap('pw') }],
      });
    });

    it('is set up once', async () => {
      const vault = new KeyVault(db);
      const { id } = await person();
      await vault.setUp(id, ACCOUNT, [{ way: 'password', id: 'p1', record: wrap('pw') }]);
      await expect(
        vault.setUp(id, ACCOUNT, [{ way: 'password', id: 'p2', record: wrap('pw2') }]),
      ).rejects.toMatchObject({ code: 'exists' });
      expect((await vault.read(id)).waysIn).toHaveLength(1);
    });

    it.each([
      ['no way in', ACCOUNT, []],
      ['only a kit', ACCOUNT, [{ way: 'kit', id: '', record: wrap('kit') }]],
      [
        'another suite',
        { ...ACCOUNT, suite: 2 },
        [{ way: 'password', id: 'p', record: wrap('p') }],
      ],
      [
        'a salt that is not 32 bytes',
        { ...ACCOUNT, unlockSalt: 'short' },
        [{ way: 'password', id: 'p', record: wrap('p') }],
      ],
      ['a record that is not JSON', ACCOUNT, [{ way: 'password', id: 'p', record: 'not json' }]],
      ['a way core does not keep', ACCOUNT, [{ way: 'magic', id: 'p', record: wrap('p') }]],
      ['a passkey with no PRF input', ACCOUNT, [{ way: 'passkey', id: 'cred', record: wrap('k') }]],
    ] as const)('is refused with %s, keeping nothing', async (_, account, waysIn) => {
      const vault = new KeyVault(db);
      const { id } = await person();
      await expect(vault.setUp(id, account as never, waysIn as never)).rejects.toBeInstanceOf(
        VaultError,
      );
      expect(await vault.read(id)).toEqual({ waysIn: [] });
    });
  });

  describe('its ways in', () => {
    it('are added beside each other, replaced by their own id, and removed one at a time', async () => {
      const vault = new KeyVault(db);
      const { id } = await person();
      await vault.setUp(id, ACCOUNT, [{ way: 'password', id: 'old', record: wrap('old') }]);
      await vault.putWayIn(id, { way: 'password', id: 'new', record: wrap('new') });
      await vault.putWayIn(id, {
        way: 'passkey',
        id: 'cred',
        record: wrap('pk'),
        prfInput: B64(9),
      });
      await vault.putWayIn(id, {
        way: 'passkey',
        id: 'cred',
        record: wrap('pk2'),
        prfInput: B64(8),
      });
      expect((await vault.read(id)).waysIn.map((w) => `${w.way}:${w.id}`).sort()).toEqual([
        'passkey:cred',
        'password:new',
        'password:old',
      ]);
      expect((await vault.read(id)).waysIn.find((w) => w.way === 'passkey')).toMatchObject({
        record: wrap('pk2'),
        prfInput: B64(8),
      });
      expect(await vault.removeWayIn(id, 'password', 'old')).toBe(true);
      expect(await vault.removeWayIn(id, 'password', 'old')).toBe(false);
    });

    it('need an account that is set up', async () => {
      const vault = new KeyVault(db);
      const { id } = await person();
      await expect(
        vault.putWayIn(id, { way: 'password', id: 'p', record: wrap('p') }),
      ).rejects.toMatchObject({ code: 'not-set-up' });
    });

    it('are the account’s own: another account reads none of them', async () => {
      const vault = new KeyVault(db);
      const ada = await person();
      const grace = await person();
      await vault.setUp(ada.id, ACCOUNT, [{ way: 'password', id: 'p', record: wrap('p') }]);
      expect(await vault.read(grace.id)).toEqual({ waysIn: [] });
    });
  });

  describe('the recovery kit', () => {
    it('is kept as a way in and marked confirmed together, and a new one replaces the one before', async () => {
      const vault = new KeyVault(db);
      const { id } = await person();
      await vault.setUp(id, ACCOUNT, [{ way: 'password', id: 'p', record: wrap('p') }]);
      await vault.confirmKit(id, wrap('kit1'));
      await vault.confirmKit(id, wrap('kit2'));
      const { account, waysIn } = await vault.read(id);
      expect(account?.kitConfirmed).toBe(true);
      expect(waysIn.filter((w) => w.way === 'kit')).toEqual([
        { way: 'kit', id: '', record: wrap('kit2') },
      ]);
    });
  });

  describe('an app’s keys', () => {
    it('are stored once, the first time, and read back', async () => {
      const vault = new KeyVault(db);
      const { id } = await person();
      await vault.setUp(id, ACCOUNT, [{ way: 'password', id: 'p', record: wrap('p') }]);
      const app = {
        clientId: 'notes',
        appKey: wrap('app'),
        identity: wrap('id'),
        signature: SIGNATURE,
      };
      expect(await vault.app(id, 'notes')).toBeUndefined();
      await vault.putApp(id, app);
      expect(await vault.app(id, 'notes')).toEqual(app);
      await expect(vault.putApp(id, app)).rejects.toMatchObject({ code: 'exists' });
      await expect(
        vault.putApp(id, { ...app, clientId: 'files', signature: 'short' }),
      ).rejects.toMatchObject({
        code: 'invalid',
      });
    });
  });

  describe('a session’s secret', () => {
    it('is made once for a live session and the same every time it is asked for', async () => {
      const vault = new KeyVault(db);
      const { id, sessionId } = await person();
      const first = await vault.sessionSecret(sessionId, id);
      expect(Buffer.from(first as string, 'base64url')).toHaveLength(32);
      expect(await vault.sessionSecret(sessionId, id)).toBe(first);
    });

    it('is given to no other account, and to no session that has run out or is gone', async () => {
      const vault = new KeyVault(db);
      const ada = await person();
      const grace = await person();
      expect(await vault.sessionSecret(ada.sessionId, grace.id)).toBeUndefined();
      await db.run('update sessions set expires_at = ? where id = ?', [
        db.family === 'postgres' ? new Date(1000) : 1000,
        ada.sessionId,
      ]);
      expect(await vault.sessionSecret(ada.sessionId, ada.id)).toBeUndefined();
      expect(await vault.sessionSecret('no-such-session', ada.id)).toBeUndefined();
    });
  });

  describe('deleting the account', () => {
    it('deletes its keys, ways in, app keys and session secrets in the one transaction', async () => {
      const vault = new KeyVault(db);
      await person(); // the owner, who is never deleted
      const { id, sessionId } = await person();
      await vault.setUp(id, ACCOUNT, [{ way: 'password', id: 'p', record: wrap('p') }]);
      await vault.putApp(id, {
        clientId: 'notes',
        appKey: wrap('a'),
        identity: wrap('i'),
        signature: SIGNATURE,
      });
      await vault.sessionSecret(sessionId, id);
      const manager = new AccountManager(db, new AccountStates(db), { log: () => undefined });
      expect(await manager.deleteAfterRestore(id)).toBe('deleted');
      for (const table of ['key_accounts', 'key_wraps', 'key_apps', 'key_session_secrets']) {
        expect(Number((await db.run(`select count(*) as n from ${table}`)).rows[0]?.n), table).toBe(
          0,
        );
      }
    });
  });

  describe('the instance id', () => {
    it('is not made again once keys were made with one', async () => {
      const vault = new KeyVault(db);
      await ensureInstanceId(db);
      const { id } = await person();
      await vault.setUp(id, ACCOUNT, [{ way: 'password', id: 'p', record: wrap('p') }]);
      await db.run("delete from instance_settings where key = 'instance_id'");
      await expect(ensureInstanceId(db)).rejects.toThrow(/must not be made again/);
    });
  });
}
