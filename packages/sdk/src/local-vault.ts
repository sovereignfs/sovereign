/**
 * `localVault()` — the keys of an app that runs with no core, in its pages (sdk §9.5, RFC 0005 §4's last paragraph). Browser only,
 * the SDK's `@sovereignfs/sdk/local-vault` entry, apart from `/keys` so that an app that gets its key from core never loads the password
 * derivation (Argon2id, libsodium's WebAssembly). There is no key release: the page unlocks the app's own vault at the app's own sign-in, with
 * the routine core's pages use (`@sovereignfs/crypto/web`), and keeps the account key until the app's session ends (RFC 0005 §5).
 *
 * The app's server answers two routes: `vaultRoute` from `@sovereignfs/sdk/vault` (`/auth/vault`), and the session's secret
 * (`/auth/key-secret`, `{ sub, secret }`), which it keeps with its own session. Neither ever receives a password, a passphrase or
 * a key that opens anything.
 */
import {
  derivePassphrase,
  derivePassword,
  finishNewPassword,
  fromBase64Url,
  importWrappingKey,
  indexedDbBackend,
  INSTANCE_ID_BYTES,
  keepKit,
  keptAccountKey,
  kitPending,
  KeyStore,
  openAppKey,
  prepareNewPassword,
  unlockWithKit,
  unlockWithPassword,
  type AppKeyActions,
  type DerivedPassword,
  type KeyStoreBackend,
  type KitActions,
  type PreparedChange,
  type Unlocked,
  type WebKey,
} from '@sovereignfs/crypto/web';
import type { Opened } from './keys.js';

export type LocalVaultOptions = {
  /** The id the app's records are bound to in place of a client id at core: the manifest's `prefix`. */
  clientId: string;
  /** The vault id, base64url, which the app's server renders into the page (`await vault.vaultId()`). */
  vaultId: string;
  /** Where the app's server answers `vaultRoute`. `/auth/vault` unless changed. */
  path?: string;
  /** Where the app's server answers with the session's secret. `/auth/key-secret` unless changed. */
  secretPath?: string;
  /** For tests: where things are kept, and the network. */
  backend?: KeyStoreBackend;
  fetch?: typeof fetch;
};

type Result<T = undefined> = { ok: true; value: T } | { ok: false; error: string };

export function localVault(options: LocalVaultOptions) {
  const vaultId = fromBase64Url(options.vaultId);
  if (vaultId?.length !== INSTANCE_ID_BYTES) {
    throw new TypeError(`A vault id is ${INSTANCE_ID_BYTES} bytes of base64url.`);
  }
  const store = new KeyStore(options.backend ?? indexedDbBackend('sovereign-local-vault'));
  const http = options.fetch ?? ((input, init) => globalThis.fetch(input, init));
  const path = options.path ?? '/auth/vault';
  const failed = (error: unknown): { ok: false; error: string } => ({
    ok: false,
    error: error instanceof Error ? error.message : 'The vault did not answer.',
  });

  async function call<T>(init?: RequestInit, query = ''): Promise<Result<T>> {
    try {
      const response = await http(`${path}${query}`, {
        credentials: 'same-origin',
        cache: 'no-store',
        ...init,
      });
      const body = (await response.json()) as Result<T>;
      return response.ok && body.ok
        ? body
        : { ok: false, error: body.ok ? 'Refused.' : body.error };
    } catch (error) {
      return failed(error);
    }
  }
  const change = <T = undefined>(body: unknown) =>
    call<T>({
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });

  /** The calls the shared routine makes, over the app's two routes. */
  const actions: AppKeyActions & KitActions = {
    read: () => call(),
    setUp: (account, waysIn) => change({ op: 'set-up', account, waysIn }),
    putWayIn: (wayIn) => change({ op: 'put-way-in', wayIn }),
    removeWayIn: (_way, id) => change<boolean>({ op: 'remove-way-in', way: 'password', id }),
    async sessionSecret() {
      try {
        const response = await http(options.secretPath ?? '/auth/key-secret', {
          credentials: 'same-origin',
          cache: 'no-store',
        });
        if (!response.ok) return { ok: true, value: undefined };
        const body = (await response.json()) as { secret?: unknown };
        return { ok: true, value: typeof body.secret === 'string' ? body.secret : undefined };
      } catch (error) {
        return failed(error);
      }
    },
    readApp: async (clientId) => {
      const found = await call<AppRecord | null>(undefined, `?app=${encodeURIComponent(clientId)}`);
      return found.ok ? { ok: true, value: found.value ?? undefined } : found;
    },
    putApp: (app) => change({ op: 'put-app', app }),
    confirmKit: (record) => change({ op: 'confirm-kit', record }),
  };

  return {
    /**
     * On the app's own sign-in and sign-up forms: what the password derives to. Send `signIn` where the password went, and once the
     * server accepts it give `secret` to `afterSignIn`. The password itself goes nowhere.
     */
    derive: (password: string, address: string): Promise<DerivedPassword> =>
      derivePassword({ password, address, instanceId: vaultId }),

    /** After the app's server accepted the sign-in value: sets the person's keys up, or opens them, and keeps them for the session. */
    afterSignIn: (secret: WebKey): Promise<Unlocked> => unlockWithPassword(secret, actions, store),

    /**
     * In an app whose sign-in is someone else's (RFC 0003): unlocks with a passphrase, kept as the password's way in, the first time
     * setting the keys up with it. `sub` is the person as the app's session names them. Nothing derived from it is sent.
     */
    async unlockWithPassphrase(passphrase: string, sub: string): Promise<Unlocked> {
      return unlockWithPassword(
        await derivePassphrase({ passphrase, sub, vaultId }),
        actions,
        store,
      );
    },

    /**
     * With the recovery kit, when the password (or passphrase) no longer opens the keys. `secret` is the one the person signs in
     * (or unlocks) with now, which gets its way in again.
     */
    unlockWithKit: (typed: string, secret: WebKey) => unlockWithKit(typed, secret, actions, store),

    /** The secret a passphrase gives, for `unlockWithKit` and a passphrase change. */
    passphraseSecret: (passphrase: string, sub: string): Promise<WebKey> =>
      derivePassphrase({ passphrase, sub, vaultId }),

    /** Whether the person has still to keep their kit: show `RecoveryKit` until they have. */
    kitPending: () => kitPending(actions),

    /** Gives the kit its way in, once the person said they kept the 32 bytes they were shown (`formatKit`). */
    keepKit: (kit: Uint8Array) => keepKit(kit, actions, store),

    /** Before a password (or passphrase) change, and after it: the new way in beside the old, then the old dropped. */
    prepareChange: (current: WebKey, next: WebKey) => prepareNewPassword(current, next, actions),
    finishChange: (prepared: PreparedChange, accepted: boolean) =>
      finishNewPassword(prepared, accepted, actions),

    /**
     * The app key, while this browser holds the account key for this session (made, with the app's key pairs, the first time).
     * Locked otherwise: show `LockedState`, whose action asks for the password or passphrase again.
     */
    async open(): Promise<Opened> {
      const read = await actions.read();
      if (!read.ok || !read.value.account) return { state: 'locked' };
      const accountKey = await keptAccountKey(actions, store);
      if (!accountKey) {
        const secret = await actions.sessionSecret();
        if (secret.ok && !secret.value) await store.forget();
        return { state: 'locked' };
      }
      let appKey: Uint8Array | undefined;
      try {
        appKey = await openAppKey(
          accountKey,
          read.value.sub,
          read.value.account.signingPrivate,
          options.clientId,
          actions,
        );
        if (!appKey) return { state: 'locked' };
        return { state: 'open', key: await importWrappingKey(appKey) };
      } finally {
        accountKey.fill(0);
        appKey?.fill(0);
      }
    },

    /** Forgets the kept account key: signing out of the app. */
    forget: () => store.forget(),
  };
}

type AppRecord = { clientId: string; appKey: string; identity: string; signature: string };

export type LocalVault = ReturnType<typeof localVault>;
