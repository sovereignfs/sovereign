import { describe, expect, it } from 'vitest';
import { canonicalTimezone } from '../auth/timezone';

describe('canonicalTimezone', () => {
  it.each([
    ['Europe/London', 'Europe/London'],
    ['America/Port-au-Prince', 'America/Port-au-Prince'],
    ['Etc/GMT+5', 'Etc/GMT+5'],
    ['UTC', 'UTC'],
  ])('accepts %s', (given, kept) => {
    expect(canonicalTimezone(given)).toBe(kept);
  });

  it('keeps one spelling for a zone the engine knows by two names, and that spelling is itself accepted', () => {
    for (const given of ['Asia/Kolkata', 'Asia/Calcutta', 'America/Argentina/Buenos_Aires']) {
      const kept = canonicalTimezone(given);
      expect(kept).toBeDefined();
      expect(canonicalTimezone(kept)).toBe(kept);
    }
    expect(canonicalTimezone('Asia/Kolkata')).toBe(canonicalTimezone('Asia/Calcutta'));
  });

  it('keeps the canonical spelling, so the same zone is never stored two ways', () => {
    expect(canonicalTimezone('europe/london')).toBe('Europe/London');
    expect(canonicalTimezone('EUROPE/LONDON')).toBe('Europe/London');
  });

  it.each([
    '',
    ' ',
    ' Europe/London',
    'Europe/London ',
    'Europe/Londonn',
    'Mars/Phobos',
    '+05:30',
    '-08:00',
    'GMT+5:30',
    'Europe/London; drop table users',
    '../etc/passwd',
    'Europe//London',
    'Europe/London\n',
    'Europe/Lond\u0000on',
    'a'.repeat(65),
    `${'Europe/'.repeat(20)}London`,
  ])('refuses %j', (given) => {
    expect(canonicalTimezone(given)).toBeUndefined();
  });

  it.each([undefined, null, 5, true, {}, [], ['Europe/London']])(
    'refuses %j, which is not text',
    (given) => {
      expect(canonicalTimezone(given)).toBeUndefined();
    },
  );
});
