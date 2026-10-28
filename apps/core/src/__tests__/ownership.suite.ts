/**
 * Handing the instance to an admin (core-app §3.2.1) and asking for the password again, against a real
 * database. One suite, run by `ownership.test.ts` on a SQLite file (a plain `pnpm test` covers it) and by
 * `ownership.db.test.ts` on whichever dialect the CI leg started.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Database } from '@sovereignfs/database';
import type { TestDatabase } from '@sovereignfs/database/testing';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AccountStates } from '../accounts/states';
import { CONFIRM_LIMIT, confirmPassword, type PasswordCheck } from '../auth/confirm-password';
import { ROLE_ADMIN, ROLE_OWNER, ROLE_USER } from '../auth/roles';
import { migrateCore } from '../db/migrate';
import { can } from '../roles/capabilities';
import { OwnershipTransferError, transferOwnership } from '../roles/ownership';
import { RoleChangeError, changeRole } from '../roles/people';
import { makeAuth, PASSWORD, signUp } from './auth-harness';

const MIGRATIONS = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../migrations');

export function ownershipSuite(createDatabase: () => Promise<TestDatabase>): void {
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
    for (const table of ['rate_limits', 'sessions', 'accounts', 'verifications', 'users']) {
      await db.run(`delete from ${table}`);
    }
  });

  const roleOf = async (id: string) =>
    String((await db.run('select role from users where id = ?', [id])).rows[0]?.role);
  const owners = async () =>
    (await db.run("select id from users where role = 'platform:owner'")).rows.map((r) =>
      String(r.id),
    );
  const idOf = async (email: string) =>
    String((await db.run('select id from users where email = ?', [email])).rows[0]?.id);
  const attempts = async () =>
    (await db.run("select count from rate_limits where key like 'confirm-password|%'")).rows.map(
      (r) => Number(r.count),
    );

  /** An owner, two admins and an ordinary account, each with the standard password. */
  async function instance() {
    const a = auth();
    const owner = await signUp(a);
    const ids = {
      owner: await idOf(owner.email),
      admin: await idOf((await signUp(a)).email),
      otherAdmin: await idOf((await signUp(a)).email),
      user: await idOf((await signUp(a)).email),
    };
    const asOwner = { id: ids.owner, role: ROLE_OWNER };
    await changeRole(db, asOwner, ids.admin, ROLE_ADMIN);
    await changeRole(db, asOwner, ids.otherAdmin, ROLE_ADMIN);
    const confirm = (userId: string, password: string) => confirmPassword(db, a, userId, password);
    return { a, ids, confirm, asOwner };
  }
  const ok = (): Promise<PasswordCheck> => Promise.resolve('ok');
  const refused = async (run: () => Promise<unknown>) => {
    try {
      await run();
    } catch (error) {
      return error instanceof OwnershipTransferError ? error.code : error;
    }
    return undefined;
  };

  describe('handing over ownership', () => {
    it('makes the admin the owner and the owner an admin, so there is still exactly one owner', async () => {
      const { ids, asOwner, confirm } = await instance();
      const result = await transferOwnership(
        db,
        asOwner,
        { targetId: ids.admin, password: PASSWORD },
        confirm,
      );
      expect(result).toEqual({ newOwnerId: ids.admin, previousOwnerRole: ROLE_ADMIN });
      expect(await owners()).toEqual([ids.admin]);
      expect(await roleOf(ids.owner)).toBe(ROLE_ADMIN);
      expect(await roleOf(ids.otherAdmin)).toBe(ROLE_ADMIN);
      expect(await roleOf(ids.user)).toBe(ROLE_USER);
    });

    it('lets the previous owner become an ordinary account instead', async () => {
      const { ids, asOwner, confirm } = await instance();
      await transferOwnership(
        db,
        asOwner,
        { targetId: ids.admin, newRole: ROLE_USER, password: PASSWORD },
        confirm,
      );
      expect(await roleOf(ids.owner)).toBe(ROLE_USER);
      expect(await owners()).toEqual([ids.admin]);
    });

    it('gives the capabilities of the new roles, and takes them from the old', async () => {
      const { ids, asOwner, confirm } = await instance();
      await transferOwnership(db, asOwner, { targetId: ids.admin, password: PASSWORD }, confirm);
      expect(can(await roleOf(ids.admin), 'ownership:transfer')).toBe(true);
      expect(can(await roleOf(ids.admin), 'role:assign')).toBe(true);
      expect(can(await roleOf(ids.owner), 'ownership:transfer')).toBe(false);
      expect(can(await roleOf(ids.owner), 'role:assign')).toBe(false);
      expect(can(await roleOf(ids.owner), 'console:access')).toBe(true);
      // The old owner can no longer change roles; the new one can.
      await expect(
        changeRole(db, { id: ids.owner, role: await roleOf(ids.owner) }, ids.user, ROLE_ADMIN),
      ).rejects.toBeInstanceOf(RoleChangeError);
      await expect(
        changeRole(db, { id: ids.admin, role: await roleOf(ids.admin) }, ids.user, ROLE_ADMIN),
      ).resolves.toEqual({ changed: true });
    });

    it('can be done again, by the new owner', async () => {
      const { ids, asOwner, confirm } = await instance();
      await transferOwnership(db, asOwner, { targetId: ids.admin, password: PASSWORD }, confirm);
      await transferOwnership(
        db,
        { id: ids.admin, role: ROLE_OWNER },
        { targetId: ids.owner, password: PASSWORD },
        confirm,
      );
      expect(await owners()).toEqual([ids.owner]);
    });
  });

  describe('refused, and nothing changes', () => {
    const unchanged = async (ids: { owner: string }) => {
      expect(await owners()).toEqual([ids.owner]);
    };

    it.each([
      ['an admin', ROLE_ADMIN],
      ['an ordinary account', ROLE_USER],
      ['a role that is not one', 'platform:superuser'],
      ['nobody', undefined],
    ])('when it comes from %s', async (_who, role) => {
      const { ids, confirm } = await instance();
      expect(
        await refused(() =>
          transferOwnership(
            db,
            { id: ids.admin, role },
            { targetId: ids.otherAdmin, password: PASSWORD },
            confirm,
          ),
        ),
      ).toBe('forbidden');
      await unchanged(ids);
    });

    it.each([
      ['an ordinary account', 'user'],
      ['the owner themselves', 'owner'],
      ['an account that does not exist', 'nobody'],
    ] as const)('to %s', async (_who, which) => {
      const { ids, asOwner, confirm } = await instance();
      const targetId = which === 'nobody' ? 'no-such-account' : ids[which];
      const code = await refused(() =>
        transferOwnership(db, asOwner, { targetId, password: PASSWORD }, confirm),
      );
      expect(code).toBe(which === 'owner' ? 'self' : 'not-an-admin');
      await unchanged(ids);
    });

    it.each([undefined, null, '', 5, {}])('to %j', async (targetId) => {
      const { ids, asOwner, confirm } = await instance();
      expect(
        await refused(() =>
          transferOwnership(db, asOwner, { targetId, password: PASSWORD }, confirm),
        ),
      ).toBe('not-an-admin');
      await unchanged(ids);
    });

    it('to an admin whose account is deactivated, which is not left half done', async () => {
      const { ids, asOwner, confirm } = await instance();
      await new AccountStates(db, { log: () => undefined }).deactivate(ids.admin);
      expect(
        await refused(() =>
          transferOwnership(db, asOwner, { targetId: ids.admin, password: PASSWORD }, confirm),
        ),
      ).toBe('not-an-admin');
      await unchanged(ids);
      expect(await roleOf(ids.owner)).toBe(ROLE_OWNER);
    });

    it.each(['platform:owner', 'platform:superuser', 5, null])(
      'when the previous owner is to become %j',
      async (newRole) => {
        const { ids, asOwner, confirm } = await instance();
        expect(
          await refused(() =>
            transferOwnership(
              db,
              asOwner,
              { targetId: ids.admin, newRole, password: PASSWORD },
              confirm,
            ),
          ),
        ).toBe(newRole === null ? undefined : 'invalid-role');
        if (newRole !== null) await unchanged(ids);
      },
    );

    it.each([undefined, null, '', 'not my password', 5, {}])(
      'without the right password: %j',
      async (password) => {
        const { ids, asOwner, confirm } = await instance();
        expect(
          await refused(() =>
            transferOwnership(db, asOwner, { targetId: ids.admin, password }, confirm),
          ),
        ).toBe('wrong-password');
        await unchanged(ids);
      },
    );

    it('when the password is asked for and the answer is "limited"', async () => {
      const { ids, asOwner } = await instance();
      expect(
        await refused(() =>
          transferOwnership(db, asOwner, { targetId: ids.admin, password: PASSWORD }, () =>
            Promise.resolve('limited'),
          ),
        ),
      ).toBe('limited');
      await unchanged(ids);
    });

    it('when the person is no longer the owner by the time it happens', async () => {
      const { ids, confirm } = await instance();
      // The session still says owner, the database no longer does.
      await transferOwnership(
        db,
        { id: ids.owner, role: ROLE_OWNER },
        { targetId: ids.admin, password: PASSWORD },
        confirm,
      );
      expect(
        await refused(() =>
          transferOwnership(
            db,
            { id: ids.owner, role: ROLE_OWNER },
            { targetId: ids.otherAdmin, password: PASSWORD },
            confirm,
          ),
        ),
      ).toBe('not-owner');
      expect(await owners()).toEqual([ids.admin]);
      expect(await roleOf(ids.otherAdmin)).toBe(ROLE_ADMIN);
    });
  });

  describe('two at once', () => {
    it('cannot make two owners, or none: one wins, the other changes nothing', async () => {
      const { ids, asOwner } = await instance();
      const results = await Promise.allSettled([
        transferOwnership(db, asOwner, { targetId: ids.admin, password: PASSWORD }, ok),
        transferOwnership(db, asOwner, { targetId: ids.otherAdmin, password: PASSWORD }, ok),
      ]);
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      const loser = results.find((r) => r.status === 'rejected');
      expect(
        loser?.status === 'rejected' ? (loser.reason as OwnershipTransferError).code : '',
      ).toBe('not-owner');
      const now = await owners();
      expect(now).toHaveLength(1);
      expect([ids.admin, ids.otherAdmin]).toContain(now[0]);
      expect(await roleOf(ids.owner)).toBe(ROLE_ADMIN);
    });

    it('cannot promote an admin who is being made an ordinary account at the same moment', async () => {
      const { ids, asOwner } = await instance();
      const results = await Promise.allSettled([
        transferOwnership(db, asOwner, { targetId: ids.admin, password: PASSWORD }, ok),
        changeRole(db, asOwner, ids.admin, ROLE_USER),
      ]);
      const now = await owners();
      expect(now).toHaveLength(1);
      expect(results.some((r) => r.status === 'fulfilled')).toBe(true);
      // Whichever came first, nobody ends up owner who is not an admin or the old owner.
      expect([ids.owner, ids.admin]).toContain(now[0]);
      expect(await roleOf(now[0] as string)).toBe(ROLE_OWNER);
    });
  });

  describe('asking for the password again', () => {
    it('says ok for the right password and wrong for any other, and clears the count on ok', async () => {
      const { a, ids } = await instance();
      expect(await confirmPassword(db, a, ids.owner, 'nope')).toBe('wrong');
      expect(await attempts()).toEqual([1]);
      expect(await confirmPassword(db, a, ids.owner, PASSWORD)).toBe('ok');
      expect(await attempts()).toEqual([]);
    });

    it.each([undefined, null, '', 5, {}, ['x']])('says wrong for %j', async (password) => {
      const { a, ids } = await instance();
      expect(await confirmPassword(db, a, ids.owner, password)).toBe('wrong');
    });

    it('says wrong for an account that has no password on file', async () => {
      const { a, ids } = await instance();
      await db.run("delete from accounts where user_id = ? and provider_id = 'credential'", [
        ids.owner,
      ]);
      expect(await confirmPassword(db, a, ids.owner, PASSWORD)).toBe('wrong');
    });

    it('is another account’s password that is wrong, not this one’s', async () => {
      const { a, ids } = await instance();
      const other = await signUp(a, { password: 'a different long password' });
      expect(await confirmPassword(db, a, ids.owner, other.password)).toBe('wrong');
    });

    it('refuses everything, the right password too, after too many wrong ones, until the window ends', async () => {
      const { a, ids } = await instance();
      const t0 = 1_000_000;
      for (let i = 0; i < CONFIRM_LIMIT.max; i++) {
        expect(await confirmPassword(db, a, ids.owner, 'nope', t0 + i)).toBe('wrong');
      }
      expect(await confirmPassword(db, a, ids.owner, PASSWORD, t0 + 10)).toBe('limited');
      expect(await confirmPassword(db, a, ids.owner, 'nope', t0 + 20)).toBe('limited');
      expect(
        await confirmPassword(db, a, ids.owner, PASSWORD, t0 + CONFIRM_LIMIT.windowMs + 10),
      ).toBe('ok');
    });

    it('counts per account, so one person’s wrong answers do not stop another', async () => {
      const { a, ids } = await instance();
      for (let i = 0; i < CONFIRM_LIMIT.max; i++) await confirmPassword(db, a, ids.owner, 'nope');
      expect(await confirmPassword(db, a, ids.owner, PASSWORD)).toBe('limited');
      expect(await confirmPassword(db, a, ids.admin, PASSWORD)).toBe('ok');
    });

    it('starts counting again once the window has passed', async () => {
      const { a, ids } = await instance();
      const t0 = 5_000_000;
      for (let i = 0; i < CONFIRM_LIMIT.max - 1; i++) {
        await confirmPassword(db, a, ids.owner, 'nope', t0);
      }
      expect(await confirmPassword(db, a, ids.owner, 'nope', t0 + CONFIRM_LIMIT.windowMs + 1)).toBe(
        'wrong',
      );
      expect(await attempts()).toEqual([1]);
    });

    it('is what a transfer with the real check asks, so a wrong password counts', async () => {
      const { ids, asOwner, confirm } = await instance();
      for (let i = 0; i < CONFIRM_LIMIT.max; i++) {
        expect(
          await refused(() =>
            transferOwnership(db, asOwner, { targetId: ids.admin, password: 'nope' }, confirm),
          ),
        ).toBe('wrong-password');
      }
      expect(
        await refused(() =>
          transferOwnership(db, asOwner, { targetId: ids.admin, password: PASSWORD }, confirm),
        ),
      ).toBe('limited');
      expect(await owners()).toEqual([ids.owner]);
    });
  });
}
