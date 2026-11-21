import { resolveAuthSettings as resolve, type AuthSettings } from '@sovereignfs/auth/server';
import { getConfig, type CoreConfig } from '../config';

export type { AuthSettings };

/**
 * The authentication settings, from the environment, checked together (auth.md §5): the sign-in package's resolver, with
 * core's prefix and name. Every problem is reported at once and none shows a value.
 */
export function resolveAuthSettings(config: CoreConfig, prefix = 'SV'): AuthSettings {
  return resolve(config, { prefix, appName: 'Sovereign', self: 'core' });
}

/**
 * The authentication settings, from the environment. Throws a `ConfigError` naming what is wrong.
 * Here, not with `getAuth`, so a page that only needs the password rules does not load better-auth.
 */
export function getAuthSettings(): AuthSettings {
  return resolveAuthSettings(getConfig());
}
