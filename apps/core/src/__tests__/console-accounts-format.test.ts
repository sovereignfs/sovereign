import { describe, expect, it } from 'vitest';
import { formatTime, roleLabel } from '../../app/console/accounts/format';

describe('a role as a person reads it', () => {
  it.each([
    ['platform:owner', 'Owner'],
    ['platform:admin', 'Admin'],
    ['platform:user', 'User'],
    ['platform:superuser', 'Unknown'],
    ['', 'Unknown'],
  ])('reads %j as %s', (role, label) => {
    expect(roleLabel(role)).toBe(label);
  });
});

describe('a moment', () => {
  it('is said in UTC so a page reads the same wherever it is rendered', () => {
    expect(formatTime(Date.UTC(2026, 9, 1, 9, 5))).toBe('1 Oct 2026, 09:05 UTC');
    expect(formatTime(Date.UTC(2026, 0, 31, 23, 59))).toBe('31 Jan 2026, 23:59 UTC');
  });
});
