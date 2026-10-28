import type { Database } from '@sovereignfs/database';
import { isRole, ROLE_ADMIN, ROLE_OWNER, ROLE_USER } from '../auth/roles';
import {
  CAPABILITIES,
  DEFAULT_MATRIX,
  can,
  type Capability,
  type EditableRole,
  type Matrix,
} from './capabilities';
import { applyOverrides, invalidateCapabilityMatrix, loadMatrix, readOverrides } from './matrix';

export type CapabilityChange = { role: unknown; capability: unknown; granted: unknown };

export type CapabilityChangeErrorCode =
  | 'forbidden'
  | 'owner-fixed'
  | 'invalid-role'
  | 'unknown-capability'
  | 'owner-only'
  | 'invalid-grant';

export class CapabilityChangeError extends Error {
  override name = 'CapabilityChangeError';

  constructor(
    readonly code: CapabilityChangeErrorCode,
    message: string,
  ) {
    super(message);
  }
}

type Checked = { role: EditableRole; capability: Capability; granted: boolean };

/** One requested change, or the reason it is refused. Nothing here reads the database. */
function check(change: CapabilityChange): Checked {
  const { role, capability, granted } = change;
  if (role === ROLE_OWNER) {
    throw new CapabilityChangeError(
      'owner-fixed',
      'The owner always holds every capability; that row cannot be edited.',
    );
  }
  if (role !== ROLE_ADMIN && role !== ROLE_USER) {
    throw new CapabilityChangeError(
      'invalid-role',
      isRole(role) ? 'That role cannot be edited.' : 'That is not a role.',
    );
  }
  if (typeof capability !== 'string' || !Object.hasOwn(CAPABILITIES, capability)) {
    throw new CapabilityChangeError('unknown-capability', 'That is not a capability.');
  }
  const known = capability as Capability;
  if (CAPABILITIES[known].ownerOnly) {
    throw new CapabilityChangeError(
      'owner-only',
      'That capability belongs to the owner and cannot be given to another role.',
    );
  }
  if (typeof granted !== 'boolean') {
    throw new CapabilityChangeError('invalid-grant', 'A capability is either given or taken away.');
  }
  return { role, capability: known, granted };
}

/**
 * Changes what the admin and user roles may do (core-app §3.2.3), all together or not at all. Only the
 * owner may (`capability:configure`), and whatever is asked:
 *
 * - **The owner's row is fixed**: the owner holds every capability, and nobody can edit that away.
 * - **An owner-only capability is never given to another role**: asking is refused, not ignored, and
 *   one refused change in a request means no change is saved.
 * - A change that only restates the default removes the stored difference rather than keeping a row, so
 *   the matrix nobody edited has no rows and a capability added to the code later reaches everyone as
 *   its default says.
 *
 * It takes effect at once on this instance, and within the matrix cache on others; core's checks read
 * the matrix from the database, not from the session cookie.
 */
export async function changeCapabilities(
  database: Database,
  actor: { id: string; role: unknown },
  changes: readonly CapabilityChange[],
  now: number = Date.now(),
): Promise<{ changed: number; matrix: Matrix }> {
  if (!can(actor.role, 'capability:configure')) {
    throw new CapabilityChangeError(
      'forbidden',
      'Only the owner can change the capability matrix.',
    );
  }
  // Everything is checked before anything is written; a later change to the same cell wins.
  const cells = new Map<string, Checked>();
  for (const change of changes) {
    const checked = check(change);
    cells.set(`${checked.role}\n${checked.capability}`, checked);
  }

  const result = await database.transaction(async (transaction) => {
    const before = await loadMatrix(transaction);
    for (const { role, capability, granted } of cells.values()) {
      if (DEFAULT_MATRIX[role].has(capability) === granted) {
        await transaction.run(
          'delete from capability_overrides where role = ? and capability = ?',
          [role, capability],
        );
      } else {
        await transaction.run(
          `insert into capability_overrides (role, capability, granted, updated_at, updated_by)
           values (?, ?, ?, ?, ?)
           on conflict (role, capability) do update set granted = excluded.granted,
             updated_at = excluded.updated_at, updated_by = excluded.updated_by`,
          [role, capability, granted ? 1 : 0, now, actor.id],
        );
      }
    }
    const after = applyOverrides(DEFAULT_MATRIX, await readOverrides(transaction));
    return { changed: differences(before, after), matrix: after };
  });
  invalidateCapabilityMatrix();
  return result;
}

/** Puts the admin and user rows back to the defaults in code, which is what having no rows means. */
export async function resetCapabilities(
  database: Database,
  actor: { id: string; role: unknown },
): Promise<{ changed: number; matrix: Matrix }> {
  if (!can(actor.role, 'capability:configure')) {
    throw new CapabilityChangeError(
      'forbidden',
      'Only the owner can change the capability matrix.',
    );
  }
  const result = await database.transaction(async (transaction) => {
    const before = await loadMatrix(transaction);
    await transaction.run('delete from capability_overrides');
    return { changed: differences(before, DEFAULT_MATRIX), matrix: DEFAULT_MATRIX };
  });
  invalidateCapabilityMatrix();
  return result;
}

/** How many capabilities, over both rows, are held in one matrix and not the other. */
function differences(a: Matrix, b: Matrix): number {
  let count = 0;
  for (const role of [ROLE_ADMIN, ROLE_USER] as const) {
    for (const capability of Object.keys(CAPABILITIES) as Capability[]) {
      if (a[role].has(capability) !== b[role].has(capability)) count += 1;
    }
  }
  return count;
}
