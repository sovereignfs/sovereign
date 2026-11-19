/**
 * The browser's time zone, checked before it is stored (core-app §3.3.2, auth.md §4 rule 7). A zone is an IANA name
 * such as `Europe/London`; what is stored is the canonical spelling, so `europe/london` is kept as
 * `Europe/London`. A fixed offset (`+05:30`) is not a zone and is refused, as is anything that is
 * not plain text of a sensible length.
 */
const NAME = /^[A-Za-z][A-Za-z0-9_+-]*(?:\/[A-Za-z0-9_+-]+)*$/;

/** The canonical IANA name for `value`, or `undefined` when it is not a time zone. */
export function canonicalTimezone(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.length === 0 || value.length > 64 || !NAME.test(value)) {
    return undefined;
  }
  try {
    return new Intl.DateTimeFormat('en-US', { timeZone: value }).resolvedOptions().timeZone;
  } catch {
    return undefined;
  }
}

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
