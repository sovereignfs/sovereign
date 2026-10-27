import { inspect } from 'node:util';
import { describe, expect, it } from 'vitest';
import { Secret } from '../secret.js';

const VALUE = 'correct-horse-battery-staple-9f3a';

describe('Secret', () => {
  it('gives the value back only through reveal()', () => {
    expect(new Secret(VALUE).reveal()).toBe(VALUE);
  });

  it.each([
    ['String()', (s: Secret) => String(s)],
    ['a template literal', (s: Secret) => `${s.toString()}`],
    ['JSON.stringify', (s: Secret) => JSON.stringify(s)],
    ['JSON.stringify of an object holding it', (s: Secret) => JSON.stringify({ a: { s } })],
    ['util.inspect', (s: Secret) => inspect(s)],
    [
      'util.inspect of an object holding it',
      (s: Secret) => inspect({ nested: { s } }, { depth: 5 }),
    ],
    ['console-style formatting', (s: Secret) => inspect(s, { showHidden: true })],
  ])('does not reveal the value through %s', (_name, render) => {
    const text = render(new Secret(VALUE));
    expect(text).not.toContain(VALUE);
    expect(text).toContain('redacted');
  });

  it('does not expose the value as an own property', () => {
    const secret = new Secret(VALUE);
    expect(Object.keys(secret)).toEqual([]);
    expect(Object.getOwnPropertyNames(secret)).toEqual([]);
    expect(JSON.stringify({ ...secret })).not.toContain(VALUE);
    expect(JSON.stringify(Object.entries(secret))).not.toContain(VALUE);
  });

  it('survives a structured clone without its value', () => {
    const copy = structuredClone({ secret: new Secret(VALUE) });
    expect(JSON.stringify(copy)).not.toContain(VALUE);
  });

  it('compares two secrets without exposing either', () => {
    expect(new Secret(VALUE).equals(new Secret(VALUE))).toBe(true);
    expect(new Secret(VALUE).equals(new Secret(`${VALUE}x`))).toBe(false);
  });

  it('knows its length without revealing the value', () => {
    expect(new Secret(VALUE).length).toBe(VALUE.length);
  });
});
