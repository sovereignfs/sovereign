/**
 * A day for people, as a list in the browser shows it: "21 Nov 2026", in the person's own zone (UTC until they set one, or for a zone
 * this runtime does not know). Never in the runtime's own language or zone: a client component is rendered on the server first, whose
 * language and zone are not the browser's, and the two must write the same text or React throws the server's page away (error #418).
 */
export function writtenDate(at: string | number, timeZone: string | null | undefined): string {
  const format = (zone: string) =>
    new Intl.DateTimeFormat('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      timeZone: zone,
    }).format(new Date(at));
  try {
    return format(timeZone || 'UTC');
  } catch {
    return format('UTC');
  }
}
