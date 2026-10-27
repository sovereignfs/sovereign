import { describe, expect, it } from 'vitest';
import {
  describePasswordPolicy,
  MAX_PASSWORD_LENGTH,
  passwordPolicyMessage,
  passwordProblems,
  type PasswordPolicy,
} from '../auth/password-policy';

const policy = (extra: Partial<PasswordPolicy> = {}): PasswordPolicy => ({
  minLength: 8,
  maxLength: MAX_PASSWORD_LENGTH,
  requireUppercase: false,
  requireLowercase: false,
  requireNumber: false,
  requireSymbol: false,
  ...extra,
});

describe('passwordProblems', () => {
  it('accepts a password of exactly the minimum length and refuses one shorter', () => {
    expect(passwordProblems('a'.repeat(8), policy())).toEqual([]);
    expect(passwordProblems('a'.repeat(7), policy())).toEqual(['be at least 8 characters long']);
  });

  it('accepts exactly the maximum and refuses one more', () => {
    expect(passwordProblems('a'.repeat(128), policy())).toEqual([]);
    expect(passwordProblems('a'.repeat(129), policy())).toEqual(['be at most 128 characters long']);
  });

  it('asks for each class only when the policy does', () => {
    expect(passwordProblems('abcdefgh', policy())).toEqual([]);
    expect(passwordProblems('abcdefgh', policy({ requireUppercase: true }))).toEqual([
      'include an uppercase letter',
    ]);
    expect(passwordProblems('ABCDEFGH', policy({ requireLowercase: true }))).toEqual([
      'include a lowercase letter',
    ]);
    expect(passwordProblems('abcdefgh', policy({ requireNumber: true }))).toEqual([
      'include a number',
    ]);
    expect(passwordProblems('abcdefgh', policy({ requireSymbol: true }))).toEqual([
      'include a symbol',
    ]);
  });

  it('reports every problem at once', () => {
    const all = policy({
      requireUppercase: true,
      requireLowercase: true,
      requireNumber: true,
      requireSymbol: true,
    });
    expect(passwordProblems('', all)).toHaveLength(5);
    expect(passwordProblems('Abcdef1!', all)).toEqual([]);
  });

  it('counts letters and digits of any script, and any other character as a symbol', () => {
    const all = policy({
      requireUppercase: true,
      requireLowercase: true,
      requireNumber: true,
      requireSymbol: true,
    });
    expect(passwordProblems('Éclair٣ ', all)).toEqual([]);
    // A letter with an accent is a letter, not a symbol.
    expect(passwordProblems('Éclairs1', policy({ requireSymbol: true }))).toEqual([
      'include a symbol',
    ]);
  });
});

describe('describing the policy', () => {
  it('says the length alone when nothing else is asked', () => {
    expect(describePasswordPolicy(policy())).toBe('At least 8 characters.');
  });

  it('lists what else is asked, in a sentence', () => {
    expect(describePasswordPolicy(policy({ requireNumber: true }))).toBe(
      'At least 8 characters, with a number.',
    );
    expect(
      describePasswordPolicy(
        policy({ minLength: 12, requireUppercase: true, requireNumber: true, requireSymbol: true }),
      ),
    ).toBe('At least 12 characters, with an uppercase letter, a number and a symbol.');
  });

  it('writes the error message as a sentence', () => {
    expect(passwordPolicyMessage(['be at least 8 characters long', 'include a number'])).toBe(
      'The password must be at least 8 characters long and include a number.',
    );
  });
});
