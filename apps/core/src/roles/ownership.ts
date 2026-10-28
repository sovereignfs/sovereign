import type { Database } from '@sovereignfs/database';
import type { PasswordCheck } from '../auth/confirm-password';
import { ROLE_ADMIN, ROLE_OWNER, ROLE_USER } from '../auth/roles';
import { can } from './capabilities';

export type OwnershipTransferErrorCode =
  | 'forbidden'
  | 'invalid-role'
  | 'self'
  | 'wrong-password'
  | 'limited'
  | 'not-owner'
  | 'not-an-admin';

export class OwnershipTransferError extends Error {
  override name = 'OwnershipTransferError';

  constructor(
    readonly code: OwnershipTransferErrorCode,
    message: string,
  ) {
    super(message);
  }
}

export type OwnershipTransferRequest = {
  /** The admin who becomes the owner. */
  targetId: unknown;
  /** What the previous owner becomes: `platform:admin` when not said, or `platform:user`. */
  newRole?: unknown;
  /** The previous owner's password, asked for again. */
  password: unknown;
};

/**
 * Hands the instance to an admin (core-app §3.2.1). Only the owner may (`ownership:transfer`), they
 * must give their password again, and:
 *
 * - **The new owner is an existing, active `platform:admin`**, and not the owner themselves.
 * - **The previous owner chooses what they become**: `platform:admin`, or `platform:user`.
 * - **There is never no owner and never two.** The two changes are one transaction, and each is
 *   conditional on what it expects to find: the previous owner is demoted only if they are still the
 *   owner, and the new owner promoted only if they are still an active admin. Two transfers at once,
 *   or a transfer racing a role change or a deactivation, cannot both win: the loser finds the
 *   account no longer as it was and changes nothing. The single-owner unique index is the last guard.
 *
 * Roles are read from the database for what core guards, so capabilities follow the roles at once.
 * `confirm` asks for the password; it is a parameter so the function holds no session or auth of its own.
 */
export async function transferOwnership(
  database: Database,
  actor: { id: string; role: unknown },
  request: OwnershipTransferRequest,
  confirm: (userId: string, password: string) => Promise<PasswordCheck>,
): Promise<{ newOwnerId: string; previousOwnerRole: string }> {
  if (!can(actor.role, 'ownership:transfer')) {
    throw new OwnershipTransferError('forbidden', 'Only the owner can transfer ownership.');
  }
  const targetId = request.targetId;
  if (typeof targetId !== 'string' || targetId === '') {
    throw new OwnershipTransferError('not-an-admin', 'Ownership goes to an existing admin.');
  }
  if (targetId === actor.id) {
    throw new OwnershipTransferError('self', 'You already own this instance.');
  }
  const newRole = request.newRole ?? ROLE_ADMIN;
  if (newRole !== ROLE_ADMIN && newRole !== ROLE_USER) {
    throw new OwnershipTransferError(
      'invalid-role',
      'The previous owner becomes an admin or an ordinary account.',
    );
  }
  const password = typeof request.password === 'string' ? request.password : '';
  const check = await confirm(actor.id, password);
  if (check === 'limited') {
    throw new OwnershipTransferError(
      'limited',
      'Too many wrong passwords. Wait a few minutes, then try again.',
    );
  }
  if (check !== 'ok') {
    throw new OwnershipTransferError('wrong-password', 'That password is not right.');
  }

  const now = database.family === 'postgres' ? new Date() : Date.now();
  await database.transaction(async (transaction) => {
    // Demote first, so the single-owner index is never asked to hold two. Zero owners exists only
    // inside this transaction, which nobody else can see.
    const demoted = await transaction.run(
      'update users set role = ?, updated_at = ? where id = ? and role = ?',
      [newRole, now, actor.id, ROLE_OWNER],
    );
    if (demoted.rowsAffected !== 1) {
      throw new OwnershipTransferError('not-owner', 'You no longer own this instance.');
    }
    const promoted = await transaction.run(
      `update users set role = ?, updated_at = ? where id = ? and role = ? and deactivated_at is null`,
      [ROLE_OWNER, now, targetId, ROLE_ADMIN],
    );
    if (promoted.rowsAffected !== 1) {
      // Throwing rolls the demotion back.
      throw new OwnershipTransferError(
        'not-an-admin',
        'Ownership goes to an existing, active admin.',
      );
    }
  });
  return { newOwnerId: targetId, previousOwnerRole: newRole };
}
