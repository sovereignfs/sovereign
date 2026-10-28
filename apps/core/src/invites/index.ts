import type { Executor } from '@sovereignfs/database';

/** The form an address is stored and compared in: better-auth stores accounts the same way. */
export const normalizeEmail = (email: string): string => email.trim().toLowerCase();

/**
 * Whether the address has an invite that can still be used: not used, not cancelled, not past its
 * expiry. An invite without an expiry never expires.
 */
export async function hasValidInvite(
  executor: Executor,
  email: string,
  now: number,
): Promise<boolean> {
  const { rows } = await executor.run(
    `select 1 as found from invites
       where email = ? and accepted_at is null and cancelled_at is null
         and (expires_at is null or expires_at > ?)
       limit 1`,
    [normalizeEmail(email), now],
  );
  return rows.length > 0;
}

/** Marks every open invite for the address as used, once the account exists. */
export async function markInvitesAccepted(
  executor: Executor,
  email: string,
  now: number,
): Promise<void> {
  await executor.run(
    `update invites set accepted_at = ? where email = ? and accepted_at is null and cancelled_at is null`,
    [now, normalizeEmail(email)],
  );
}
