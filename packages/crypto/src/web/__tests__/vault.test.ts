import { describe, expect, it } from 'vitest';
import { acceptChangedKey, memoryRememberedKeys, rememberKey } from '../vault.js';

describe('remembered keys', () => {
  it('remembers the first key it sees, and says so', async () => {
    const store = memoryRememberedKeys();
    expect(await rememberKey(store, 'ada', 'key-1')).toBe('first');
    expect(await store.get('ada')).toBe('key-1');
    expect(await rememberKey(store, 'ada', 'key-1')).toBe('same');
  });

  it('calls a different key changed, and keeps the one it knew until it is accepted', async () => {
    const store = memoryRememberedKeys();
    await rememberKey(store, 'ada', 'key-1');
    expect(await rememberKey(store, 'ada', 'key-2')).toBe('changed');
    expect(await store.get('ada')).toBe('key-1');
    expect(await rememberKey(store, 'ada', 'key-2')).toBe('changed');

    await acceptChangedKey(store, 'ada', 'key-2');
    expect(await rememberKey(store, 'ada', 'key-2')).toBe('same');
    expect(await rememberKey(store, 'ada', 'key-1')).toBe('changed');
  });

  it('keeps each person apart', async () => {
    const store = memoryRememberedKeys();
    await rememberKey(store, 'ada', 'key-a');
    expect(await rememberKey(store, 'grace', 'key-a')).toBe('first');
    expect(await rememberKey(store, 'grace', 'key-g')).toBe('changed');
    expect(await rememberKey(store, 'ada', 'key-a')).toBe('same');
  });
});
