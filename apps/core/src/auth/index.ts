import { getConfig } from '../config';
import { getDatabase } from '../database';
import { createAuth, type Auth } from './auth';
import { resolveAuthSettings } from './settings';

export { createAuth, type Auth } from './auth';
export { resolveAuthSettings, type AuthSettings } from './settings';

/** The authentication settings, from the environment. Throws a `ConfigError` naming what is wrong. */
export function getAuthSettings() {
  return resolveAuthSettings(getConfig());
}

let opened: Promise<Auth> | undefined;

/** Core's better-auth instance, for the life of the process. */
export function getAuth(): Promise<Auth> {
  opened ??= getDatabase()
    .then((database) => createAuth(database, getAuthSettings()))
    .catch((error: unknown) => {
      opened = undefined;
      throw error;
    });
  return opened;
}
