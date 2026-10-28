import { APIError } from 'better-auth/api';

/**
 * What a person must satisfy before any way of signing in may open a session for them, beyond proving
 * who they are. Password sign-in has some of these checks inside better-auth; every session is also
 * checked here, in the hook on creating one, so no way of signing in (a passkey, the second step, a
 * verification link, the provider's own sign-in later) can be a way round them.
 */
export function assertMayOpenSession(
  user: { emailVerified: boolean; deactivatedAt?: Date | string | number | null },
  rules: { requireEmailVerification: boolean },
): void {
  // First: a deactivated account is refused whatever else is true of it (core-app §3.3.6).
  if (user.deactivatedAt !== null && user.deactivatedAt !== undefined) {
    throw new APIError('FORBIDDEN', {
      message: 'This account has been deactivated. Ask whoever runs this instance.',
      code: 'ACCOUNT_DEACTIVATED',
    });
  }
  if (rules.requireEmailVerification && !user.emailVerified) {
    throw new APIError('FORBIDDEN', {
      message: 'Verify your email address before signing in.',
      code: 'EMAIL_NOT_VERIFIED',
    });
  }
}
