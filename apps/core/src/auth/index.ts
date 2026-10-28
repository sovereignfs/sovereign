import { getConfig } from '../config';
import { getDatabase } from '../database';
import { getSettings } from '../settings';
import { createAuth, type Auth } from './auth';
import { registrationFrom } from './registration';
import { resolveAuthSettings } from './settings';

export { createAuth, type Auth } from './auth';
export { isFirstAccount, registrationFrom, type RegistrationPolicy } from './registration';
export { resolveAuthSettings, type AuthSettings } from './settings';

/** The authentication settings, from the environment. Throws a `ConfigError` naming what is wrong. */
export function getAuthSettings() {
  return resolveAuthSettings(getConfig());
}

let opened: Promise<Auth> | undefined;

/** Core's better-auth instance, for the life of the process. */
export function getAuth(): Promise<Auth> {
  opened ??= Promise.all([getDatabase(), getSettings()])
    .then(([database, settings]) =>
      createAuth(database, getAuthSettings(), registrationFrom(settings)),
    )
    .catch((error: unknown) => {
      opened = undefined;
      throw error;
    });
  return opened;
}
