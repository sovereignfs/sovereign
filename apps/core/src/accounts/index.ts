import { getDatabase } from '../database';
import { getAuth } from '../auth';
import { revokeOnDeactivation } from '../oauth/logout';
import { AccountStates } from './states';

export { AccountStateError, AccountStates } from './states';
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
