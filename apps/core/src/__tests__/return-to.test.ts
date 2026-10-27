import { describe, expect, it } from 'vitest';
import { safeReturnTo } from '../auth/return-to';

describe('safeReturnTo', () => {
  it('keeps a path on this site, with its query', () => {
    expect(safeReturnTo('/settings?tab=mail#top')).toBe('/settings?tab=mail#top');
  });

  it('falls back to the home page when there is nothing', () => {
    expect(safeReturnTo(undefined)).toBe('/');
    expect(safeReturnTo('')).toBe('/');
  });

  it('takes the first of a repeated parameter', () => {
    expect(safeReturnTo(['/a', 'https://evil.example'])).toBe('/a');
  });

  it.each([
    'https://evil.example/',
    '//evil.example/',
    '/\\evil.example',
    '\\\\evil.example',
    'javascript:alert(1)',
    'settings',
    '/\t/evil.example',
    '/\n/evil.example',
    `/${'a'.repeat(3000)}`,
  ])('refuses %j, which could leave this site', (value) => {
    expect(safeReturnTo(value)).toBe('/');
  });
});
