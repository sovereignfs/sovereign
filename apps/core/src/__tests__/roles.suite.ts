/**
 * Changing roles and the owner's guarantees (core-app §3.2.1) against a real database. One suite, run
 * by `roles.test.ts` on a SQLite file (a plain `pnpm test` covers it) and by `roles.db.test.ts` on
 * whichever dialect the CI leg started.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Database } from '@sovereignfs/database';
import type { TestDatabase } from '@sovereignfs/database/testing';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AccountStateError, AccountStates } from '../accounts/states';
import { ROLE_ADMIN, ROLE_OWNER, ROLE_USER } from '../auth/roles';
import { migrateCore } from '../db/migrate';
import { OwnershipTransferError, transferOwnership } from '../roles/ownership';
import { RoleChangeError, changeRole } from '../roles/people';
import { call, Jar, makeAuth, signedInAs, signUp } from './auth-harness';

const MIGRATIONS = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../migrations');

export function rolesSuite(createDatabase: () => Promise<TestDatabase>): void {
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

  const roleOf = async (id: string) => {
    const { rows } = await db.run('select role from users where id = ?', [id]);
    return rows[0]?.role;
  };
  const idOf = async (email: string) => {
    const { rows } = await db.run('select id from users where email = ?', [email]);
    return String(rows[0]?.id);
  };
  const owners = async () => {
    const { rows } = await db.run(
      "select id, deactivated_at from users where role = 'platform:owner'",
    );
    return rows;
  };

  /** An owner, an admin, and two ordinary people. */
  async function instance() {
    const a = auth();
    const owner = await signUp(a);
    const ids = {
      owner: await idOf(owner.email),
      admin: await idOf((await signUp(a)).email),
      one: await idOf((await signUp(a)).email),
      two: await idOf((await signUp(a)).email),
    };
    await changeRole(db, { id: ids.owner, role: ROLE_OWNER }, ids.admin, ROLE_ADMIN);
    return { a, owner, ids };
  }
  const asOwner = (ids: { owner: string }) => ({ id: ids.owner, role: ROLE_OWNER });

  describe('changing a role', () => {
    it('lets the owner make an ordinary account an admin, and back', async () => {
      const { ids } = await instance();
      expect(await roleOf(ids.admin)).toBe(ROLE_ADMIN);
      expect(await changeRole(db, asOwner(ids), ids.admin, ROLE_USER)).toEqual({ changed: true });
      expect(await roleOf(ids.admin)).toBe(ROLE_USER);
      expect(await changeRole(db, asOwner(ids), ids.admin, ROLE_ADMIN)).toEqual({ changed: true });
    });

    it('does nothing, and says so, when the account already has that role', async () => {
      const { ids } = await instance();
      expect(await changeRole(db, asOwner(ids), ids.one, ROLE_USER)).toEqual({ changed: false });
    });

    it.each([ROLE_ADMIN, ROLE_USER, 'platform:superuser', ''])(
      'refuses anyone but the owner, even an admin acting on an ordinary account (to %j)',
      async (actorRole) => {
        const { ids } = await instance();
        for (const actor of [
          { id: ids.admin, role: ROLE_ADMIN },
          { id: ids.one, role: ROLE_USER },
          { id: ids.two, role: actorRole },
        ]) {
          await expect(changeRole(db, actor, ids.one, ROLE_ADMIN)).rejects.toMatchObject({
            code: 'forbidden',
          });
        }
        expect(await roleOf(ids.one)).toBe(ROLE_USER);
      },
    );

    it('cannot make anyone the owner: ownership moves by transfer, not by a role change', async () => {
      const { ids } = await instance();
      await expect(changeRole(db, asOwner(ids), ids.admin, ROLE_OWNER)).rejects.toMatchObject({
        code: 'ownership',
      });
      expect(await roleOf(ids.admin)).toBe(ROLE_ADMIN);
      expect(await owners()).toHaveLength(1);
    });

    it('cannot change the owner’s role, not even by the owner', async () => {
      const { ids } = await instance();
      for (const role of [ROLE_ADMIN, ROLE_USER]) {
        await expect(changeRole(db, asOwner(ids), ids.owner, role)).rejects.toMatchObject({
          code: 'owner-fixed',
        });
      }
      expect(await roleOf(ids.owner)).toBe(ROLE_OWNER);
    });

    it.each(['platform:superuser', 'owner', '', undefined, null, 5])(
      'refuses %j as a role',
      async (role) => {
        const { ids } = await instance();
        await expect(changeRole(db, asOwner(ids), ids.one, role)).rejects.toMatchObject({
          code: 'invalid-role',
        });
        expect(await roleOf(ids.one)).toBe(ROLE_USER);
      },
    );

    it('says so when there is no such account', async () => {
      const { ids } = await instance();
      await expect(changeRole(db, asOwner(ids), 'nobody', ROLE_ADMIN)).rejects.toMatchObject({
        code: 'not-found',
      });
      await expect(changeRole(db, asOwner(ids), 'nobody', ROLE_ADMIN)).rejects.toBeInstanceOf(
        RoleChangeError,
      );
    });

    it('shows at once in what core reads from the database, for someone already signed in', async () => {
      const a = auth();
      await signUp(a);
      const person = await signUp(a);
      const id = await idOf(person.email);
      const ownerId = String((await owners())[0]?.id);
      const asked = async () =>
        signedInAs(
          await call(a, 'GET', '/get-session?disableCookieCache=true', { jar: person.jar }),
        ) as { role?: string } | null;
      expect((await asked())?.role).toBe(ROLE_USER);
      await changeRole(db, { id: ownerId, role: ROLE_OWNER }, id, ROLE_ADMIN);
      expect((await asked())?.role).toBe(ROLE_ADMIN);
    });

    it('cannot be done by the person to themselves through an update of the account', async () => {
      const a = auth();
      await signUp(a);
      const person = await signUp(a);
      const reply = await call(a, 'POST', '/update-user', {
        jar: person.jar,
        body: { role: ROLE_ADMIN },
      });
      expect(reply.status).toBeGreaterThanOrEqual(400);
      expect(await roleOf(await idOf(person.email))).toBe(ROLE_USER);
    });
  });

  describe('there is always exactly one owner', () => {
    it('starts with the first account, and no sign-up makes a second', async () => {
      const a = auth();
      for (let i = 0; i < 4; i++) await signUp(a, { jar: new Jar() });
      expect(await owners()).toHaveLength(1);
    });

    it('cannot be broken by deactivating the owner', async () => {
      const { ids } = await instance();
      await expect(new AccountStates(db).deactivate(ids.owner)).rejects.toBeInstanceOf(
        AccountStateError,
      );
      expect(await owners()).toHaveLength(1);
    });

    it('holds through any sequence of role changes, deactivations and transfers, by anyone', async () => {
      const { ids } = await instance();
      const states = new AccountStates(db, { log: () => undefined });
      const everyone = Object.values(ids);
      const roles = [ROLE_ADMIN, ROLE_USER, ROLE_OWNER, 'platform:nonsense'];
      const roleNow = async (id: string) => String(await roleOf(id));

      // a fixed pseudo-random run, so a failure can be repeated
      let seed = 20261028;
      const next = (n: number) => {
        seed = (seed * 1103515245 + 12345) % 2147483648;
        return seed % n;
      };
      for (let step = 0; step < 150; step++) {
        const actorId = everyone[next(everyone.length)] as string;
        const targetId = everyone[next(everyone.length)] as string;
        const action = next(4);
        try {
          if (action === 0) {
            await changeRole(
              db,
              { id: actorId, role: await roleNow(actorId) },
              targetId,
              roles[next(roles.length)],
            );
          } else if (action === 1) {
            await states.deactivate(targetId);
          } else if (action === 3) {
            await transferOwnership(
              db,
              { id: actorId, role: await roleNow(actorId) },
              { targetId, newRole: roles[next(roles.length)], password: 'anything' },
              () => Promise.resolve('ok'),
            );
          } else {
            await states.reactivate(targetId);
          }
        } catch (error) {
          if (!(
            error instanceof RoleChangeError ||
            error instanceof AccountStateError ||
            error instanceof OwnershipTransferError
          ))
            throw error;
        }
        const now = await owners();
        expect(now, `after step ${step}`).toHaveLength(1);
        expect(now[0]?.deactivated_at ?? null, `after step ${step}`).toBeNull();
      }
    });
  });
}
