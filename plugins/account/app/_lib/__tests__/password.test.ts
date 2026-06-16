import { describe, expect, it } from 'vitest';
import { MIN_PASSWORD_LENGTH, validatePasswordChange } from '../password';

describe('validatePasswordChange', () => {
  it('accepts a long-enough matching password', () => {
    expect(validatePasswordChange('longenough', 'longenough')).toBeNull();
  });

  it('rejects a password shorter than the minimum', () => {
    const short = 'a'.repeat(MIN_PASSWORD_LENGTH - 1);
    expect(validatePasswordChange(short, short)).toMatch(/at least/);
  });

  it('checks length before match (a short mismatch reports length)', () => {
    expect(validatePasswordChange('abc', 'xyz')).toMatch(/at least/);
  });

  it('rejects a mismatch when long enough', () => {
    expect(validatePasswordChange('longenough', 'different1')).toMatch(/do not match/);
  });

  it('accepts exactly the minimum length', () => {
    const exact = 'a'.repeat(MIN_PASSWORD_LENGTH);
    expect(validatePasswordChange(exact, exact)).toBeNull();
  });
});
