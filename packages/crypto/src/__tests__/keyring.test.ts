import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { generateKey, KEY_BYTES, KeyRingError, parseKeyRing } from '../index.js';

const key = () => randomBytes(KEY_BYTES).toString('base64');

function problems(raw: string): string[] {
  try {
    parseKeyRing(raw);
  } catch (error) {
    if (error instanceof KeyRingError) return [...error.problems];
    throw error;
  }
  return [];
}

describe('parseKeyRing', () => {
  it('reads one key', () => {
    const ring = parseKeyRing(`k1:${key()}`);
    expect(ring.current.id).toBe('k1');
    expect(ring.current.material).toHaveLength(KEY_BYTES);
  });

  it('takes the first entry as current and keeps every entry', () => {
    const ring = parseKeyRing(`k3:${key()}, k2:${key()},k1:${key()}`);
    expect(ring.current.id).toBe('k3');
    expect([...ring.byId.keys()]).toEqual(['k3', 'k2', 'k1']);
  });

  it('accepts base64, unpadded base64 and base64url', () => {
    const bytes = randomBytes(KEY_BYTES);
    for (const text of [
      bytes.toString('base64'),
      bytes.toString('base64').replace(/=+$/, ''),
      bytes.toString('base64url'),
    ]) {
      expect(parseKeyRing(`a:${text}`).current.material.equals(bytes)).toBe(true);
    }
  });

  it('accepts the keys generateKey makes', () => {
    expect(() => parseKeyRing(`k1:${generateKey()}`)).not.toThrow();
  });

  it.each([
    ['', ['entry 1 is empty']],
    ['k1', ['entry 1 must be id:key']],
    [`k1:${key()},`, ['entry 2 is empty']],
    [`K1:${key()}`, ['entry 1 has an id that is not 1-32 lower-case letters, digits, "-" or "_"']],
    [`k:1:${key()}`, ['entry 1 has a key that is not valid base64']],
    [
      `${'a'.repeat(33)}:${key()}`,
      ['entry 1 has an id that is not 1-32 lower-case letters, digits, "-" or "_"'],
    ],
    ['k1:not base64!', ['entry 1 has a key that is not valid base64']],
    [`k1:${randomBytes(16).toString('base64')}`, ['entry 1 has a key that is not 32 bytes']],
    [`k1:${randomBytes(48).toString('base64')}`, ['entry 1 has a key that is not 32 bytes']],
  ])('refuses %j', (raw, expected) => {
    expect(problems(raw)).toEqual(expected);
  });

  it('refuses a key that mixes the two alphabets', () => {
    expect(problems('k1:' + 'A'.repeat(20) + '+' + 'A'.repeat(10) + '-' + 'A'.repeat(11))).toEqual([
      'entry 1 has a key that is not valid base64',
    ]);
  });

  it('refuses two entries with the same id', () => {
    expect(problems(`k1:${key()},k1:${key()}`)).toEqual(['entries 1 and 2 use the same id']);
  });

  it('reports every problem at once', () => {
    expect(problems(`k1,K2:${key()},k3:short`)).toHaveLength(3);
  });

  it('never shows a key in a problem, even a mistyped entry that is only a key', () => {
    const secret = key();
    const found =
      problems(secret).join(' ') +
      problems(`k1:${secret}x`).join(' ') +
      problems(`K1:${secret}`).join(' ');
    expect(found).not.toContain(secret);
    expect(found).not.toContain(secret.slice(0, 12));
  });

  it('refuses text longer than any real key ring, quickly', () => {
    const started = performance.now();
    expect(problems('k1:' + 'A'.repeat(100_000))).toEqual(['it is longer than any real key ring']);
    expect(performance.now() - started).toBeLessThan(200);
  });

  it('handles a very long run of padding in linear time', () => {
    const started = performance.now();
    problems('k1:' + 'A'.repeat(40) + '='.repeat(4000));
    expect(performance.now() - started).toBeLessThan(200);
  });
});
