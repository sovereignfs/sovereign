import {
  accountWrapData,
  appKeyData,
  createAppIdentity,
  importWrappingKey,
  kitKey,
  newKey,
  openAccountSigningKey,
  publicKeyFrom,
  sealRelease,
  signAppKeys,
  unwrapSecret,
  wrapSecret,
} from '@sovereignfs/crypto/web';
import type { KeyStore } from './keystore';
import { keptAccountKey, type VaultActions } from './unlock';

/**
 * Core's side of key release (core-app §5.7, RFC 0005 §4 steps 3 and 4), in the browser: with the account key this browser holds open,
 * the app key is opened (made, with the app's key pairs, the person's first time in the app), sealed to the asking page and signed.
 * And the recovery kit, shown at the first encrypted app (core-app §5.3).
 */

type Result<T = undefined> = { ok: true; value: T } | { ok: false; error: string };

/** The vault actions release needs besides unlocking's. */
export interface ReleaseActions extends VaultActions {
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
  confirmKit(record: string): Promise<Result>;
}

export interface ReleaseRequest {
  readonly clientId: string;
  readonly returnTo: string;
  readonly request: string;
  readonly state: string;
}

/** Where to send the browser: the app's return address with the answer in the fragment, which no server receives. */
export type Released = { readonly url: string } | 'locked' | 'failed';

/** The app key's bytes, opened with the account key; made with the app's key pairs the first time. The caller overwrites them. */
async function appKeyFor(
  accountKey: Uint8Array,
  sub: string,
  signingRecord: string,
  clientId: string,
  actions: ReleaseActions,
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

/** Releases the app key to the page that asked. `'locked'` when this browser holds no account key: unlock first. */
export async function releaseToApp(
  target: ReleaseRequest,
  actions: ReleaseActions,
  store: KeyStore,
): Promise<Released> {
  const read = await actions.read();
  if (!read.ok || !read.value.account) return 'locked';
  const { sub, account } = read.value;
  const accountKey = await keptAccountKey(actions, store);
  if (!accountKey) return 'locked';
  let appKey: Uint8Array | undefined;
  try {
    appKey = await appKeyFor(accountKey, sub, account.signingPrivate, target.clientId, actions);
    if (!appKey) return 'failed';
    const signingKey = await openAccountSigningKey(
      await importWrappingKey(accountKey),
      JSON.parse(account.signingPrivate),
      sub,
    );
    const answer = await sealRelease({
      target: { clientId: target.clientId, returnTo: target.returnTo, state: target.state },
      request: target.request,
      appKey,
      sub,
      signingKey,
      signingPublic: account.signingPublic,
    });
    const fragment = new URLSearchParams({
      sv_key: answer.key,
      sv_sig: answer.sig,
      state: target.state,
    });
    return { url: `${target.returnTo.split('#')[0]}#${fragment.toString()}` };
  } catch {
    return 'failed';
  } finally {
    accountKey.fill(0);
    appKey?.fill(0);
  }
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
  actions: ReleaseActions,
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
