// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  appendLog,
  backgroundEntry,
  makePasskey,
  markHidden,
  readLog,
  report,
  testPasskeyId,
  unlock,
} from '../../app/lock-check/checks';

/** A store that keeps what it is given, or one that refuses everything, as a private window may. */
const memory = () => {
  const kept = new Map<string, string>();
  return {
    getItem: (key: string) => kept.get(key) ?? null,
    setItem: (key: string, value: string) => void kept.set(key, value),
    removeItem: (key: string) => void kept.delete(key),
  };
};
const refusing = {
  getItem: () => {
    throw new Error('denied');
  },
  setItem: () => {
    throw new Error('denied');
  },
  removeItem: () => {
    throw new Error('denied');
  },
};

/** Authenticator data with the user-verified flag set or not: 37 bytes, flags at byte 32. */
const authenticatorData = (verified: boolean) => {
  const bytes = new Uint8Array(37);
  bytes[32] = verified ? 0x05 : 0x01;
  return bytes.buffer;
};

const credentials = { create: vi.fn(), get: vi.fn() };
beforeEach(() => {
  credentials.create.mockReset();
  credentials.get.mockReset();
  vi.stubGlobal('navigator', { ...navigator, credentials });
});
afterEach(() => vi.unstubAllGlobals());

describe('the log', () => {
  it('keeps entries across loads, and says nothing is wrong when storage refuses', () => {
    const store = memory();
    appendLog(store, { at: 1, check: 'a', outcome: 'ok', detail: 'one' });
    appendLog(store, { at: 2, check: 'b', outcome: 'failed', detail: 'two' });
    expect(readLog(store).map((entry) => entry.check)).toEqual(['a', 'b']);
    expect(readLog(refusing)).toEqual([]);
    expect(appendLog(refusing, { at: 3, check: 'c', outcome: 'info', detail: '' })).toHaveLength(1);
  });

  it('reads as text with the device first', () => {
    const text = report([{ at: 0, check: 'make', outcome: 'ok', detail: 'made' }], 'iPhone');
    expect(text.split('\n')).toEqual([
      'Lock check — iPhone',
      '1970-01-01T00:00:00.000Z  make  OK  made',
    ]);
  });
});

describe('time in the background', () => {
  it('says the page opened fresh after being hidden, and that it was kept when it comes back', () => {
    const store = memory();
    markHidden(store, 1000);
    expect(backgroundEntry(store, 'load', 61_000)?.detail).toBe(
      'opened fresh after 60 s away: the app was reloaded, or the device had ended it',
    );
    // Said once: the mark is used up.
    expect(backgroundEntry(store, 'load', 62_000)).toBeUndefined();
    markHidden(store, 1000);
    expect(backgroundEntry(store, 'shown', 11_000)?.detail).toBe(
      'came back after 10 s away, still running',
    );
  });
});

describe('making a passkey', () => {
  it('keeps its id and says whether it can give a PRF output', async () => {
    const store = memory();
    credentials.create.mockResolvedValue({
      rawId: new Uint8Array([1, 2, 3]).buffer,
      getClientExtensionResults: () => ({ prf: { enabled: true } }),
    });
    const entry = await makePasskey(store, 'core.sovereign.local');
    expect(entry.outcome).toBe('ok');
    expect(entry.detail).toMatch(/PRF enabled/);
    expect(testPasskeyId(store)).toBe('AQID');
    const asked = credentials.create.mock.calls[0]?.[0] as CredentialCreationOptions;
    expect(asked.publicKey?.rp.id).toBe('core.sovereign.local');
    expect(asked.publicKey?.authenticatorSelection?.userVerification).toBe('required');
  });

  it('says what refused it', async () => {
    credentials.create.mockRejectedValue(
      Object.assign(new Error('not allowed'), { name: 'NotAllowedError' }),
    );
    const entry = await makePasskey(memory(), 'core.sovereign.local');
    expect(entry.outcome).toBe('failed');
    expect(entry.detail).toMatch(/^NotAllowedError: not allowed/);
  });
});

describe('unlocking', () => {
  const answer = (verified: boolean, prf?: number) => ({
    response: { authenticatorData: authenticatorData(verified) },
    getClientExtensionResults: () =>
      prf === undefined ? {} : { prf: { results: { first: new Uint8Array(prf).buffer } } },
  });

  it('asks for user verification and the PRF extension, and reports both', async () => {
    credentials.get.mockResolvedValue(answer(true, 32));
    const entry = await unlock(memory(), 'core.sovereign.local', 'core', 'tap');
    expect(entry).toMatchObject({ check: 'unlock (passkey for core, tap)', outcome: 'ok' });
    expect(entry.detail).toMatch(/user verified; PRF 32 bytes/);
    const asked = credentials.get.mock.calls[0]?.[0] as CredentialRequestOptions;
    expect(asked.publicKey?.userVerification).toBe('required');
    expect(asked.publicKey?.allowCredentials).toEqual([]);
    expect(asked.publicKey?.extensions).toHaveProperty('prf');
  });

  it('fails an answer that was not user verified, and says when there was no PRF output', async () => {
    credentials.get.mockResolvedValue(answer(false));
    const entry = await unlock(memory(), 'core.sovereign.local', 'core', 'no tap');
    expect(entry.outcome).toBe('failed');
    expect(entry.detail).toMatch(/NOT user verified; PRF no output/);
  });

  it('asks for the test passkey alone, and needs one made first', async () => {
    const store = memory();
    expect((await unlock(store, 'core.sovereign.local', 'test', 'tap')).detail).toBe(
      'make a test passkey first',
    );
    expect(credentials.get).not.toHaveBeenCalled();
    store.setItem('sv-lock-check-passkey', 'AQID');
    credentials.get.mockResolvedValue(answer(true, 32));
    await unlock(store, 'core.sovereign.local', 'test', 'tap');
    const asked = credentials.get.mock.calls[0]?.[0] as CredentialRequestOptions;
    const allowed = asked.publicKey?.allowCredentials?.[0]?.id as Uint8Array;
    expect([...allowed]).toEqual([1, 2, 3]);
  });

  it('says a prompt was refused without a tap, by its name and how fast', async () => {
    credentials.get.mockRejectedValue(
      Object.assign(new Error('needs a gesture'), { name: 'NotAllowedError' }),
    );
    const entry = await unlock(memory(), 'core.sovereign.local', 'core', 'no tap');
    expect(entry.outcome).toBe('failed');
    expect(entry.detail).toMatch(/^NotAllowedError: needs a gesture \(\d+ ms\)$/);
  });
});
