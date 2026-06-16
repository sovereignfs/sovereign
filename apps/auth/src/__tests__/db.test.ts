import { describe, expect, it } from 'vitest';
import { sqliteParams, toPgPlaceholders } from '../db';

describe('toPgPlaceholders', () => {
  it('rewrites ? to $1, $2, … in order', () => {
    expect(toPgPlaceholders('SELECT * FROM t WHERE a = ? AND b = ?')).toBe(
      'SELECT * FROM t WHERE a = $1 AND b = $2',
    );
  });

  it('leaves a parameterless query unchanged', () => {
    expect(toPgPlaceholders('SELECT 1')).toBe('SELECT 1');
  });

  it('numbers every placeholder, including repeats', () => {
    expect(toPgPlaceholders('VALUES (?, ?, ?)')).toBe('VALUES ($1, $2, $3)');
  });
});

describe('sqliteParams', () => {
  it('maps booleans to 1/0 (better-sqlite3 cannot bind booleans)', () => {
    expect(sqliteParams([true, false])).toEqual([1, 0]);
  });

  it('leaves non-boolean params untouched', () => {
    expect(sqliteParams(['x', 5, null, undefined])).toEqual(['x', 5, null, undefined]);
  });
});
