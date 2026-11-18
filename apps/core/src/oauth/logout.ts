import type { Database } from '@sovereignfs/database';
import type { AccountStates } from '../accounts/states';
import type { Auth } from '../auth/auth';
import { deliverDueLogoutNotices, planLogoutNotices, queueLogoutNotices } from './logout-notices';
import { revokeAllTokens } from './revocation';

/**
 * What deactivating an account does to the apps (core-app §3.6.3, §3.6.5), in the transaction that ends its sessions: every access
 * token and refresh token is revoked (offline ones too), and a logout notice is written for each app and session, read before the
 * sessions go. Once the deactivation has been committed, what is due is sent (`logout-notices.ts`).
 */
export function revokeOnDeactivation(
  states: AccountStates,
  database: () => Promise<Database>,
  auth: () => Promise<Auth>,
): void {
  states.addPreparation(async (tx, userId) => {
    const notices = await planLogoutNotices(tx, { userId });
    if (notices.length === 0) return undefined;
    await queueLogoutNotices(tx, notices);
    return async () => {
      await deliverDueLogoutNotices(await database(), await auth());
    };
  });
  states.addStep(async (tx, userId, at) => {
    await revokeAllTokens(tx, at, userId);
  });
}
