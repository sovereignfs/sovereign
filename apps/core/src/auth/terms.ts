import { APIError } from 'better-auth/api';
import { legalVersion } from '../legal/version';
import { canonicalTimezone } from './timezone';

/**
 * What sign-up must carry besides the person's details (core-app §3.3.2, §3.3.5): that the terms were
 * accepted, and, if the browser gave one, a real time zone. Both are checked here, on the server,
 * whatever the page did. The acceptance is recorded with the account, with the time and the version
 * of the text, all set here: a request can say it agrees but never which version, so nobody can claim
 * to have accepted a text they were not shown.
 */
export function signUpRecord(user: Record<string, unknown>, now = new Date()) {
  if (user.agreedToTerms !== true) {
    throw new APIError('BAD_REQUEST', {
      message: 'You must accept the Terms of Service and the Privacy Policy to create an account.',
      code: 'TERMS_NOT_ACCEPTED',
    });
  }
  return {
    agreedToTerms: true,
    termsAcceptedAt: now,
    termsVersion: legalVersion,
    timezone: timezoneOrNull(user.timezone),
  };
}

/** A time zone to store, in its canonical spelling, or nothing when none was given. Refuses a bad one. */
export function timezoneOrNull(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  const zone = canonicalTimezone(value);
  if (zone === undefined) {
    throw new APIError('BAD_REQUEST', {
      message: 'The time zone is not one of the standard time zone names, such as Europe/London.',
      code: 'INVALID_TIMEZONE',
    });
  }
  return zone;
}
