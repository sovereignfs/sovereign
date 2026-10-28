import { APIError } from 'better-auth/api';

/**
 * What a person must satisfy before any way of signing in may open a session for them, beyond proving
 * who they are. Password sign-in has these checks inside better-auth; every other way (a passkey now,
 * the provider's own sign-in later) calls this, so none can be a way round them.
 */
export function assertMayOpenSession(
  user: { emailVerified: boolean },
  rules: { requireEmailVerification: boolean },
): void {
  if (rules.requireEmailVerification && !user.emailVerified) {
    throw new APIError('FORBIDDEN', {
      message: 'Verify your email address before signing in.',
      code: 'EMAIL_NOT_VERIFIED',
    });
  }
}
