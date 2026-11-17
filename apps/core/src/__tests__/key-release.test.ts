import {
  derivePassword,
  generateReceivingKey,
  newReleaseState,
  openRelease,
  publicKeyBytes,
  toBase64Url,
} from '@sovereignfs/crypto/web';
import { describe, expect, it } from 'vitest';
import type { ClientRow } from '../clients/registry';
import { KeyStore, memoryBackend } from '../keys/keystore';
import { keepKit, kitPending, releaseToApp, type ReleaseActions } from '../keys/release';
import { readReleaseTarget } from '../keys/release-target';
import { unlockWithPassword } from '../keys/unlock';

const RETURN = 'https://notes.example/keys';
const b64 = (data: Uint8Array) => Buffer.from(data).toString('base64url');

/** One account's vault in memory, with its app keys and kit. */
function fakeVault() {
  let account: Record<string, unknown> | undefined;
  const ways = new Map<string, { way: string; id: string; record: string }>();
  const apps = new Map<
    string,
    { clientId: string; appKey: string; identity: string; signature: string }
  >();
  const actions: ReleaseActions = {
    read: async () => ({
      ok: true,
      value: {
        sub: 'ada',
        ...(account ? { account: account as never } : {}),
        waysIn: [...ways.values()],
      },
    }),
    setUp: async (made, waysIn) => {
      account = { ...made, kitConfirmed: false };
      for (const way of waysIn) ways.set(`${way.way}:${way.id}`, way);
      return { ok: true, value: undefined };
    },
    putWayIn: async (way) => {
      ways.set(`${way.way}:${way.id}`, way);
      return { ok: true, value: undefined };
    },
    removeWayIn: async (way, id) => ({ ok: true, value: ways.delete(`${way}:${id}`) }),
    sessionSecret: async () => ({ ok: true, value: b64(new Uint8Array(32).fill(1)) }),
    readApp: async (clientId) => ({ ok: true, value: apps.get(clientId) }),
    putApp: async (app) => {
      if (apps.has(app.clientId)) return { ok: false, error: 'exists' };
      apps.set(app.clientId, app);
      return { ok: true, value: undefined };
    },
    confirmKit: async (record) => {
      ways.set('kit:', { way: 'kit', id: '', record });
      if (account) account.kitConfirmed = true;
      return { ok: true, value: undefined };
    },
  };
  return { actions, apps, ways };
}

async function unlocked() {
  const vault = fakeVault();
  const store = new KeyStore(memoryBackend());
  const { secret } = await derivePassword({
    password: 'pw',
    address: 'ada@example.com',
    instanceId: new Uint8Array(32).fill(5),
    derivation: { version: 9, memoryBytes: 64 * 1024, passes: 1 },
  });
  await unlockWithPassword(secret, vault.actions, store);
  return { ...vault, store };
}

async function request(clientId: string) {
  const pair = await generateReceivingKey();
  const target = {
    clientId,
    returnTo: RETURN,
    request: toBase64Url(await publicKeyBytes(pair.publicKey)),
    state: newReleaseState(),
  };
  return { pair, target };
}

async function opened(url: string, asked: Awaited<ReturnType<typeof request>>) {
  const fragment = new URLSearchParams(new URL(url).hash.slice(1));
  expect(url.startsWith(`${RETURN}#`)).toBe(true);
  expect(fragment.get('state')).toBe(asked.target.state);
  return openRelease({
    answer: { key: fragment.get('sv_key') ?? '', sig: fragment.get('sv_sig') ?? '' },
    target: asked.target,
    recipient: asked.pair,
    sub: 'ada',
  });
}

describe('releasing an app’s key (core-app §5.7)', () => {
  it('makes the app’s keys the first time, then gives the same key each time, and another app another', async () => {
    const { actions, store, apps } = await unlocked();
    const first = await request('notes');
    const released = await releaseToApp(first.target, actions, store);
    if (typeof released !== 'object') throw new Error(String(released));
    const key = (await opened(released.url, first)).appKey;
    expect(apps.get('notes')?.signature).toMatch(/^[A-Za-z0-9_-]{86}$/);

    const again = await request('notes');
    const second = await releaseToApp(again.target, actions, store);
    if (typeof second !== 'object') throw new Error(String(second));
    expect((await opened(second.url, again)).appKey).toEqual(key);

    const other = await request('mail');
    const third = await releaseToApp(other.target, actions, store);
    if (typeof third !== 'object') throw new Error(String(third));
    expect((await opened(third.url, other)).appKey).not.toEqual(key);
    expect([...apps.keys()].sort()).toEqual(['mail', 'notes']);
  });

  it('is locked on a browser that holds no account key', async () => {
    const { actions } = await unlocked();
    expect(
      await releaseToApp((await request('notes')).target, actions, new KeyStore(memoryBackend())),
    ).toBe('locked');
  });

  it('keeps the kit once: its way in, and the kit marked kept', async () => {
    const { actions, store, ways } = await unlocked();
    expect(await kitPending(actions)).toBe(true);
    expect(await keepKit(new Uint8Array(32).fill(3), actions, store)).toBe(true);
    expect(await kitPending(actions)).toBe(false);
    expect([...ways.values()].some((way) => way.way === 'kit')).toBe(true);
  });
});

describe('what the release page acts on (RFC 0005 §4 step 2)', () => {
  const row = (overrides: Partial<ClientRow> & { metadata?: string } = {}) =>
    ({
      clientId: 'notes',
      name: 'Notes',
      disabled: false,
      metadata: JSON.stringify({ keyReturnUri: RETURN }),
      ...overrides,
    }) as unknown as ClientRow;
  const authWith = (found: ClientRow | null) => ({
    $context: Promise.resolve({ adapter: { findOne: async () => found } }),
  });
  const query = async () => ({
    client_id: 'notes',
    return_to: RETURN,
    request: toBase64Url(await publicKeyBytes((await generateReceivingKey()).publicKey)),
    state: newReleaseState(),
  });

  it('is an enabled app that may use encryption, asking with exactly its return address', async () => {
    expect(await readReleaseTarget(authWith(row()) as never, await query())).toMatchObject({
      clientId: 'notes',
      appName: 'Notes',
      returnTo: RETURN,
    });
  });

  it('is nothing for every other request', async () => {
    const good = await query();
    const cases: [ClientRow | null, Record<string, string>][] = [
      [null, good],
      [row({ disabled: true }), good],
      [row({ metadata: '{}' }), good],
      [row(), { ...good, return_to: `${RETURN}/other` }],
      [row(), { ...good, return_to: 'https://evil.example/keys' }],
      [row(), { ...good, request: 'short' }],
      [row(), { ...good, state: 'short' }],
      [row(), { ...good, client_id: '' }],
    ];
    for (const [found, asked] of cases) {
      expect(await readReleaseTarget(authWith(found) as never, asked)).toBeUndefined();
    }
  });
});
