/**
 * The vault (core-app §5.3, RFC 0005 §3) and remembered keys (RFC 0005 §3.1, §4).
 *
 * The vault is only an interface here. Two hosts provide it: core, for a connected app (task 16.6), and an app's own database, for
 * an app that runs with no core (task 16.13). Both store the same records, so a person's keys can move from one to the other, and
 * neither can open any of them.
 */
import type { AppIdentity, WrappedPair } from './identity.js';
import type { WayIn, WrapRecord } from './records.js';
import type { SealedRecord } from './sharing.js';

/** What the vault holds for an account, once. */
export interface AccountKeys {
  readonly suite: 1;
  /** base64url, 32 bytes: the salt of the unlock key, given only to the account's own session. */
  readonly unlockSalt: string;
  /** The account's signing key: its public half, and its private half wrapped by the account key. */
  readonly signing: WrappedPair;
}

/** One way into the account key. */
export type WayInRecord =
  | {
      readonly way: Exclude<WayIn, 'passkey'>;
      readonly id: '';
      readonly record: WrapRecord;
    }
  | {
      readonly way: 'passkey';
      /** The passkey's credential id. */
      readonly id: string;
      /** base64url, 32 bytes: the PRF input made for this passkey, never shared with another. */
      readonly prfInput: string;
      readonly record: WrapRecord;
    }
  | {
      readonly way: 'escrow';
      /** Which escrow key it is sealed to. */
      readonly id: string;
      readonly record: SealedRecord;
    };

/** What the vault holds for an account in one app. */
export interface AppKeys {
  readonly clientId: string;
  /** The app key, wrapped by the account key. */
  readonly appKey: WrapRecord;
  /** The app's two key pairs, their private halves wrapped by the app key. */
  readonly identity: AppIdentity;
  /** The account's signature over the two public keys (`signAppKeys`). */
  readonly signature: string;
}

/**
 * A vault, as the account's own browser sees it: every call is for the account signed in, never one named in a request. Writes
 * that belong together are one call, applied whole or not at all.
 */
export interface Vault {
  /** The account's keys, or `undefined` before it is set up. */
  account(): Promise<AccountKeys | undefined>;
  /** Every way into the account key. */
  waysIn(): Promise<readonly WayInRecord[]>;
  /** The account's keys for one app, or `undefined` before the person first opens it. */
  app(clientId: string): Promise<AppKeys | undefined>;
  /** Sets the account up: its keys and its first ways in (the password and the kit), together. Refused if it is set up. */
  setUp(account: AccountKeys, waysIn: readonly WayInRecord[]): Promise<void>;
  /** Adds or replaces one way in. */
  putWayIn(wayIn: WayInRecord): Promise<void>;
  /** Removes one way in. */
  removeWayIn(way: WayInRecord['way'], id: string): Promise<void>;
  /** Stores the account's keys for an app, the first time it is opened. Refused if they exist. */
  putApp(app: AppKeys): Promise<void>;
}

/**
 * What an app's page remembers about the people it has seen: each one's account signing key, by `sub`. Kept in the browser, per
 * app and per instance. The page refuses a key that differs from the one it remembers until the person using it says to go on.
 */
export interface RememberedKeys {
  get(sub: string): Promise<string | undefined>;
  set(sub: string, signingKey: string): Promise<void>;
}

/** What remembering a key came to: seen for the first time (and remembered), the same as before, or changed (and not remembered). */
export type Remembered = 'first' | 'same' | 'changed';

/**
 * Remembers `signingKey` for `sub` if nothing is remembered yet, and says how it compares. A `changed` key is not stored: the
 * caller refuses what it signed until the person accepts it with `acceptChangedKey`.
 */
export async function rememberKey(
  store: RememberedKeys,
  sub: string,
  signingKey: string,
): Promise<Remembered> {
  const known = await store.get(sub);
  if (known === undefined) {
    await store.set(sub, signingKey);
    return 'first';
  }
  return known === signingKey ? 'same' : 'changed';
}

/** The person using the page has accepted a changed key for `sub`: remember it from now on. */
export const acceptChangedKey = (store: RememberedKeys, sub: string, signingKey: string) =>
  store.set(sub, signingKey);

/** Remembered keys in memory, for tests and for a page that keeps nothing. */
export function memoryRememberedKeys(): RememberedKeys {
  const keys = new Map<string, string>();
  return {
    get: async (sub) => keys.get(sub),
    set: async (sub, signingKey) => {
      keys.set(sub, signingKey);
    },
  };
}
