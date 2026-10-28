import type { Database } from '@sovereignfs/database';
import { isRole, ROLE_ADMIN, ROLE_OWNER, ROLE_USER, type Role } from '../auth/roles';
import { can } from './capabilities';

/**
 * Whether someone in `actor`'s role may act on an account in `target`'s role: change its role,
 * deactivate it, delete it, reset its MFA (core-app §3.2.1). Only the owner acts on an operator;
 * an admin acts on ordinary accounts only; an ordinary account acts on no one. Fails closed on a
 * role that is not known.
 *
 * This is the rule on the *other* account. Whether the actor may do the thing at all is a capability.
 */
export function mayActOn(actor: unknown, target: unknown): boolean {
  if (!isRole(actor) || !isRole(target)) return false;
  if (actor === ROLE_OWNER) return true;
  if (actor === ROLE_ADMIN) return target === ROLE_USER;
  return false;
}

export type RoleChangeErrorCode =
  'forbidden' | 'not-found' | 'invalid-role' | 'owner-fixed' | 'ownership';

export class RoleChangeError extends Error {
  override name = 'RoleChangeError';

  constructor(
    readonly code: RoleChangeErrorCode,
    message: string,
  ) {
    super(message);
  }
}

/**
 * Changes an account's role between admin and user (core-app §3.2.1). Only the owner may (the
 * `role:assign` capability), and the invariants hold whatever is asked:
 *
 * - **There is exactly one owner.** Nobody is made the owner here, and the owner's role cannot be
 *   changed: ownership moves only by transfer, which swaps two accounts in one step.
 * - A role must be one of the known ones.
 *
 * It takes effect at once on core's own pages, which read the role from the database.
 */
export async function changeRole(
  database: Database,
  actor: { id: string; role: unknown },
  targetId: string,
  role: unknown,
): Promise<{ changed: boolean }> {
  if (!can(actor.role, 'role:assign')) {
    throw new RoleChangeError('forbidden', 'Only the owner can change a role.');
  }
  if (role === ROLE_OWNER) {
    throw new RoleChangeError('ownership', 'Ownership moves by transfer, not by changing a role.');
  }
  if (role !== ROLE_ADMIN && role !== ROLE_USER) {
    throw new RoleChangeError('invalid-role', 'That is not a role an account can be given.');
  }
  const next: Role = role;
  return database.transaction(async (transaction) => {
    const { rows } = await transaction.run('select role from users where id = ?', [targetId]);
    const target = rows[0];
    if (!target) throw new RoleChangeError('not-found', 'There is no such account.');
    if (target.role === ROLE_OWNER) {
      throw new RoleChangeError('owner-fixed', "The owner's role cannot be changed.");
    }
    if (target.role === next) return { changed: false };
    const now = database.family === 'postgres' ? new Date() : Date.now();
    await transaction.run('update users set role = ?, updated_at = ? where id = ? and role <> ?', [
      next,
      now,
      targetId,
      ROLE_OWNER,
    ]);
    return { changed: true };
  });
}

export { ROLE_ADMIN, ROLE_OWNER, ROLE_USER };
