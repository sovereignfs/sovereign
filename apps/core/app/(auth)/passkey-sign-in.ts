'use client';

import { signInWithPasskey as signIn } from '@sovereignfs/auth/client';
import { authClient } from '../../src/auth/client';
import { prfExtension, prfOutput } from '../../src/keys/passkey';
import { afterPasskeyAccepted } from '../../src/keys/session';

/**
 * Signing in with a passkey, the same on the sign-in page and on its second step: the sign-in package's (auth.md §7.2), with core's key
 * store, so the same touch unlocks the person's keys (core-app §5.5). What comes back is the provider's answer (`continuationUrl` reads
 * where an app's sign-in goes next), or the refusal.
 */
export function signInWithPasskey() {
  return signIn(authClient, {
    extension: prfExtension,
    output: (results) => prfOutput(results as never),
    accepted: async (id, output) => {
      await afterPasskeyAccepted(id, output);
    },
  });
}
