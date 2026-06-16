import { describe, expect, it } from 'vitest';
import { monogram } from '../monogram';

describe('monogram', () => {
  it('takes the first letter of the first two words', () => {
    expect(monogram('Plain Write')).toBe('PW');
    expect(monogram('Acme Project Tracker')).toBe('AP');
  });

  it('falls back to the first two characters of a single word', () => {
    expect(monogram('Tasks')).toBe('TA');
    expect(monogram('a')).toBe('A');
  });

  it('upper-cases the result', () => {
    expect(monogram('plainwrite')).toBe('PL');
    expect(monogram('split it')).toBe('SI');
  });

  it('ignores surrounding and repeated whitespace', () => {
    expect(monogram('  Plain   Write  ')).toBe('PW');
    expect(monogram('\tTasks\n')).toBe('TA');
  });

  it('returns an empty string for an empty or whitespace-only name', () => {
    expect(monogram('')).toBe('');
    expect(monogram('   ')).toBe('');
  });
});
