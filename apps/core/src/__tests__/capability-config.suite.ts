/**
 * The owner editing the capability matrix (core-app §3.2.3) against a real database: what is stored,
 * what is refused, and that a stored row can never hand out what belongs to the owner. One suite, run by
 * `capability-config.test.ts` on a SQLite file (a plain `pnpm test` covers it) and by
 * `capability-config.db.test.ts` on whichever dialect the CI leg started.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Database } from '@sovereignfs/database';
import type { TestDatabase } from '@sovereignfs/database/testing';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ROLE_ADMIN, ROLE_OWNER, ROLE_USER } from '../auth/roles';
import { migrateCore } from '../db/migrate';
import { DEFAULT_MATRIX, can } from '../roles/capabilities';
import {
  CapabilityChangeError,
  type CapabilityChange,
  changeCapabilities,
  resetCapabilities,
} from '../roles/configure';
import { loadMatrix } from '../roles/matrix';

const MIGRATIONS = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../migrations');

export function capabilityConfigSuite(createDatabase: () => Promise<TestDatabase>): void {
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
    await db.run('delete from capability_overrides');
  });

  const owner = { id: 'owner-1', role: ROLE_OWNER };
  const rows = async () =>
    (
      await db.run(
        'select role, capability, granted, updated_by from capability_overrides order by role, capability',
      )
    ).rows.map((r) => ({
      role: String(r.role),
      capability: String(r.capability),
      granted: Number(r.granted),
      by: r.updated_by as string | null,
    }));
  const refused = async (run: () => Promise<unknown>) => {
    try {
      await run();
    } catch (error) {
      return error instanceof CapabilityChangeError ? error.code : error;
    }
    return undefined;
  };

  it('is the default matrix when nobody has edited it', async () => {
    const matrix = await loadMatrix(db);
    expect(matrix[ROLE_ADMIN]).toEqual(DEFAULT_MATRIX[ROLE_ADMIN]);
    expect(matrix[ROLE_USER]).toEqual(DEFAULT_MATRIX[ROLE_USER]);
    expect(await rows()).toEqual([]);
  });

  describe('the owner changing it', () => {
    it('gives and takes away, and the matrix in force shows it', async () => {
      const result = await changeCapabilities(db, owner, [
        { role: ROLE_USER, capability: 'user:view', granted: true },
        { role: ROLE_ADMIN, capability: 'client:manage', granted: false },
      ]);
      expect(result.changed).toBe(2);
      const matrix = await loadMatrix(db);
      expect(can(ROLE_USER, 'user:view', matrix)).toBe(true);
      expect(can(ROLE_ADMIN, 'client:manage', matrix)).toBe(false);
      expect(can(ROLE_OWNER, 'client:manage', matrix)).toBe(true);
      expect(result.matrix[ROLE_USER].has('user:view')).toBe(true);
    });

    it('stores only what differs from the default, and says who', async () => {
      await changeCapabilities(db, owner, [
        { role: ROLE_USER, capability: 'user:view', granted: true },
        { role: ROLE_ADMIN, capability: 'user:view', granted: true },
      ]);
      expect(await rows()).toEqual([
        { role: ROLE_USER, capability: 'user:view', granted: 1, by: 'owner-1' },
      ]);
    });

    it('removes the difference when a change goes back to the default', async () => {
      await changeCapabilities(db, owner, [
        { role: ROLE_USER, capability: 'user:view', granted: true },
      ]);
      const back = await changeCapabilities(db, owner, [
        { role: ROLE_USER, capability: 'user:view', granted: false },
      ]);
      expect(back.changed).toBe(1);
      expect(await rows()).toEqual([]);
    });

    it('counts only what really changed, so saving the same thing twice changes nothing', async () => {
      const change = [{ role: ROLE_USER, capability: 'user:view', granted: true }];
      expect((await changeCapabilities(db, owner, change)).changed).toBe(1);
      expect((await changeCapabilities(db, owner, change)).changed).toBe(0);
      expect(await rows()).toHaveLength(1);
    });

    it('takes the last of two changes to the same cell, and an empty list changes nothing', async () => {
      await changeCapabilities(db, owner, [
        { role: ROLE_USER, capability: 'user:view', granted: true },
        { role: ROLE_USER, capability: 'user:view', granted: false },
      ]);
      expect(await rows()).toEqual([]);
      expect((await changeCapabilities(db, owner, [])).changed).toBe(0);
    });

    it('can be put back to the defaults', async () => {
      await changeCapabilities(db, owner, [
        { role: ROLE_USER, capability: 'user:view', granted: true },
        { role: ROLE_ADMIN, capability: 'client:manage', granted: false },
      ]);
      expect((await resetCapabilities(db, owner)).changed).toBe(2);
      expect(await rows()).toEqual([]);
      expect((await loadMatrix(db))[ROLE_ADMIN]).toEqual(DEFAULT_MATRIX[ROLE_ADMIN]);
    });
  });

  describe('refused', () => {
    it.each([
      ['an admin', ROLE_ADMIN],
      ['a user', ROLE_USER],
      ['a role that is not one', 'platform:superuser'],
      ['nobody', undefined],
    ])('when it comes from %s, and nothing is saved', async (_who, role) => {
      const change = [{ role: ROLE_USER, capability: 'user:view', granted: true }];
      expect(await refused(() => changeCapabilities(db, { id: 'x', role }, change))).toBe(
        'forbidden',
      );
      expect(await refused(() => resetCapabilities(db, { id: 'x', role }))).toBe('forbidden');
      expect(await rows()).toEqual([]);
    });

    it.each([
      'instance:configure-secrets',
      'role:assign',
      'capability:configure',
      'ownership:transfer',
    ])(
      'granting %s, which belongs to the owner, to the admin or the user role',
      async (capability) => {
        for (const role of [ROLE_ADMIN, ROLE_USER]) {
          expect(
            await refused(() =>
              changeCapabilities(db, owner, [{ role, capability, granted: true }]),
            ),
          ).toBe('owner-only');
        }
        expect(await rows()).toEqual([]);
      },
    );

    it('editing the owner’s row, which is fixed', async () => {
      expect(
        await refused(() =>
          changeCapabilities(db, owner, [
            { role: ROLE_OWNER, capability: 'user:manage', granted: false },
          ]),
        ),
      ).toBe('owner-fixed');
    });

    it.each([
      [{ role: 'platform:superuser', capability: 'user:view', granted: true }, 'invalid-role'],
      [{ role: undefined, capability: 'user:view', granted: true }, 'invalid-role'],
      [{ role: ROLE_USER, capability: 'made:up', granted: true }, 'unknown-capability'],
      [{ role: ROLE_USER, capability: 'constructor', granted: true }, 'unknown-capability'],
      [{ role: ROLE_USER, capability: 5, granted: true }, 'unknown-capability'],
      [{ role: ROLE_USER, capability: 'user:view', granted: 'yes' }, 'invalid-grant'],
      [{ role: ROLE_USER, capability: 'user:view', granted: 1 }, 'invalid-grant'],
      [{ role: ROLE_USER, capability: 'user:view' }, 'invalid-grant'],
    ])('the change %j', async (change, code) => {
      expect(await refused(() => changeCapabilities(db, owner, [change as CapabilityChange]))).toBe(
        code,
      );
      expect(await rows()).toEqual([]);
    });

    it('a request with one bad change saves none of it, not even the good ones', async () => {
      expect(
        await refused(() =>
          changeCapabilities(db, owner, [
            { role: ROLE_USER, capability: 'user:view', granted: true },
            { role: ROLE_ADMIN, capability: 'role:assign', granted: true },
          ]),
        ),
      ).toBe('owner-only');
      expect(await rows()).toEqual([]);
    });
  });

  describe('a stored row that should not be there', () => {
    const plant = (role: string, capability: string, granted = 1) =>
      db.run(
        'insert into capability_overrides (role, capability, granted, updated_at) values (?, ?, ?, ?)',
        [role, capability, granted, Date.now()],
      );

    it('cannot give an owner-only capability to another role, whoever wrote it', async () => {
      await plant(ROLE_ADMIN, 'role:assign');
      await plant(ROLE_USER, 'instance:configure-secrets');
      const matrix = await loadMatrix(db);
      expect(can(ROLE_ADMIN, 'role:assign', matrix)).toBe(false);
      expect(can(ROLE_USER, 'instance:configure-secrets', matrix)).toBe(false);
    });

    it('cannot take anything from the owner, or add a role, or a capability', async () => {
      await plant(ROLE_OWNER, 'user:manage', 0);
      await plant('platform:superuser', 'user:manage');
      await plant(ROLE_ADMIN, 'made:up');
      const matrix = await loadMatrix(db);
      expect(can(ROLE_OWNER, 'user:manage', matrix)).toBe(true);
      expect(can('platform:superuser', 'user:manage', matrix)).toBe(false);
      expect(matrix[ROLE_ADMIN]).toEqual(DEFAULT_MATRIX[ROLE_ADMIN]);
    });

    it('is found by the next real change, which judges the result by the matrix and not the table', async () => {
      await plant(ROLE_ADMIN, 'role:assign');
      const result = await changeCapabilities(db, owner, [
        { role: ROLE_USER, capability: 'user:view', granted: true },
      ]);
      expect(result.changed).toBe(1);
      expect(result.matrix[ROLE_ADMIN].has('role:assign')).toBe(false);
    });
  });
}
