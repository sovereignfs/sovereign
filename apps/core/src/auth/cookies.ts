/**
 * Core's cookies. The sign-in cookies' names are the sign-in package's (`@sovereignfs/auth`, auth.md §4 rule 10), re-exported here so
 * core names them in one place; the device cookie of the lock is core's own.
 *
 * No imports but the package's root, which has none of its own, because the proxy runs on the Edge and reads this too.
 */
export {
  advancedCookieOptions,
  cookieName,
  namePrefix,
  removalAttributes,
  sessionCacheCookieNames,
  sessionCookieName,
  type CookiePolicy,
  type NamePrefix,
} from '@sovereignfs/auth';

/**
 * The cookie that names this browser for a person's lock (RFC 0006 B1, `src/lock/device.ts`): a random id that says nothing of the person.
 * `__Host-` over https, as the session cookie is, so no other host can set it.
 */
export const deviceCookieName = (secure: boolean): string =>
  secure ? '__Host-sv_device' : 'sv_device';
