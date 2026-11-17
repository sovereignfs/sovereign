/**
 * The vault of an app that runs with no core (sdk §9.5) against a real database: its tables on the dialect under test, the vault id
 * made once and never again, what it keeps and refuses, deleting on the caller's transaction, and the shared unlock routine running
 * over it end to end: set up at the first sign-in, opened in a second browser, a passphrase, and the kit after the password is lost.
 */
import { migrate, type Database } from '@sovereignfs/database';
import type { TestDatabase } from '@sovereignfs/database/testing';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  derivePassphrase,
  derivePassword,
  formatKit,
  fromBase64Url,
  KeyStore,
  keepKit,
  kitPending,
  memoryBackend,
  openAppKey,
  keptAccountKey,
  unlockWithKit,
  unlockWithPassword,
  type AppKeyActions,
  type KitActions,
  type WebKey,
} from '../../web/index.js';
import {
  AppVault,
  newSessionSecret,
  VAULT_MIGRATIONS_TABLE,
  VaultIdLost,
  vaultMigrations,
} from '../index.js';

/** The value, or a failed test: a test reads what it just wrote. */
function defined<T>(value: T | undefined | null): T {
  if (value === undefined || value === null) throw new Error('expected a value');
  return value;
}

const B64 = (byte: number) => Buffer.alloc(32, byte).toString('base64url');
const wrap = (tag: string) => JSON.stringify({ suite: 1, nonce: tag, ciphertext: tag });
const ACCOUNT = { suite: 1, unlockSalt: B64(1), signingPublic: B64(2), signingPrivate: wrap('s') };
const SIGNATURE = 'A'.repeat(86);

/** The routine's calls straight onto the vault, for one person and one session secret: what an app's two routes do. */
function actionsFor(
  vault: AppVault,
  sub: string,
  secret: () => string | undefined,
): AppKeyActions & KitActions {
  const ok = async (work: () => Promise<unknown>) => {
    try {
      return { ok: true as const, value: (await work()) as never };
    } catch (error) {
      return { ok: false as const, error: String(error) };
    }
  };
  return {
    read: () => ok(() => vault.read(sub)),
    setUp: (account, waysIn) => ok(() => vault.setUp(sub, account, waysIn)),
    putWayIn: (wayIn) => ok(() => vault.putWayIn(sub, wayIn)),
    removeWayIn: (_way, id) => ok(() => vault.removeWayIn(sub, 'password', id)),
    sessionSecret: async () => ({ ok: true, value: secret() }),
    readApp: (clientId) => ok(() => vault.app(sub, clientId)),
    putApp: (app) => ok(() => vault.putApp(sub, app)),
    confirmKit: (record) => ok(() => vault.confirmKit(sub, record)),
  };
}

export function appVaultSuite(createDatabase: () => Promise<TestDatabase>): void {
  let target: TestDatabase;
  let db: Database;

  beforeAll(async () => {
    target = await createDatabase();
    db = await target.open();
    await migrate(db, vaultMigrations(db.family), { table: VAULT_MIGRATIONS_TABLE });
  });
  afterAll(async () => {
    await db.close().catch(() => undefined);
    await target.cleanup();
  });
  beforeEach(async () => {
    for (const table of ['sv_key_apps', 'sv_key_wraps', 'sv_key_accounts', 'sv_key_settings']) {
      await db.run(`delete from ${table}`);
    }
  });

  describe('its tables', () => {
    it('are migrated once, under their own history, beside an app that has its own', async () => {
      const again = await migrate(db, vaultMigrations(db.family), {
        table: VAULT_MIGRATIONS_TABLE,
      });
      expect(again).toEqual({ applied: [], alreadyApplied: ['0000_vault'] });
      const app = await migrate(db, [
        { name: '0000_notes', sql: 'create table notes (id text primary key)' },
      ]);
      expect(app.applied).toEqual(['0000_notes']);
    });

    it('store a millisecond timestamp exactly', async () => {
      const at = 1_761_580_000_123;
      await new AppVault(db, () => at).setUp('p', ACCOUNT, [
        { way: 'password', id: 'a', record: wrap('pw') },
      ]);
      const { rows } = await db.run('select created_at from sv_key_accounts where user_id = ?', [
        'p',
      ]);
      expect(rows).toEqual([{ created_at: at }]);
    });
  });

  describe('the vault id', () => {
    it('is 32 bytes, made the first time, and the same ever after', async () => {
      const vault = new AppVault(db);
      const id = await vault.vaultId();
      expect(fromBase64Url(id)).toHaveLength(32);
      expect(await vault.vaultId()).toBe(id);
      expect(await new AppVault(db).vaultId()).toBe(id);
    });

    it('is one, when several ask at once', async () => {
      const ids = await Promise.all([1, 2, 3, 4].map(() => new AppVault(db).vaultId()));
      expect(new Set(ids).size).toBe(1);
    });

    it('is never made again once accounts exist without one', async () => {
      const vault = new AppVault(db);
      await vault.vaultId();
      await vault.setUp('p', ACCOUNT, [{ way: 'password', id: 'a', record: wrap('pw') }]);
      await db.run('delete from sv_key_settings');
      await expect(vault.vaultId()).rejects.toBeInstanceOf(VaultIdLost);
      expect((await db.run('select 1 from sv_key_settings')).rows).toEqual([]);
    });
  });

  describe('a person', () => {
    it('is nothing until set up, then their keys and ways in, the kit not yet kept', async () => {
      const vault = new AppVault(db);
      expect(await vault.read('p')).toEqual({ sub: 'p', waysIn: [] });
      await vault.setUp('p', ACCOUNT, [{ way: 'password', id: 'a', record: wrap('pw') }]);
      expect(await vault.read('p')).toEqual({
        sub: 'p',
        account: { ...ACCOUNT, kitConfirmed: false },
        waysIn: [{ way: 'password', id: 'a', record: wrap('pw') }],
      });
    });

    it('is set up once', async () => {
      const vault = new AppVault(db);
      await vault.setUp('p', ACCOUNT, [{ way: 'password', id: 'a', record: wrap('pw') }]);
      await expect(
        vault.setUp('p', ACCOUNT, [{ way: 'password', id: 'b', record: wrap('pw') }]),
      ).rejects.toMatchObject({ code: 'exists' });
    });

    it.each([
      ['no way in', []],
      ['only a kit', [{ way: 'kit', id: '', record: wrap('k') }]],
      ['a passkey, which needs core', [{ way: 'passkey', id: 'c', record: wrap('k') }]],
      ['escrow, which needs core', [{ way: 'escrow', id: 'e', record: wrap('k') }]],
      ['a record that is not JSON', [{ way: 'password', id: 'a', record: 'nope' }]],
    ])('is refused with %s', async (_what, waysIn) => {
      await expect(new AppVault(db).setUp('p', ACCOUNT, waysIn)).rejects.toMatchObject({
        code: 'invalid',
      });
      expect((await new AppVault(db).read('p')).account).toBeUndefined();
    });

    it('keeps a kit once confirmed, replacing the one before', async () => {
      const vault = new AppVault(db);
      await expect(vault.confirmKit('p', wrap('k'))).rejects.toMatchObject({ code: 'not-set-up' });
      await vault.setUp('p', ACCOUNT, [{ way: 'password', id: 'a', record: wrap('pw') }]);
      await vault.confirmKit('p', wrap('k1'));
      await vault.confirmKit('p', wrap('k2'));
      const read = await vault.read('p');
      expect(read.account?.kitConfirmed).toBe(true);
      expect(read.waysIn.filter((w) => w.way === 'kit')).toEqual([
        { way: 'kit', id: '', record: wrap('k2') },
      ]);
    });

    it('has keys for an app made once', async () => {
      const vault = new AppVault(db);
      const app = {
        clientId: 'notes',
        appKey: wrap('ak'),
        identity: wrap('id'),
        signature: SIGNATURE,
      };
      await expect(vault.putApp('p', app)).rejects.toMatchObject({ code: 'not-set-up' });
      await vault.setUp('p', ACCOUNT, [{ way: 'password', id: 'a', record: wrap('pw') }]);
      await vault.putApp('p', app);
      await expect(vault.putApp('p', app)).rejects.toMatchObject({ code: 'exists' });
      expect(await vault.app('p', 'notes')).toEqual(app);
      expect(await vault.app('q', 'notes')).toBeUndefined();
    });

    it('goes whole, on the caller’s transaction, and a rolled-back one keeps everything', async () => {
      const vault = new AppVault(db);
      await vault.setUp('p', ACCOUNT, [{ way: 'password', id: 'a', record: wrap('pw') }]);
      await vault.putApp('p', {
        clientId: 'n',
        appKey: wrap('a'),
        identity: wrap('i'),
        signature: SIGNATURE,
      });
      await expect(
        db.transaction(async (tx) => {
          await vault.deleteAccount('p', tx);
          throw new Error('the app’s own delete failed');
        }),
      ).rejects.toThrow();
      expect((await vault.read('p')).account).toBeDefined();
      await db.transaction((tx) => vault.deleteAccount('p', tx));
      expect(await vault.read('p')).toEqual({ sub: 'p', waysIn: [] });
      expect(await vault.app('p', 'n')).toBeUndefined();
    });
  });

  describe('with the shared unlock routine', () => {
    const SUB = 'user-1';
    let secret: WebKey;
    let signIn: string;

    beforeAll(async () => {
      const vaultId = fromBase64Url(B64(9)) as Uint8Array;
      ({ secret, signIn } = await derivePassword({
        password: 'correct horse battery staple',
        address: 'Ada@Example.org ',
        instanceId: vaultId,
      }));
    }, 30_000);

    it('sets up at the first sign-in, and a second browser opens the same app key with the password alone', async () => {
      const vault = new AppVault(db);
      let session = newSessionSecret();
      const first = new KeyStore(memoryBackend());
      expect(
        await unlockWithPassword(
          secret,
          actionsFor(vault, SUB, () => session),
          first,
        ),
      ).toBe('set-up');
      const actions = actionsFor(vault, SUB, () => session);
      const read = await vault.read(SUB);
      const accountKey = (await keptAccountKey(actions, first)) as Uint8Array;
      const appKey = await openAppKey(
        accountKey,
        SUB,
        defined(read.account).signingPrivate,
        'notes',
        actions,
      );
      expect(appKey).toHaveLength(32);

      // Another browser, another session: nothing kept there, and the password opens the same keys.
      session = newSessionSecret();
      const second = new KeyStore(memoryBackend());
      expect(
        await unlockWithPassword(
          secret,
          actionsFor(vault, SUB, () => session),
          second,
        ),
      ).toBe('unlocked');
      const again = (await keptAccountKey(actions, second)) as Uint8Array;
      expect(Buffer.from(again)).toEqual(Buffer.from(accountKey));
      const appAgain = await openAppKey(
        again,
        SUB,
        defined(read.account).signingPrivate,
        'notes',
        actions,
      );
      expect(Buffer.from(defined(appAgain))).toEqual(Buffer.from(defined(appKey)));
      // What the vault stored is records and public keys: never the password, its sign-in value, or a key.
      const stored = JSON.stringify((await db.run('select * from sv_key_wraps')).rows);
      expect(stored).not.toContain(signIn.slice(5));
    }, 30_000);

    it('opens nothing once the session ends: what the browser kept needs the secret that went with it', async () => {
      const vault = new AppVault(db);
      let session: string | undefined = newSessionSecret();
      const store = new KeyStore(memoryBackend());
      await unlockWithPassword(
        secret,
        actionsFor(vault, SUB, () => session),
        store,
      );
      session = undefined;
      expect(
        await keptAccountKey(
          actionsFor(vault, SUB, () => session),
          store,
        ),
      ).toBeUndefined();
      session = newSessionSecret();
      expect(
        await keptAccountKey(
          actionsFor(vault, SUB, () => session),
          store,
        ),
      ).toBeUndefined();
    }, 30_000);

    it('takes a passphrase as the password’s way in, for an app whose sign-in is someone else’s', async () => {
      const vault = new AppVault(db);
      const vaultId = fromBase64Url(await vault.vaultId()) as Uint8Array;
      const phrase = await derivePassphrase({ passphrase: 'a long passphrase', sub: SUB, vaultId });
      const session = newSessionSecret();
      const store = new KeyStore(memoryBackend());
      expect(
        await unlockWithPassword(
          phrase,
          actionsFor(vault, SUB, () => session),
          store,
        ),
      ).toBe('set-up');
      expect((await vault.read(SUB)).waysIn.map((w) => w.way)).toEqual(['password']);
      const wrong = await derivePassphrase({ passphrase: 'another passphrase', sub: SUB, vaultId });
      expect(
        await unlockWithPassword(
          wrong,
          actionsFor(vault, SUB, () => session),
          new KeyStore(memoryBackend()),
        ),
      ).toBe('locked');
    }, 30_000);

    it('keeps the kit, which opens the keys once the password no longer does, and gives the new password its way in', async () => {
      const vault = new AppVault(db);
      const session = newSessionSecret();
      const actions = actionsFor(vault, SUB, () => session);
      const store = new KeyStore(memoryBackend());
      await unlockWithPassword(secret, actions, store);
      expect(await kitPending(actions)).toBe(true);
      const kit = crypto.getRandomValues(new Uint8Array(32));
      const typed = await formatKit(kit);
      expect(await keepKit(kit, actions, store)).toBe(true);
      expect(await kitPending(actions)).toBe(false);

      const vaultId = fromBase64Url(B64(9)) as Uint8Array;
      const { secret: next } = await derivePassword({
        password: 'a new password, after a reset',
        address: 'ada@example.org',
        instanceId: vaultId,
      });
      const fresh = new KeyStore(memoryBackend());
      expect(await unlockWithPassword(next, actions, fresh)).toBe('locked');
      expect(await unlockWithKit(typed, next, actions, fresh)).toBe('unlocked');
      expect(await unlockWithPassword(next, actions, new KeyStore(memoryBackend()))).toBe(
        'unlocked',
      );
      expect(await unlockWithPassword(secret, actions, new KeyStore(memoryBackend()))).toBe(
        'locked',
      );
    }, 60_000);
  });
}
