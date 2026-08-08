import { describe, expect, it } from 'vitest';
import { parseOfflineSessionTtl } from '../env';

const HOUR = 60 * 60;
const DAY = 24 * HOUR;

describe('parseOfflineSessionTtl', () => {
  it('defaults to 14 days when unset or blank', () => {
    expect(parseOfflineSessionTtl(undefined)).toBe(14 * DAY);
    expect(parseOfflineSessionTtl('')).toBe(14 * DAY);
    expect(parseOfflineSessionTtl('   ')).toBe(14 * DAY);
  });

  it('accepts an in-range value', () => {
    expect(parseOfflineSessionTtl(String(7 * DAY))).toBe(7 * DAY);
  });

  // Clamps rather than throws: an out-of-range value should not stop an
  // instance booting, and both bounds are themselves safe.
  it('clamps below the one-hour floor', () => {
    expect(parseOfflineSessionTtl('60')).toBe(HOUR);
    expect(parseOfflineSessionTtl('1')).toBe(HOUR);
  });

  it('clamps above the 90-day ceiling', () => {
    expect(parseOfflineSessionTtl(String(365 * DAY))).toBe(90 * DAY);
  });

  it('falls back to the default for values that are not usable numbers', () => {
    expect(parseOfflineSessionTtl('not-a-number')).toBe(14 * DAY);
    expect(parseOfflineSessionTtl('0')).toBe(14 * DAY);
    expect(parseOfflineSessionTtl('-1')).toBe(14 * DAY);
    expect(parseOfflineSessionTtl('Infinity')).toBe(14 * DAY);
  });

  it('truncates a fractional value to whole seconds', () => {
    expect(parseOfflineSessionTtl(String(2 * DAY + 0.9))).toBe(2 * DAY);
  });
});
