import type { WebKey } from '@sovereignfs/crypto/web';
import {
  confirmKitAction,
  putAppKeysAction,
  putWayInAction,
  readAppKeysAction,
  readVaultAction,
  removeWayInAction,
  sessionSecretAction,
  setUpVaultAction,
} from '../../app/keys/actions';
import { indexedDbBackend, KeyStore } from './keystore';
import { localPasskeyCeremony } from './passkey';
import {
  keepKit,
  kitPending,
  releaseToApp,
  type ReleaseActions,
  type ReleaseRequest,
} from './release';
import {
  addPasskeyWayIn,
  coverEscrowNow,
  escrowPending,
  finishNewPassword,
  keptAccountKey,
  prepareNewPassword,
  unlockWithKit,
  unlockWithPasskey,
  unlockWithPassword,
  type PreparedChange,
  type VaultActions,
} from './unlock';

/**
 * Core's pages and the key vault, joined (core-app §5.3, §5.4): what a sign-in form, the second step, a password change and signing out
 * call. Browser only, and only in handlers. Nothing here ever stops what called it: keys that cannot be set up or opened now are
 * set up or opened later, and signing in says nothing about them.
 */

let store: KeyStore | undefined;
const keyStore = () => (store ??= new KeyStore(indexedDbBackend('sovereign-keys')));

const actions: VaultActions & ReleaseActions = {
  read: () => readVaultAction(),
  setUp: (account, waysIn) => setUpVaultAction(account, waysIn),
  putWayIn: (wayIn) => putWayInAction(wayIn),
  removeWayIn: (way, id) => removeWayInAction(way, id),
  sessionSecret: () => sessionSecretAction(),
  readApp: (clientId) => readAppKeysAction(clientId),
  putApp: (app) => putAppKeysAction(app),
  confirmKit: (record) => confirmKitAction(record),
};

const quietly = async <T>(run: () => Promise<T>): Promise<T | undefined> => {
  try {
    return await run();
  } catch {
    return undefined;
  }
};

/** After the server accepted a password and opened a session: set the keys up, or open them, and keep them for this session. */
export const afterPasswordAccepted = (secret: WebKey) =>
  quietly(() => unlockWithPassword(secret, actions, keyStore()));

/** The password was right but a second step is asked for: the secret waits for it, once. */
export const handOverSecret = (secret: WebKey) => quietly(() => keyStore().handOver(secret));

/** After the second step: unlock with the secret the password left, if it is there. */
export const afterSecondStep = () =>
  quietly(async () => {
    const secret = await keyStore().takeHandOver();
    return secret ? unlockWithPassword(secret, actions, keyStore()) : undefined;
  });

/** A sign-in page that loads again starts afresh: a hand-over nobody took is dropped. */
export const dropHandOver = () => quietly(() => keyStore().dropHandOver());

/** Before a password change: the new password's way in, beside the old ones. */
export const beforePasswordChange = (current: WebKey, next: WebKey) =>
  quietly(() => prepareNewPassword(current, next, actions));

/** After it: the old ways in go if it was accepted, the new one if not. */
export const afterPasswordChange = (prepared: PreparedChange | undefined, accepted: boolean) =>
  prepared
    ? quietly(() => finishNewPassword(prepared, accepted, actions))
    : Promise.resolve(undefined);

/** Signing out: this browser forgets what it kept. */
export const forgetKeys = () => quietly(() => keyStore().forget());

/** After signing in with a passkey that answered the PRF extension: open the keys with its way in, if it has one (core-app §5.5). */
export const afterPasskeyAccepted = (credentialId: string, output: Uint8Array) =>
  quietly(() => unlockWithPasskey(credentialId, output, actions, keyStore()));

/** Whether this browser holds the person's keys open for this session. */
export const isUnlocked = async (): Promise<boolean> =>
  (await quietly(async () => {
    const key = await keptAccountKey(actions, keyStore());
    key?.fill(0);
    return key !== undefined;
  })) ?? false;

/** A passkey just added answered the extension: give it its way in, while this browser is unlocked. */
export const givePasskeyWayIn = (credentialId: string, output: Uint8Array) =>
  quietly(() => addPasskeyWayIn(credentialId, output, actions, keyStore()));

/**
 * Lets a passkey the person already has unlock: a ceremony with that passkey alone, whose answer is sent nowhere, then its way in.
 * `true` once it unlocks.
 */
export const letPasskeyUnlock = async (rpId: string, credentialId: string): Promise<boolean> =>
  (await quietly(async () => {
    const answer = await localPasskeyCeremony(rpId, [credentialId]);
    return answer?.credentialId === credentialId
      ? addPasskeyWayIn(credentialId, answer.output, actions, keyStore())
      : false;
  })) ?? false;

/** Unlocks a browser already signed in with any passkey that unlocks: a ceremony whose answer is sent nowhere (core-app §5.5). */
export const unlockWithAnyPasskey = async (rpId: string): Promise<boolean> =>
  (await quietly(async () => {
    const answer = await localPasskeyCeremony(rpId);
    if (!answer) return false;
    return (
      (await unlockWithPasskey(answer.credentialId, answer.output, actions, keyStore())) ===
      'unlocked'
    );
  })) ?? false;

/** Unlocks a browser already signed in with the password, asked for again (core-app §5.3). */
export const unlockWithPasswordAgain = async (secret: WebKey): Promise<boolean> =>
  (await quietly(async () => {
    const result = await unlockWithPassword(secret, actions, keyStore());
    return result === 'unlocked' || result === 'set-up';
  })) ?? false;

/** Releases an app's key to the page that asked (core-app §5.7). */
export const releaseKey = async (target: ReleaseRequest) =>
  (await quietly(() => releaseToApp(target, actions, keyStore()))) ?? 'failed';

/** Whether the person has still to keep their recovery kit. */
export const isKitPending = async () => (await quietly(() => kitPending(actions))) ?? false;

/** The kit was kept: give it its way in. */
export const kitKept = async (kit: Uint8Array) =>
  (await quietly(() => keepKit(kit, actions, keyStore()))) ?? false;

/** Unlocks with the recovery kit, and gives the password the person signed in with its way in again (core-app §5.3). */
export const unlockWithKitTyped = async (typed: string, password: WebKey) =>
  (await quietly(() => unlockWithKit(typed, password, actions, keyStore()))) ?? 'locked';

/** Whether the person is to be told escrow is on before their data is covered by it (core-app §5.8). */
export const isEscrowPending = async () => (await quietly(() => escrowPending(actions))) ?? false;

/** The person was told: add the escrow way in. */
export const escrowAccepted = async () =>
  (await quietly(() => coverEscrowNow(actions, keyStore()))) ?? false;
