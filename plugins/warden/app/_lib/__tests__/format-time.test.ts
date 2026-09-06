import { describe, expect, it } from 'vitest';
import { formatRelativeTime } from '../format-time';

const NOW = Date.UTC(2026, 8, 6, 12, 0, 0);

describe('formatRelativeTime', () => {
  it('rounds to the largest sensible unit', () => {
    expect(formatRelativeTime(NOW - 10_000, NOW)).toBe('just now');
    expect(formatRelativeTime(NOW - 3 * 60_000, NOW)).toBe('3 minutes ago');
    expect(formatRelativeTime(NOW - 5 * 3_600_000, NOW)).toBe('5 hours ago');
    expect(formatRelativeTime(NOW - 2 * 86_400_000, NOW)).toBe('2 days ago');
    expect(formatRelativeTime(NOW - 65 * 86_400_000, NOW)).toBe('2 months ago');
  });

  it('never reports a future instant as ahead of now', () => {
    expect(formatRelativeTime(NOW + 60_000, NOW)).toBe('just now');
  });
});
