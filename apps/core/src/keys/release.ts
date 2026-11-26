import {
  importWrappingKey,
  openAccountSigningKey,
  openAppKey,
  sealRelease,
  type AppKeyActions,
  type KitActions,
} from '@sovereignfs/crypto/web';
import type { KeyStore } from './keystore';
import { keptAccountKey } from './unlock';

/**
 * Core's side of key release (core-app §5.7, RFC 0005 §4 steps 3 and 4), in the browser: with the account key this browser holds open,
 * the app key is opened (made, with the app's key pairs, the person's first time in the app), sealed to the asking page and signed.
 * And the recovery kit, shown there to someone who did not keep it when signing in (core-app §5.3).
 */

/** The vault actions release needs besides unlocking's. */
export interface ReleaseActions extends AppKeyActions, KitActions {}

export interface ReleaseRequest {
  readonly clientId: string;
  readonly returnTo: string;
  readonly request: string;
  readonly state: string;
}

/** Where to send the browser: the app's return address with the answer in the fragment, which no server receives. */
export type Released = { readonly url: string } | 'locked' | 'failed';

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
    appKey = await openAppKey(accountKey, sub, account.signingPrivate, target.clientId, actions);
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

/** The recovery kit (core-app §5.3): the shared routine's. */
export { keepKit, kitPending } from '@sovereignfs/crypto/web';
