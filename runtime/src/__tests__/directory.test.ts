import { describe, expect, it } from 'vitest';
import {
  DIRECTORY_MAX_LIMIT,
  DIRECTORY_RATE_LIMIT_MAX_REQUESTS,
  checkDirectoryRateLimit,
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
});
