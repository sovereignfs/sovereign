/**
 * The pure parts of the range picker: `YYYY-MM-DD` in and out, the nights between two dates, and what a pick does to a range. A date here is the calendar date a person means,
 * with no time and no zone, so it is read and written as its parts and never through a time zone (`new Date('2026-05-10')` is UTC midnight, which is the 9th in some places).
 */
const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;

/** A real calendar date for `YYYY-MM-DD`, in local time; `undefined` for anything else (including `2026-02-30`). */
export function parseIso(text: string | null | undefined): Date | undefined {
  const match = text ? ISO.exec(text) : null;
  if (!match) return undefined;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day
    ? date
    : undefined;
}

export function toIso(date: Date): string {
  const pad = (n: number, width = 2) => String(n).padStart(width, '0');
  return `${pad(date.getFullYear(), 4)}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Whole nights from `start` to `end`: the difference of the calendar dates, which a change of clocks cannot move. */
export function nightsBetween(start: Date, end: Date): number {
  const a = Date.UTC(start.getFullYear(), start.getMonth(), start.getDate());
  const b = Date.UTC(end.getFullYear(), end.getMonth(), end.getDate());
  return Math.round((b - a) / 86_400_000);
}

export function nightsLabel(nights: number): string {
  return nights === 0 ? 'same day' : nights === 1 ? '1 night' : `${nights} nights`;
}

export interface Range {
  readonly start: Date;
  readonly end: Date;
}

/** The range two picks make: the earlier is the start, whichever was picked first. */
export function rangeOf(first: Date, second: Date): Range {
  return nightsBetween(first, second) >= 0
    ? { start: first, end: second }
    : { start: second, end: first };
}
