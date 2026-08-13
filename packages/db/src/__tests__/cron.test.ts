import { describe, expect, it } from 'vitest';
import { InvalidCronExpressionError, computeNextCronRun } from '../cron';

const T = (iso: string): number => Math.floor(new Date(iso).getTime() / 1000);

describe('computeNextCronRun', () => {
  it('returns the next occurrence strictly after `afterSeconds`, not `afterSeconds` itself', () => {
    // 10:00:00 is exactly on a */5 boundary — the next run must be 10:05, not 10:00.
    const next = computeNextCronRun('*/5 * * * *', 'UTC', T('2026-08-13T10:00:00Z'));
    expect(next).toBe(T('2026-08-13T10:05:00Z'));
  });

  it('computes a daily cron correctly across a day boundary', () => {
    const next = computeNextCronRun('0 3 * * *', 'UTC', T('2026-08-13T10:00:00Z'));
    expect(next).toBe(T('2026-08-14T03:00:00Z'));
  });

  it('defaults to UTC when no timezone is given', () => {
    const withUtc = computeNextCronRun('0 3 * * *', 'UTC', T('2026-08-13T10:00:00Z'));
    const withDefault = computeNextCronRun('0 3 * * *', undefined, T('2026-08-13T10:00:00Z'));
    expect(withDefault).toBe(withUtc);
  });

  it('honors a non-UTC timezone', () => {
    // 03:00 America/New_York in August (EDT, UTC-4) is 07:00 UTC.
    const next = computeNextCronRun('0 3 * * *', 'America/New_York', T('2026-08-13T10:00:00Z'));
    expect(next).toBe(T('2026-08-14T07:00:00Z'));
  });

  it('throws InvalidCronExpressionError for a malformed expression', () => {
    expect(() => computeNextCronRun('not a cron', 'UTC', T('2026-08-13T10:00:00Z'))).toThrow(
      InvalidCronExpressionError,
    );
  });

  it('throws InvalidCronExpressionError for an unknown timezone', () => {
    expect(() => computeNextCronRun('* * * * *', 'Not/AZone', T('2026-08-13T10:00:00Z'))).toThrow(
      InvalidCronExpressionError,
    );
  });

  it('the thrown error message names the offending expression', () => {
    expect.assertions(1);
    try {
      computeNextCronRun('garbage', 'UTC', T('2026-08-13T10:00:00Z'));
    } catch (err) {
      expect((err as Error).message).toContain('garbage');
    }
  });
});
