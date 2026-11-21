import { createSovereign, type Sovereign } from '@sovereignfs/sdk';
import { sessionStore, tokenStore } from './stores';

let client: Sovereign | undefined;

/**
 * The one client for this process, when the app signs people in through core. It reads __PREFIX___URL, __PREFIX___CORE_URL,
 * __PREFIX___CORE_CLIENT_ID and __PREFIX___CORE_CLIENT_SECRET, makes no call to core, and is made when first used, so building the app
 * needs none of them. Signing in through core is `@sovereignfs/auth/core` on it; the session is the app's own (lib/sign-in.ts), and a
 * session from core is checked against it every hour (lib/session.ts).
 */
export function sovereign(): Sovereign {
  client ??= createSovereign({
    prefix: '__PREFIX__',
    // The addresses `@sovereignfs/auth/core` answers at (auth.md §8); the pending sign-in stays in the SDK's store.
    redirectPath: '/api/auth/callback/sovereign',
    postLogoutPath: '/sign-in',
    sessionStore,
    tokenStore,
  });
  return client;
}
