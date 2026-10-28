/**
 * The browser's time zone, checked before it is stored (core-app §3.3.2). A zone is an IANA name
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
