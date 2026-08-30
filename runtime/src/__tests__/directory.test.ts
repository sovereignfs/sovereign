import { describe, expect, it } from 'vitest';
import {
  DIRECTORY_MAX_LIMIT,
  DIRECTORY_RATE_LIMIT_MAX_REQUESTS,
  checkDirectoryRateLimit,
  directoryRateLimitBucketCountForTests,
  normalizeResolveUsersInput,
  normalizeSearchUsersInput,
  resetDirectoryRateLimitForTests,
  toDirectoryUsers,
} from '../directory';

describe('directory helpers', () => {
  it('normalizes search input and applies default and maximum limits', () => {
    expect(normalizeSearchUsersInput({ query: '  ka ' })).toEqual({ query: 'ka', limit: 20 });
    expect(normalizeSearchUsersInput({ query: 'kasun', limit: 999 })).toEqual({
      query: 'kasun',
      limit: DIRECTORY_MAX_LIMIT,
    });
  });

  it('rejects enumeration-prone search input', () => {
    expect(() => normalizeSearchUsersInput({ query: 'k' })).toThrow(/at least 2/);
    expect(() => normalizeSearchUsersInput({ query: 'ka', limit: 0 })).toThrow(/positive integer/);
  });

  it('normalizes resolve input by trimming, deduplicating, and capping ids', () => {
    expect(normalizeResolveUsersInput({ ids: [' u1 ', 'u1', '', 'u2'] })).toEqual({
      ids: ['u1', 'u2'],
    });
    expect(() =>
      normalizeResolveUsersInput({
        ids: Array.from({ length: DIRECTORY_MAX_LIMIT + 1 }, (_, index) => `u${String(index)}`),
      }),
    ).toThrow(/limited/);
  });

  it('strips non-directory fields from rows', () => {
    expect(
      toDirectoryUsers([
        {
          id: 'u1',
          email: 'a@example.com',
          name: 'A',
          image: '/avatar.png',
          role: 'platform:admin',
          active: true,
        },
        { id: 'bad', email: null },
      ]),
    ).toEqual([{ id: 'u1', email: 'a@example.com', name: 'A', image: '/avatar.png' }]);
  });

  it('rate-limits by key within the active window', () => {
    resetDirectoryRateLimitForTests();
    for (let i = 0; i < DIRECTORY_RATE_LIMIT_MAX_REQUESTS; i += 1) {
      expect(checkDirectoryRateLimit('u1:ip', 1_000).allowed).toBe(true);
    }
    const denied = checkDirectoryRateLimit('u1:ip', 1_000);
    expect(denied.allowed).toBe(false);
    expect(denied.retryAfterSeconds).toBeGreaterThan(0);
    expect(checkDirectoryRateLimit('u1:ip', 62_000).allowed).toBe(true);
  });

  describe('lazy eviction', () => {
    it('evicts expired entries once both the window and the eviction interval have elapsed, leaving a still-active key untouched', () => {
      resetDirectoryRateLimitForTests();
      checkDirectoryRateLimit('key-a', 1_000);
      checkDirectoryRateLimit('key-b', 1_000);
      checkDirectoryRateLimit('key-c', 1_000);
      expect(directoryRateLimitBucketCountForTests()).toBe(3);

      // Window elapsed (60_000ms) but the eviction interval (5min) has not
      // -- a call here must not shrink the map yet.
      checkDirectoryRateLimit('key-d', 61_500);
      expect(directoryRateLimitBucketCountForTests()).toBe(4);

      // Eviction interval elapsed (5min since lastSweepAt, which starts at
      // 0) -- this call sweeps every entry whose window has expired.
      checkDirectoryRateLimit('key-e', 400_000);
      expect(directoryRateLimitBucketCountForTests()).toBe(1);
    });

    it('sweeps at most once per eviction interval, not on every call', () => {
      resetDirectoryRateLimitForTests();
      checkDirectoryRateLimit('key-a', 1_000);

      // Crosses the eviction-interval threshold -- sweeps key-a away and
      // resets lastSweepAt to 300_000.
      checkDirectoryRateLimit('key-b', 300_000);
      expect(directoryRateLimitBucketCountForTests()).toBe(1);

      // key-b's own window has now elapsed, but this call sits well within
      // the eviction interval of the last sweep -- the gate must block a
      // re-sweep, so key-b survives despite being expired.
      checkDirectoryRateLimit('key-c', 360_500);
      expect(directoryRateLimitBucketCountForTests()).toBe(2);

      // A full interval past the last real sweep -- fires again and removes
      // every entry expired by this point.
      checkDirectoryRateLimit('key-d', 600_000);
      expect(directoryRateLimitBucketCountForTests()).toBe(1);
    });
  });
});
