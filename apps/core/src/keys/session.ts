import type { WebKey } from '@sovereignfs/crypto/web';
import {
  putWayInAction,
  readVaultAction,
  removeWayInAction,
  sessionSecretAction,
  setUpVaultAction,
} from '../../app/keys/actions';
import { indexedDbBackend, KeyStore } from './keystore';
import {
  finishNewPassword,
  prepareNewPassword,
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
const keyStore = () => (store ??= new KeyStore(indexedDbBackend()));

const actions: VaultActions = {
  read: () => readVaultAction(),
  setUp: (account, waysIn) => setUpVaultAction(account, waysIn),
  putWayIn: (wayIn) => putWayInAction(wayIn),
  removeWayIn: (way, id) => removeWayInAction(way, id),
  sessionSecret: () => sessionSecretAction(),
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
