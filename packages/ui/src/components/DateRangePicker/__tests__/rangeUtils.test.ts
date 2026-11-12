import { describe, expect, it } from 'vitest';
import { nightsBetween, nightsLabel, parseIso, rangeOf, toIso } from '../rangeUtils';

describe('rangeUtils', () => {
  it('reads and writes YYYY-MM-DD as the calendar date, never through a zone', () => {
    const date = parseIso('2026-05-10');
    expect(date?.getFullYear()).toBe(2026);
    expect(date?.getMonth()).toBe(4);
    expect(date?.getDate()).toBe(10);
    expect(toIso(date as Date)).toBe('2026-05-10');
    expect(toIso(new Date(2026, 0, 5))).toBe('2026-01-05');
    expect(toIso(new Date(999, 0, 5))).toBe('0999-01-05');
  });

  it('refuses what is not a date, including a day the month does not have', () => {
    for (const bad of [
      '',
      'x',
      '2026-5-10',
      '2026-02-30',
      '2026-13-01',
      '2026-00-10',
      '2026-05-10T00:00',
      null,
      undefined,
    ])
      expect(parseIso(bad), String(bad)).toBeUndefined();
    expect(parseIso('2028-02-29')).toBeDefined();
    expect(parseIso('2026-02-29')).toBeUndefined();
  });

  it('counts the nights between two dates, across a month, a year and a change of clocks', () => {
    const n = (a: string, b: string) => nightsBetween(parseIso(a) as Date, parseIso(b) as Date);
    expect(n('2026-05-10', '2026-05-12')).toBe(2);
    expect(n('2026-05-10', '2026-05-10')).toBe(0);
    expect(n('2026-12-30', '2027-01-02')).toBe(3);
    expect(n('2026-03-28', '2026-03-30')).toBe(2);
    expect(n('2026-10-24', '2026-10-26')).toBe(2);
    expect(n('2026-05-12', '2026-05-10')).toBe(-2);
  });

  it('says the nights in words', () => {
    expect(nightsLabel(0)).toBe('same day');
    expect(nightsLabel(1)).toBe('1 night');
    expect(nightsLabel(14)).toBe('14 nights');
  });

  it('makes the earlier of two picks the start, whichever was first', () => {
    const a = parseIso('2026-05-10') as Date;
    const b = parseIso('2026-05-14') as Date;
    expect(rangeOf(a, b)).toEqual({ start: a, end: b });
    expect(rangeOf(b, a)).toEqual({ start: a, end: b });
    expect(rangeOf(a, a)).toEqual({ start: a, end: a });
  });
});
