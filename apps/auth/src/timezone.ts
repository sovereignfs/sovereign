/**
 * IANA timezone helpers for the auth server.
 *
 * The auth app intentionally does not depend on `packages/db` or the runtime
 * (see apps/auth/src/db.ts), so this mirrors the runtime's `isValidTimezone`
 * (runtime/src/account.ts) locally. The registration flow captures the browser's
 * timezone as a better-auth additionalField; the value is validated here before
 * it is ever persisted, so the session can only ever carry a real IANA zone.
 */

/** Whether `tz` is a valid IANA timezone identifier (via the Intl database). */
export function isValidTimezone(tz: unknown): tz is string {
  if (typeof tz !== 'string' || tz.length === 0) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}
