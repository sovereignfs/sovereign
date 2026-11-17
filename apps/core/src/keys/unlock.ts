import {
  accountWrapData,
  createAccountSigningKey,
  deriveUnlockKey,
  fromBase64Url,
  importWrappingKey,
  newKey,
  toBase64Url,
  unwrapSecret,
  wrapSecret,
  type WebKey,
} from '@sovereignfs/crypto/web';
import type { KeyStore } from './keystore';

/**
 * Setting up and unlocking a person's keys in core's pages (core-app §5.3, §5.4). One routine, fed by whatever has just proved who the
 * person is: a password the server has just accepted (at sign-up, sign-in, or after the second step), and later a passkey or the kit.
 * Nothing here is shown to the person: signing in says nothing about keys, and a failure here never stops one.
 */

type Result<T = undefined> = { ok: true; value: T } | { ok: false; error: string };

/** The server actions this needs, passed in so a test can stand in for them. */
export interface VaultActions {
  read(): Promise<
    Result<{
      sub: string;
      account?: {
        suite: number;
        unlockSalt: string;
        signingPublic: string;
        signingPrivate: string;
        kitConfirmed: boolean;
      };
      waysIn: { way: string; id: string; record: string; prfInput?: string }[];
    }>
  >;
  setUp(
    account: { suite: number; unlockSalt: string; signingPublic: string; signingPrivate: string },
    waysIn: { way: 'password'; id: string; record: string }[],
  ): Promise<Result>;
  putWayIn(wayIn: { way: 'password'; id: string; record: string }): Promise<Result>;
  removeWayIn(way: 'password', id: string): Promise<Result<boolean>>;
  sessionSecret(): Promise<Result<string | undefined>>;
}

/** What unlocking came to: keys made now, keys opened, or keys that this password does not open (a reset: the kit will). */
export type Unlocked = 'set-up' | 'unlocked' | 'locked';

const randomId = () => toBase64Url(crypto.getRandomValues(new Uint8Array(12)));

/** Keeps the account key for this session, when the session has a secret to keep it with. */
async function keepFor(
  actions: VaultActions,
  store: KeyStore,
  accountKey: Uint8Array,
): Promise<void> {
  const secret = await actions.sessionSecret();
  const bytes = secret.ok && secret.value ? fromBase64Url(secret.value) : undefined;
  if (bytes?.length === 32) await store.keep(accountKey, bytes);
}

/** Opens the account key with a password's unlock key, trying each password way in (two while a change is under way). */
async function openWithPassword(
  unlock: WebKey,
  sub: string,
  waysIn: readonly { way: string; id: string; record: string }[],
): Promise<Uint8Array | undefined> {
  for (const wayIn of waysIn.filter((each) => each.way === 'password')) {
    try {
      return await unwrapSecret(
        unlock,
        JSON.parse(wayIn.record),
        accountWrapData(sub, 'password', wayIn.id),
      );
    } catch {
      // Another password's wrap, or a stale one after a reset: try the next.
    }
  }
  return undefined;
}

/**
 * After the server accepted a password: sets the person's keys up when there are none, or opens them, and keeps them unlocked for
 * this session. `secret` is the password's secret from the derivation; the server never saw it.
 */
export async function unlockWithPassword(
  secret: WebKey,
  actions: VaultActions,
  store: KeyStore,
): Promise<Unlocked> {
  const read = await actions.read();
  if (!read.ok) return 'locked';
  const { sub, account, waysIn } = read.value;

  if (!account) {
    const accountKey = newKey();
    try {
      const salt = crypto.getRandomValues(new Uint8Array(32));
      const unlock = await deriveUnlockKey(secret, salt);
      const id = randomId();
      const record = await wrapSecret(unlock, accountKey, accountWrapData(sub, 'password', id));
      const signing = await createAccountSigningKey(await importWrappingKey(accountKey), sub);
      const made = await actions.setUp(
        {
          suite: 1,
          unlockSalt: toBase64Url(salt),
          signingPublic: signing.publicKey,
          signingPrivate: JSON.stringify(signing.privateKey),
        },
        [{ way: 'password', id, record: JSON.stringify(record) }],
      );
      if (!made.ok) {
        // Set up by another tab in the meantime: open what that one made instead.
        const again = await actions.read();
        return again.ok && again.value.account
          ? unlockWithPassword(secret, actions, store)
          : 'locked';
      }
      await keepFor(actions, store, accountKey);
      return 'set-up';
    } finally {
      accountKey.fill(0);
    }
  }

  const salt = fromBase64Url(account.unlockSalt);
  if (salt?.length !== 32) return 'locked';
  const accountKey = await openWithPassword(await deriveUnlockKey(secret, salt), sub, waysIn);
  if (!accountKey) return 'locked';
  try {
    await keepFor(actions, store, accountKey);
    return 'unlocked';
  } finally {
    accountKey.fill(0);
  }
}

/** A password change under way: the new password's way in, written beside the old ones, which go once the change is accepted. */
export interface PreparedChange {
  readonly added: string;
  readonly previous: readonly string[];
}

/**
 * Before changing the password: opens the account key with the current password and writes a way in for the new one beside the old
 * (core-app §5.3). The two can never disagree with the password: until the change is accepted the old wraps open with the old
 * password, and after it the new one opens with the new. `undefined` when there are no keys, or the current password does not open
 * them; the change then goes ahead without touching the keys.
 */
export async function prepareNewPassword(
  current: WebKey,
  next: WebKey,
  actions: VaultActions,
): Promise<PreparedChange | undefined> {
  const read = await actions.read();
  if (!read.ok || !read.value.account) return undefined;
  const { sub, account, waysIn } = read.value;
  const salt = fromBase64Url(account.unlockSalt);
  if (salt?.length !== 32) return undefined;
  const accountKey = await openWithPassword(await deriveUnlockKey(current, salt), sub, waysIn);
  if (!accountKey) return undefined;
  try {
    const id = randomId();
    const record = await wrapSecret(
      await deriveUnlockKey(next, salt),
      accountKey,
      accountWrapData(sub, 'password', id),
    );
    const put = await actions.putWayIn({ way: 'password', id, record: JSON.stringify(record) });
    if (!put.ok) return undefined;
    return {
      added: id,
      previous: waysIn.filter((wayIn) => wayIn.way === 'password').map((wayIn) => wayIn.id),
    };
  } finally {
    accountKey.fill(0);
  }
}

/** After the change: drops the old ways in when it was accepted, or the new one when it was not. */
export async function finishNewPassword(
  prepared: PreparedChange,
  accepted: boolean,
  actions: VaultActions,
): Promise<void> {
  const remove = accepted ? prepared.previous : [prepared.added];
  for (const id of remove) await actions.removeWayIn('password', id);
}
