/**
 * The shape of a sign-in value (core-app §5.2): `svp`, the derivation's version, a dot, and 43 base64url characters, which are 32
 * bytes. The server checks this and nothing else, since it never sees the password the value was made from.
 *
 * Shared by both entry points: it imports nothing, so a browser and the server agree on it.
 */
const SIGN_IN_VALUE = /^svp([1-9][0-9]{0,3})\.[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/;

/** The derivation version a sign-in value names, or `undefined` when it is not a sign-in value. */
export function signInValueVersion(value: unknown): number | undefined {
  if (typeof value !== 'string') return undefined;
  const match = SIGN_IN_VALUE.exec(value);
  return match ? Number(match[1]) : undefined;
}

/** Whether `value` has the shape of a sign-in value. */
export const isSignInValue = (value: unknown): value is string =>
  signInValueVersion(value) !== undefined;
