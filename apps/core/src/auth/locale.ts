import { APIError } from 'better-auth/api';

/**
 * A person's language and region as a BCP 47 tag, such as `en-GB` or `de-DE`, which is what the
 * `locale` claim carries (core-app §3.6.2). What is stored is the canonical spelling, so `en-gb` is
 * kept as `en-GB`. A tag has to be one the platform's own rules accept, a single tag rather than a
 * list, and not the "undetermined" language: it would say nothing.
 */
const TAG = /^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8}){0,6}$/;

/** The canonical tag for `value`, or `undefined` when it is not a language tag. */
export function canonicalLocale(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.length === 0 || value.length > 35 || !TAG.test(value)) {
    return undefined;
  }
  try {
    const [tag] = Intl.getCanonicalLocales(value);
    return tag === undefined || tag === 'und' || tag.startsWith('und-') ? undefined : tag;
  } catch {
    return undefined;
  }
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
