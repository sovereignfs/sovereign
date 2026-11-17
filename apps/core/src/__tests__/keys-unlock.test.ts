import { derivePassword } from '@sovereignfs/crypto/web';
import { describe, expect, it } from 'vitest';
import { KeyStore, memoryBackend } from '../keys/keystore';
import {
  addPasskeyWayIn,
  finishNewPassword,
  keptAccountKey,
  unlockWithPasskey,
  prepareNewPassword,
  unlockWithPassword,
  type VaultActions,
} from '../keys/unlock';

const instanceId = new Uint8Array(32).fill(5);
const quick = { version: 9, memoryBytes: 64 * 1024, passes: 1 };
const secretOf = async (password: string) =>
  (await derivePassword({ password, address: 'ada@example.com', instanceId, derivation: quick }))
    .secret;
const bytes = (n: number) => new Uint8Array(32).fill(n);
const b64 = (data: Uint8Array) => Buffer.from(data).toString('base64url');

/** The vault actions over one account kept in memory, and one session secret that can be changed to stand for a new session. */
function fakeVault() {
  let account:
    | {
        suite: number;
        unlockSalt: string;
        signingPublic: string;
        signingPrivate: string;
        kitConfirmed: boolean;
      }
    | undefined;
  const waysIn = new Map<string, { way: string; id: string; record: string; prfSalt?: string }>();
  const state = { session: b64(bytes(1)) as string | undefined };
  const actions: VaultActions = {
    read: async () => ({
      ok: true,
      value: { sub: 'ada', ...(account ? { account } : {}), waysIn: [...waysIn.values()] },
    }),
    setUp: async (made, ways) => {
      if (account) return { ok: false, error: 'exists' };
      account = { ...made, kitConfirmed: false };
      for (const way of ways) waysIn.set(`${way.way}:${way.id}`, way);
      return { ok: true, value: undefined };
    },
    putWayIn: async (way) => {
      waysIn.set(`${way.way}:${way.id}`, way);
      return { ok: true, value: undefined };
    },
    removeWayIn: async (way, id) => ({ ok: true, value: waysIn.delete(`${way}:${id}`) }),
    sessionSecret: async () => ({ ok: true, value: state.session }),
  };
  return { actions, state, waysIn: () => [...waysIn.values()], account: () => account };
}

describe('the key store (core-app §5.4)', () => {
  it('opens what it kept with the session’s secret, and nothing with another session’s', async () => {
    const store = new KeyStore(memoryBackend());
    await store.keep(bytes(7), bytes(1));
    expect(await store.open(bytes(1))).toEqual(bytes(7));
    expect(await store.open(bytes(2))).toBeUndefined();
    // A session that ended can never open it again, and it is gone.
    expect(await store.holds()).toBe(false);
  });

  it('keeps it wrapped twice: neither the device key alone nor the session’s secret alone opens it', async () => {
    const backend = memoryBackend();
    await new KeyStore(backend).keep(bytes(7), bytes(1));
    // Another browser has another device key, so the session's secret alone opens nothing.
    const kept = await backend.get('account');
    const elsewhere = memoryBackend();
    await elsewhere.set('account', kept);
    expect(await new KeyStore(elsewhere).open(bytes(1))).toBeUndefined();
  });

  it('forgets what it kept when told', async () => {
    const store = new KeyStore(memoryBackend());
    await store.keep(bytes(7), bytes(1));
    await store.forget();
    expect(await store.open(bytes(1))).toBeUndefined();
  });

  it('hands a secret over once, and not once it is too old', async () => {
    let now = 1_000;
    const store = new KeyStore(memoryBackend(), () => now);
    const secret = await secretOf('pw');
    await store.handOver(secret);
    expect(await store.takeHandOver()).toBe(secret);
    expect(await store.takeHandOver()).toBeUndefined();
    await store.handOver(secret);
    now += 11 * 60 * 1000;
    expect(await store.takeHandOver()).toBeUndefined();
  });
});

describe('setting up and unlocking with a password (core-app §5.3)', () => {
  it('sets up on the first sign-in, silently, and keeps the key for this session', async () => {
    const vault = fakeVault();
    const store = new KeyStore(memoryBackend());
    expect(await unlockWithPassword(await secretOf('pw'), vault.actions, store)).toBe('set-up');
    expect(vault.account()?.kitConfirmed).toBe(false);
    expect(vault.waysIn().map((w) => w.way)).toEqual(['password']);
    expect(await store.open(bytes(1))).toHaveLength(32);
  });

  it('unlocks a second browser with the password alone, to the same key', async () => {
    const vault = fakeVault();
    const first = new KeyStore(memoryBackend());
    await unlockWithPassword(await secretOf('pw'), vault.actions, first);
    const key = await first.open(bytes(1));
    vault.state.session = b64(bytes(2));
    const second = new KeyStore(memoryBackend());
    expect(await unlockWithPassword(await secretOf('pw'), vault.actions, second)).toBe('unlocked');
    expect(await second.open(bytes(2))).toEqual(key);
  });

  it('stays locked, and keeps nothing, for a password that does not open the keys (after a reset)', async () => {
    const vault = fakeVault();
    await unlockWithPassword(await secretOf('pw'), vault.actions, new KeyStore(memoryBackend()));
    const store = new KeyStore(memoryBackend());
    expect(await unlockWithPassword(await secretOf('another'), vault.actions, store)).toBe(
      'locked',
    );
    expect(await store.holds()).toBe(false);
  });

  it('keeps nothing when the session has no secret, and still sets up', async () => {
    const vault = fakeVault();
    vault.state.session = undefined;
    const store = new KeyStore(memoryBackend());
    expect(await unlockWithPassword(await secretOf('pw'), vault.actions, store)).toBe('set-up');
    expect(await store.holds()).toBe(false);
  });
});

describe('changing the password', () => {
  it('writes the new way in beside the old, and drops the old once the change is accepted', async () => {
    const vault = fakeVault();
    await unlockWithPassword(await secretOf('old'), vault.actions, new KeyStore(memoryBackend()));
    const prepared = await prepareNewPassword(
      await secretOf('old'),
      await secretOf('new'),
      vault.actions,
    );
    expect(prepared).toBeDefined();
    // Between the two steps both passwords open the keys.
    expect(vault.waysIn()).toHaveLength(2);
    expect(
      await unlockWithPassword(await secretOf('old'), vault.actions, new KeyStore(memoryBackend())),
    ).toBe('unlocked');
    expect(
      await unlockWithPassword(await secretOf('new'), vault.actions, new KeyStore(memoryBackend())),
    ).toBe('unlocked');
    await finishNewPassword(prepared as never, true, vault.actions);
    expect(vault.waysIn()).toHaveLength(1);
    expect(
      await unlockWithPassword(await secretOf('old'), vault.actions, new KeyStore(memoryBackend())),
    ).toBe('locked');
    expect(
      await unlockWithPassword(await secretOf('new'), vault.actions, new KeyStore(memoryBackend())),
    ).toBe('unlocked');
  });

  it('drops the new way in when the change is refused, and the old password still opens the keys', async () => {
    const vault = fakeVault();
    await unlockWithPassword(await secretOf('old'), vault.actions, new KeyStore(memoryBackend()));
    const prepared = await prepareNewPassword(
      await secretOf('old'),
      await secretOf('new'),
      vault.actions,
    );
    await finishNewPassword(prepared as never, false, vault.actions);
    expect(vault.waysIn()).toHaveLength(1);
    expect(
      await unlockWithPassword(await secretOf('old'), vault.actions, new KeyStore(memoryBackend())),
    ).toBe('unlocked');
  });

  it('touches nothing when the current password does not open the keys, or there are none', async () => {
    const vault = fakeVault();
    expect(
      await prepareNewPassword(await secretOf('a'), await secretOf('b'), vault.actions),
    ).toBeUndefined();
    await unlockWithPassword(await secretOf('old'), vault.actions, new KeyStore(memoryBackend()));
    expect(
      await prepareNewPassword(await secretOf('wrong'), await secretOf('b'), vault.actions),
    ).toBeUndefined();
    expect(vault.waysIn()).toHaveLength(1);
  });
});

describe('passkeys that unlock (core-app §5.5)', () => {
  async function unlockedBrowser() {
    const vault = fakeVault();
    const store = new KeyStore(memoryBackend());
    await unlockWithPassword(await secretOf('pw'), vault.actions, store);
    return { vault, store, key: await keptAccountKey(vault.actions, store) };
  }

  it('gives a passkey a way in from an unlocked browser, which opens the same key on another', async () => {
    const { vault, store, key } = await unlockedBrowser();
    expect(await addPasskeyWayIn('cred', bytes(9), vault.actions, store)).toBe(true);
    const way = vault.waysIn().find((w) => w.way === 'passkey');
    expect(way?.id).toBe('cred');
    expect(way?.prfSalt).toMatch(/^[A-Za-z0-9_-]{43}$/);
    // Nothing of the PRF output is stored: only the wrap and the salt.
    expect(JSON.stringify(vault.waysIn())).not.toContain(b64(bytes(9)));

    vault.state.session = b64(bytes(2));
    const elsewhere = new KeyStore(memoryBackend());
    expect(await unlockWithPasskey('cred', bytes(9), vault.actions, elsewhere)).toBe('unlocked');
    expect(await elsewhere.open(bytes(2))).toEqual(key);
  });

  it('makes a new salt for every passkey', async () => {
    const { vault, store } = await unlockedBrowser();
    await addPasskeyWayIn('one', bytes(9), vault.actions, store);
    await addPasskeyWayIn('two', bytes(9), vault.actions, store);
    const salts = vault.waysIn().flatMap((w) => (w.prfSalt ? [w.prfSalt] : []));
    expect(new Set(salts).size).toBe(2);
  });

  it('stays locked for a passkey with no way in, another passkey’s output, or another passkey’s way in', async () => {
    const { vault, store } = await unlockedBrowser();
    await addPasskeyWayIn('cred', bytes(9), vault.actions, store);
    const fresh = () => new KeyStore(memoryBackend());
    expect(await unlockWithPasskey('other', bytes(9), vault.actions, fresh())).toBe('locked');
    expect(await unlockWithPasskey('cred', bytes(8), vault.actions, fresh())).toBe('locked');
    expect(await unlockWithPasskey('cred', new Uint8Array(16), vault.actions, fresh())).toBe(
      'locked',
    );
    // A way in moved to another credential id does not open: the id is bound into the wrap.
    const way = vault.waysIn().find((w) => w.way === 'passkey');
    await vault.actions.putWayIn({
      way: 'passkey',
      id: 'moved',
      record: way?.record ?? '',
      prfSalt: way?.prfSalt ?? '',
    });
    expect(await unlockWithPasskey('moved', bytes(9), vault.actions, fresh())).toBe('locked');
  });

  it('gives no way in from a locked browser', async () => {
    const { vault } = await unlockedBrowser();
    expect(
      await addPasskeyWayIn('cred', bytes(9), vault.actions, new KeyStore(memoryBackend())),
    ).toBe(false);
    expect(vault.waysIn().some((w) => w.way === 'passkey')).toBe(false);
  });
});
