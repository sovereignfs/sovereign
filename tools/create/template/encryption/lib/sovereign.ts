import { createSovereign, type Sovereign } from '@sovereignfs/sdk';
import { sessionStore, tokenStore } from './stores';

let client: Sovereign | undefined;

/**
 * The one client for this process. It reads __PREFIX___URL, __PREFIX___CORE_URL, __PREFIX___CORE_CLIENT_ID and __PREFIX___CORE_CLIENT_SECRET,
 * makes no call to core, and is made when first used, so building the app needs none of them.
 *
 * It asks for `directory`, to find people to share a note with, and `keys`, for their public keys and the person's own (sdk §8). Core
 * grants `keys` only to an app the operator allowed to use encryption (`encryption` in the manifest).
 */
export function sovereign(): Sovereign {
  client ??= createSovereign({
    prefix: '__PREFIX__',
    sessionStore,
    tokenStore,
    scopes: ['openid', 'profile', 'email', 'offline_access', 'directory', 'keys'],
  });
  return client;
}
