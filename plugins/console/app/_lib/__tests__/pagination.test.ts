import { describe, expect, it } from 'vitest';
import { parsePageParam } from '../pagination';

describe('parsePageParam', () => {
  it('defaults to page 1 when the param is absent', () => {
    expect(parsePageParam(undefined)).toBe(1);
  });

  it('parses a plain positive integer', () => {
    expect(parsePageParam('3')).toBe(3);
  });

  it('clamps zero and negatives up to page 1', () => {
    expect(parsePageParam('0')).toBe(1);
    expect(parsePageParam('-4')).toBe(1);
  });

  it('never yields NaN for garbage input (regression: "Showing NaN–NaN")', () => {
    expect(parsePageParam('abc')).toBe(1);
    expect(parsePageParam('')).toBe(1);
    expect(parsePageParam('Infinity')).toBe(1);
  });

  it('truncates a fractional page number', () => {
    expect(parsePageParam('2.9')).toBe(2);
  });
});
