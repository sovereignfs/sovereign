/**
 * `@sovereignfs/auth/server` — the sign-in on the app's server (auth.md §2): the better-auth preset, the session helpers, the
 * checks every account and session passes, and the account tables.
 */
export {
  createAuthPreset,
  SECOND_STEP,
  SESSION_LIFETIME,
  type AuthPresetHooks,
  type AuthPresetOptions,
  type RequestContext,
} from './preset.js';
export {
  resolveAuthSettings,
  type AuthConfigValues,
  type AuthSettings,
  type ResolveAuthOptions,
} from './settings.js';
export type { AuthMail, Recipient } from './mail.js';
export { assertMayOpenSession } from './session-gate.js';
export {
  CONFIRM_LIMIT,
  confirmPassword,
  type PasswordCheck,
  type PasswordVerifier,
} from './confirm-password.js';
export {
  cleanName,
  localeOrNull,
  MAX_NAME_LENGTH,
  refuseImageInput,
  timezoneOrNull,
} from './validators.js';
export { describeAddress, describeDevice } from './device.js';
export {
  endOtherSessions,
  endSession,
  listSessions,
  type SessionEndpoints,
  type SessionSummary,
} from './sessions.js';
export {
  checkSession,
  readSession,
  readSessionUnchecked,
  type SessionOf,
  type SessionReader,
} from './session.js';
