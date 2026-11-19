import { APIError } from 'better-auth/api';
import { canonicalLocale, canonicalTimezone } from '../canonical.js';

/** The longest name kept, in characters. */
export const MAX_NAME_LENGTH = 100;

// eslint-disable-next-line no-control-regex -- control characters are exactly what is refused
const CONTROL = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/;

/**
 * A person's name as it will be stored: trimmed, 1 to 100 characters, with no line breaks or other
 * control characters (it appears in email subjects and in pages). Refused with a code the page can act
 * on, on every path that sets one: sign-up and an update of the account (auth.md §4, rule 7).
 */
export function cleanName(value: unknown): string {
  const name = typeof value === 'string' ? value.trim() : '';
  if (name === '' || name.length > MAX_NAME_LENGTH || CONTROL.test(name)) {
    throw new APIError('BAD_REQUEST', {
      message: `A name is 1 to ${MAX_NAME_LENGTH} characters, with no line breaks.`,
      code: 'INVALID_NAME',
    });
  }
  return name;
}

/** A request may not set the picture's address: only the app does, when a picture is uploaded (auth.md §4, rule 17). */
export function refuseImageInput(): never {
  throw new APIError('BAD_REQUEST', {
    message: 'A picture is set by uploading it on the profile page.',
    code: 'FIELD_NOT_ALLOWED',
  });
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

/** A locale to store, in its canonical spelling, or nothing when none was given. Refuses a bad one. */
export function localeOrNull(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  const tag = canonicalLocale(value);
  if (tag === undefined) {
    throw new APIError('BAD_REQUEST', {
      message: 'The language is not a language tag, such as en-GB or de-DE.',
      code: 'INVALID_LOCALE',
    });
  }
  return tag;
}
