import { createSovereign, type Sovereign } from '@sovereignfs/sdk';
import { sessionStore, tokenStore } from './stores';

let client: Sovereign | undefined;

/**
 * The one client for this process. It reads __PREFIX___URL, __PREFIX___CORE_URL, __PREFIX___CORE_CLIENT_ID and __PREFIX___CORE_CLIENT_SECRET,
 * makes no call to core, and is made when first used, so building the app needs none of them.
 *
 * A person's session here is checked against core every hour: the next page they open after that goes through core, which shows
 * nothing while they are still signed in there and asks them to sign in when they are not, and brings their name and roles up to date.
 */
export function sovereign(): Sovereign {
  client ??= createSovereign({
    prefix: '__PREFIX__',
    sessionStore,
    tokenStore,
    checkEverySeconds: 60 * 60,
  });
  return client;
}
