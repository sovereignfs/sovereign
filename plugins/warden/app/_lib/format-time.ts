/**
 * "3 minutes ago" / "2 days ago" for a past instant, in the viewer's locale
 * via `Intl.RelativeTimeFormat`. Zero imports — used by client components.
 * `now` is a parameter so tests (and a server render) are deterministic.
 */
export function formatRelativeTime(epochMs: number, now: number = Date.now()): string {
  const elapsedSeconds = Math.max(0, Math.round((now - epochMs) / 1000));
  const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
  if (elapsedSeconds < 45) return 'just now';
  const minutes = Math.round(elapsedSeconds / 60);
  if (minutes < 60) return formatter.format(-minutes, 'minute');
  const hours = Math.round(minutes / 60);
  if (hours < 24) return formatter.format(-hours, 'hour');
  const days = Math.round(hours / 24);
  if (days < 30) return formatter.format(-days, 'day');
  const months = Math.round(days / 30);
  if (months < 12) return formatter.format(-months, 'month');
  return formatter.format(-Math.round(months / 12), 'year');
}
