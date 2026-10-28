import { getDatabase } from '../database';
import { AccountStates } from './states';

export { AccountStateError, AccountStates } from './states';
export type { AfterDeactivation, DeactivationResult, DeactivationStep } from './states';

let opened: Promise<AccountStates> | undefined;

/** Core's account states, for the life of the process, so steps added to it by other features are kept. */
export function getAccountStates(): Promise<AccountStates> {
  opened ??= getDatabase()
    .then((database) => new AccountStates(database))
    .catch((error: unknown) => {
      opened = undefined;
      throw error;
    });
  return opened;
}
