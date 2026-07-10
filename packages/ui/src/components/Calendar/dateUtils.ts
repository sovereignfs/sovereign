// Plain-Date helpers for Calendar — deliberately self-contained (no date
// library dependency, matching @sovereignfs/ui's zero-extra-dependency
// philosophy). Every function operates on local calendar dates only; there is
// no timezone or time-of-day handling here — Calendar is date-only (decision
// D6 in the mobile design-system plan). Time and range selection are future
// scope.

export function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

export function addMonths(date: Date, count: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + count, date.getDate());
}

export function addDays(date: Date, count: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + count);
}

export function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function isSameMonth(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
}

export function isBeforeDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() < b.getFullYear() ||
    (a.getFullYear() === b.getFullYear() &&
      (a.getMonth() < b.getMonth() || (a.getMonth() === b.getMonth() && a.getDate() < b.getDate())))
  );
}

export function isAfterDay(a: Date, b: Date): boolean {
  return isBeforeDay(b, a);
}

export function isWithinRange(date: Date, min?: Date, max?: Date): boolean {
  if (min && isBeforeDay(date, min)) return false;
  if (max && isAfterDay(date, max)) return false;
  return true;
}

/**
 * A 6x7 grid of dates covering `month` (any date within the target month),
 * padded with the trailing days of the previous month and the leading days
 * of the next so every week is a full row — Sunday-first. 6 rows always
 * (rather than the 4-6 a month strictly needs) so the grid's own height never
 * changes as the displayed month changes, avoiding a layout jump.
 */
export function getMonthGrid(month: Date): Date[][] {
  const first = startOfMonth(month);
  const startOffset = first.getDay(); // 0 (Sun) .. 6 (Sat)
  const gridStart = addDays(first, -startOffset);

  const weeks: Date[][] = [];
  for (let week = 0; week < 6; week++) {
    const days: Date[] = [];
    for (let day = 0; day < 7; day++) {
      days.push(addDays(gridStart, week * 7 + day));
    }
    weeks.push(days);
  }
  return weeks;
}

export function formatMonthYear(date: Date): string {
  return new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' }).format(date);
}

export function formatWeekdayShort(date: Date): string {
  return new Intl.DateTimeFormat(undefined, { weekday: 'short' }).format(date);
}

/** Compact form for a trigger/field display — e.g. "Jan 15, 2026". */
export function formatDateShort(date: Date): string {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date);
}

export function formatDateLabel(date: Date): string {
  return new Intl.DateTimeFormat(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(date);
}
