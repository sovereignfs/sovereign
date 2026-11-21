/**
 * `@sovereignfs/auth` — what runs anywhere (auth.md §2): on a server, in a browser, on the Edge. It imports nothing, so an app's
 * proxy can read the cookie names and a page can check a password against the policy before it derives the sign-in value.
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
} from './cookies.js';
export {
  describePasswordPolicy,
  MAX_PASSWORD_LENGTH,
  newPasswordProblem,
  PAGE_NOT_READY,
  passwordPolicyMessage,
  passwordProblems,
  type PasswordPolicy,
} from './password-policy.js';
export { safeReturnTo, withReturnTo } from './return-to.js';
export { canonicalLocale, canonicalTimezone } from './canonical.js';
