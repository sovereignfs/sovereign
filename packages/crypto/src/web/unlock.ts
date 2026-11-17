import { fromBase64Url, toBase64Url } from './bytes.js';
import {
  createAccountSigningKey,
  createAppIdentity,
  openAccountSigningKey,
  publicKeyFrom,
  signAppKeys,
} from './identity.js';
import { kitKey, readKit } from './kit.js';
import type { KeyStore } from './keystore.js';
import { PASSKEY_BYTES, passkeyKey } from './passkey.js';
import { derivePassword, deriveUnlockKey, type WebKey } from './password.js';
import {
  accountWrapData,
  appKeyData,
  importWrappingKey,
  newKey,
  unwrapSecret,
  wrapSecret,
} from './records.js';
import { sealEscrowWrap } from './sharing.js';

/**
 * Setting up and unlocking a person's keys (core-app §5.3, §5.4; sdk §9.5). One routine for both hosts of a vault: core's pages, and
 * the pages of an app that runs with no core (RFC 0005 §4, last paragraph), each passing in the calls to its own server. It is fed by
 * whatever has just proved who the person is: a password the server has just accepted (at sign-up, sign-in, or after the second
 * step), a passphrase in an app whose sign-in is someone else's, and later a passkey or the kit. Nothing here is shown to the person:
 * signing in says nothing about keys, and a failure here never stops one. No call here sends a password, a passphrase or a key that
 * opens anything: only wrapped records, and the session secret is only ever read.
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
      waysIn: { way: string; id: string; record: string; prfSalt?: string }[];
      escrow?: { id: string; publicKey: string };
    }>
  >;
  setUp(
    account: { suite: number; unlockSalt: string; signingPublic: string; signingPrivate: string },
    waysIn: { way: 'password'; id: string; record: string }[],
  ): Promise<Result>;
  putWayIn(
    wayIn:
      | { way: 'password'; id: string; record: string }
      | { way: 'passkey'; id: string; record: string; prfSalt: string }
      | { way: 'escrow'; id: string; record: string },
  ): Promise<Result>;
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

/**
 * With escrow on (core-app §5.8), adds the escrow way in for the key in force when the account has none, so the owner can recover the
 * person's data offline. Called once the person has been told (the release page's notice), never silently.
 */
async function coverEscrow(
  read: {
    sub: string;
    waysIn: readonly { way: string; id: string }[];
    escrow?: { id: string; publicKey: string };
  },
  accountKey: Uint8Array,
  actions: VaultActions,
): Promise<void> {
  const escrow = read.escrow;
  if (!escrow) return;
  if (read.waysIn.some((wayIn) => wayIn.way === 'escrow' && wayIn.id === escrow.id)) return;
  const publicKey = fromBase64Url(escrow.publicKey);
  if (publicKey?.length !== 32) return;
  try {
    const record = await sealEscrowWrap({
      accountKey,
      sub: read.sub,
      escrowKeyId: escrow.id,
      escrowPublicKey: publicKey,
    });
    await actions.putWayIn({ way: 'escrow', id: escrow.id, record: JSON.stringify(record) });
  } catch {
    // The next unlock tries again.
  }
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

/** The account key this browser kept for this session, or `undefined` when it is locked. The caller overwrites the bytes. */
export async function keptAccountKey(
  actions: VaultActions,
  store: KeyStore,
): Promise<Uint8Array | undefined> {
  if (!(await store.holds())) return undefined;
  const secret = await actions.sessionSecret();
  const bytes = secret.ok && secret.value ? fromBase64Url(secret.value) : undefined;
  return bytes?.length === 32 ? store.open(bytes) : undefined;
}

/**
 * After a passkey answered the PRF extension (core-app §5.5): opens the account key with that passkey's way in and keeps it for this
 * session. `'locked'` when the passkey has no way in (added before it could unlock, or one that does not answer the extension), or its
 * way in does not open: the person is asked for the password when something needs unlocking.
 */
export async function unlockWithPasskey(
  credentialId: string,
  prfOutput: Uint8Array,
  actions: VaultActions,
  store: KeyStore,
): Promise<Exclude<Unlocked, 'set-up'>> {
  if (prfOutput.length !== PASSKEY_BYTES) return 'locked';
  const read = await actions.read();
  if (!read.ok || !read.value.account) return 'locked';
  const { sub, waysIn } = read.value;
  const wayIn = waysIn.find((each) => each.way === 'passkey' && each.id === credentialId);
  const salt = wayIn?.prfSalt ? fromBase64Url(wayIn.prfSalt) : undefined;
  if (!wayIn || salt?.length !== PASSKEY_BYTES) return 'locked';
  let accountKey: Uint8Array;
  try {
    accountKey = await unwrapSecret(
      await passkeyKey(prfOutput, salt),
      JSON.parse(wayIn.record),
      accountWrapData(sub, 'passkey', credentialId),
    );
  } catch {
    return 'locked';
  }
  try {
    await keepFor(actions, store, accountKey);
    return 'unlocked';
  } finally {
    accountKey.fill(0);
  }
}

/**
 * Unlocks with the recovery kit (core-app §5.3): after a reset, or a recovery through escrow, when the password no longer opens the
 * keys. The kit opens the account key, the browser keeps it, and the password the person signs in with now gets its way in in place of
 * the ones that no longer open, so the password unlocks again from then on. `'mistyped'` for a kit that is not well formed, `'locked'`
 * for one that is not this account's.
 */
export async function unlockWithKit(
  typed: string,
  password: WebKey,
  actions: VaultActions,
  store: KeyStore,
): Promise<'unlocked' | 'locked' | 'mistyped'> {
  const kit = await readKit(typed);
  if (!kit.ok) return 'mistyped';
  const read = await actions.read();
  if (!read.ok || !read.value.account) return 'locked';
  const { sub, account, waysIn } = read.value;
  const wayIn = waysIn.find((each) => each.way === 'kit');
  if (!wayIn) return 'locked';
  let accountKey: Uint8Array;
  try {
    accountKey = await unwrapSecret(
      await kitKey(kit.kit),
      JSON.parse(wayIn.record),
      accountWrapData(sub, 'kit'),
    );
  } catch {
    return 'locked';
  } finally {
    kit.kit.fill(0);
  }
  try {
    const salt = fromBase64Url(account.unlockSalt);
    if (salt?.length === 32) {
      const id = randomId();
      const record = await wrapSecret(
        await deriveUnlockKey(password, salt),
        accountKey,
        accountWrapData(sub, 'password', id),
      );
      const put = await actions.putWayIn({ way: 'password', id, record: JSON.stringify(record) });
      if (put.ok) {
        for (const old of waysIn.filter((each) => each.way === 'password')) {
          await actions.removeWayIn('password', old.id);
        }
      }
    }
    await keepFor(actions, store, accountKey);
    return 'unlocked';
  } finally {
    accountKey.fill(0);
  }
}

/**
 * Gives a passkey its way in (core-app §5.5): the account key, kept by this browser, wrapped by a key from the passkey's PRF output
 * and a salt made for it. `false` when this browser is locked, so there is no account key to wrap.
 */
export async function addPasskeyWayIn(
  credentialId: string,
  prfOutput: Uint8Array,
  actions: VaultActions,
  store: KeyStore,
): Promise<boolean> {
  if (prfOutput.length !== PASSKEY_BYTES) return false;
  const read = await actions.read();
  if (!read.ok || !read.value.account) return false;
  const accountKey = await keptAccountKey(actions, store);
  if (!accountKey) return false;
  try {
    const salt = crypto.getRandomValues(new Uint8Array(PASSKEY_BYTES));
    const record = await wrapSecret(
      await passkeyKey(prfOutput, salt),
      accountKey,
      accountWrapData(read.value.sub, 'passkey', credentialId),
    );
    const put = await actions.putWayIn({
      way: 'passkey',
      id: credentialId,
      record: JSON.stringify(record),
      prfSalt: toBase64Url(salt),
    });
    return put.ok;
  } finally {
    accountKey.fill(0);
  }
}

/** Whether escrow is on and this account has no escrow way in for the key in force: the person is to be told, then covered. */
export async function escrowPending(actions: VaultActions): Promise<boolean> {
  const read = await actions.read();
  if (!read.ok || !read.value.account || !read.value.escrow) return false;
  const id = read.value.escrow.id;
  return !read.value.waysIn.some((wayIn) => wayIn.way === 'escrow' && wayIn.id === id);
}

/** Adds the escrow way in, with the account key this browser holds open. `false` when it is locked. */
export async function coverEscrowNow(actions: VaultActions, store: KeyStore): Promise<boolean> {
  const read = await actions.read();
  if (!read.ok || !read.value.account) return false;
  const accountKey = await keptAccountKey(actions, store);
  if (!accountKey) return false;
  try {
    await coverEscrow(read.value, accountKey, actions);
    return true;
  } finally {
    accountKey.fill(0);
  }
}

/** The calls opening an app key needs besides unlocking's: the account's record for one app, read, and written once. */
export interface AppKeyActions extends VaultActions {
  readApp(
    clientId: string,
  ): Promise<
    Result<{ clientId: string; appKey: string; identity: string; signature: string } | undefined>
  >;
  putApp(app: {
    clientId: string;
    appKey: string;
    identity: string;
    signature: string;
  }): Promise<Result>;
}

/** The call keeping the kit needs besides unlocking's: store the kit's way in and mark it kept, together. */
export interface KitActions extends VaultActions {
  confirmKit(record: string): Promise<Result>;
}

/** The app key's bytes, opened with the account key; made with the app's key pairs the first time. The caller overwrites them. */
export async function openAppKey(
  accountKey: Uint8Array,
  sub: string,
  signingRecord: string,
  clientId: string,
  actions: AppKeyActions,
): Promise<Uint8Array | undefined> {
  const wrapping = await importWrappingKey(accountKey);
  const found = await actions.readApp(clientId);
  if (!found.ok) return undefined;
  if (found.value) {
    return unwrapSecret(wrapping, JSON.parse(found.value.appKey), appKeyData(sub, clientId));
  }
  // The person's first time in this app: its key, its two key pairs, and the account's signature over their public halves.
  const appKey = newKey();
  const record = await wrapSecret(wrapping, appKey, appKeyData(sub, clientId));
  const identity = await createAppIdentity(await importWrappingKey(appKey), sub, clientId);
  const signing = await openAccountSigningKey(wrapping, JSON.parse(signingRecord), sub);
  const signature = await signAppKeys(signing, sub, clientId, {
    receive: publicKeyFrom(identity.receive.publicKey),
    sign: publicKeyFrom(identity.sign.publicKey),
  });
  const put = await actions.putApp({
    clientId,
    appKey: JSON.stringify(record),
    identity: JSON.stringify(identity),
    signature,
  });
  if (put.ok) return appKey;
  appKey.fill(0);
  // Made by another tab in the meantime: use that one.
  const again = await actions.readApp(clientId);
  return again.ok && again.value
    ? unwrapSecret(wrapping, JSON.parse(again.value.appKey), appKeyData(sub, clientId))
    : undefined;
}

/** Whether the person has still to keep their recovery kit: keys set up, kit not yet confirmed. */
export async function kitPending(actions: VaultActions): Promise<boolean> {
  const read = await actions.read();
  return read.ok && read.value.account !== undefined && !read.value.account.kitConfirmed;
}

/**
 * Gives the kit its way in and marks it kept, once the person has said they kept it (core-app §5.3). `kit` is the 32 bytes they were
 * shown. `false` when this browser is locked or the vault refused.
 */
export async function keepKit(
  kit: Uint8Array,
  actions: KitActions,
  store: KeyStore,
): Promise<boolean> {
  const read = await actions.read();
  if (!read.ok || !read.value.account) return false;
  const accountKey = await keptAccountKey(actions, store);
  if (!accountKey) return false;
  try {
    const record = await wrapSecret(
      await kitKey(kit),
      accountKey,
      accountWrapData(read.value.sub, 'kit'),
    );
    return (await actions.confirmKit(JSON.stringify(record))).ok;
  } finally {
    accountKey.fill(0);
  }
}

export interface DerivePassphraseInput {
  readonly passphrase: string;
  /** The person, as the app knows them: the `sub` its records are bound to. */
  readonly sub: string;
  /** The app's vault id, 32 bytes its server made once (sdk §9.5), standing where core's instance id stands. */
  readonly vaultId: Uint8Array;
}

/**
 * The secret a passphrase gives, in an app whose sign-in is someone else's (RFC 0003) and so has no password of its own: the password
 * derivation of RFC 0005 §1.1 over the passphrase, with the person's `sub` where the address goes. Its sign-in value is made and
 * dropped: nothing derived from a passphrase is sent. Give the secret to `unlockWithPassword`, which treats it as a password's.
 */
export async function derivePassphrase(input: DerivePassphraseInput): Promise<WebKey> {
  const derived = await derivePassword({
    password: input.passphrase,
    address: input.sub,
    instanceId: input.vaultId,
  });
  return derived.secret;
}
