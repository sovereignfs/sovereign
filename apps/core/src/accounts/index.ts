import { getDatabase } from '../database';
import { getAuth } from '../auth';
import { revokeOnDeactivation } from '../oauth/logout';
import { getEmailService } from '../mail';
import { sendLogoutNotices } from '../oauth/logout';
import { AccountManager } from './manage';
import { AccountStates } from './states';

export { AccountStateError, AccountStates } from './states';
export {
  AccountActionError,
  AccountManager,
  getAccount,
  listAccounts,
  PAGE_SIZE,
  type AccountDetail,
  type AccountPage,
  type AccountSummary,
} from './manage';
export type {
  AfterDeactivation,
  DeactivationPreparation,
  DeactivationResult,
  DeactivationStep,
} from './states';

let opened: Promise<AccountStates> | undefined;

/** Core's account states, for the life of the process, so steps added to it by other features are kept. */
export function getAccountStates(): Promise<AccountStates> {
  opened ??= getDatabase()
    .then((database) => {
      const states = new AccountStates(database);
      // Deactivating an account takes back what apps hold for it, and tells them (core-app §3.6.3).
      revokeOnDeactivation(states, getAuth);
      return states;
    })
    .catch((error: unknown) => {
      opened = undefined;
      throw error;
    });
  return opened;
}

let manager: Promise<AccountManager> | undefined;

/**
 * What an operator does to another account, for the life of the process: deactivating and deleting tell the
 * apps that registered a back-channel logout address, and resetting two-factor sign-in emails the holder.
 */
export function getAccountManager(): Promise<AccountManager> {
  manager ??= Promise.all([getDatabase(), getAccountStates()])
    .then(
      ([database, states]) =>
        new AccountManager(database, states, {
          logoutNotices: async (notices) => sendLogoutNotices(await getAuth(), notices),
          mfaReset: async (to) => {
            const emails = await getEmailService();
            await emails.send(to.email, { template: 'mfaReset', link: emails.link('/sign-in') });
            return true;
          },
        }),
    )
    .catch((error: unknown) => {
      manager = undefined;
      throw error;
    });
  return manager;
}
