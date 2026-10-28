import { getDatabase } from '../database';
import { getEmailService, getMailService } from '../mail';
import { getSettings } from '../settings';
import { createAuth, type Auth } from './auth';
import { authMailFrom } from './mail';
import { registrationFrom } from './registration';
import { getAuthSettings } from './settings';

export { createAuth, type Auth, type AuthDependencies } from './auth';
export { isFirstAccount, registrationFrom, type RegistrationPolicy } from './registration';
export { getAuthSettings, resolveAuthSettings, type AuthSettings } from './settings';

let opened: Promise<Auth> | undefined;

/** Core's better-auth instance, for the life of the process. */
export function getAuth(): Promise<Auth> {
  opened ??= Promise.all([getDatabase(), getSettings(), getEmailService(), getMailService()])
    .then(([database, settings, emails, mail]) =>
      createAuth(database, getAuthSettings(), {
        registration: registrationFrom(settings),
        mail: authMailFrom(emails, mail),
      }),
    )
    .catch((error: unknown) => {
      opened = undefined;
      throw error;
    });
  return opened;
}
