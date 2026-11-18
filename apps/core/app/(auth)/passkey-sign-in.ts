'use client';

import { authClient } from '../../src/auth/client';
import { prfExtension, prfOutput } from '../../src/keys/passkey';
import { afterPasskeyAccepted } from '../../src/keys/session';

type Refusal = { status: number; code?: string; message?: string };

/**
 * Signing in with a passkey, the same on the sign-in page and on its second step: the PRF extension is
 * asked for, so the same touch unlocks the person's keys (core-app §5.5); better-auth's client keeps its
 * output from the server. A page that cannot read the instance document still signs in, without it, and
 * so does a passkey that does not answer it, with the keys left locked.
 *
 * What comes back is the provider's answer (`continuationUrl` reads where an app's sign-in goes next), or
 * the refusal.
 */
export async function signInWithPasskey(): Promise<
  { error: Refusal; data?: undefined } | { error?: undefined; data: unknown }
> {
  const extensions = await prfExtension().catch(() => undefined);
  const result = await authClient.signIn.passkey({
    ...(extensions ? { extensions } : {}),
    returnWebAuthnResponse: true,
  });
  if (result?.error) return { error: result.error };
  if ('webauthn' in result) {
    const output = prfOutput(result.webauthn.clientExtensionResults);
    if (output) await afterPasskeyAccepted(result.webauthn.response.id, output);
  }
  return { data: result?.data };
}
