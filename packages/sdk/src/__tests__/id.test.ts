import { describe, expect, it } from 'vitest';
import { id } from '../id';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHORT_ID_RE = /^[A-Za-z0-9\-_]+$/;

describe('id', () => {
  describe('uuid()', () => {
    it('returns a well-formed v4 UUID', () => {
      expect(id.uuid()).toMatch(UUID_RE);
    });

    it('returns a distinct value on each call', () => {
      const values = new Set(Array.from({ length: 100 }, () => id.uuid()));
      expect(values.size).toBe(100);
    });
  });

  describe('short()', () => {
    it('defaults to a 21-character URL-safe ID', () => {
      const value = id.short();
      expect(value).toHaveLength(21);
      expect(value).toMatch(SHORT_ID_RE);
    });

    it('respects a custom size', () => {
      expect(id.short(6)).toHaveLength(6);
      expect(id.short(40)).toHaveLength(40);
    });

    it('returns a distinct value on each call', () => {
      const values = new Set(Array.from({ length: 500 }, () => id.short()));
      expect(values.size).toBe(500);
    });

    it('throws on a non-positive or non-integer size', () => {
      expect(() => id.short(0)).toThrow(/positive integer/);
      expect(() => id.short(-5)).toThrow(/positive integer/);
      expect(() => id.short(3.5)).toThrow(/positive integer/);
    });
  });
});
