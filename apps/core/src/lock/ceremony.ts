import { fromBase64Url, toBase64Url } from '@sovereignfs/crypto/web';
import { prfExtension, prfOutput } from '../keys/passkey';
import type { PasskeyRequest } from './passkey';

/**
 * The browser's side of checking a passkey for the session it is in (`src/lock/passkey.ts`): the challenge core gave, the account's own
 * passkeys, the person verified, and the PRF extension, whose output stays in the browser and reopens the keys (core-app §5.5). Browser
 * only, and only in a handler, after a tap (RFC 0006 B4).
 *
 * `undefined` when it was cancelled or the browser refused; the answer is checked by the server, never here.
 */
export async function askForPasskey(
  request: PasskeyRequest,
): Promise<{ answer: unknown; credentialId: string; output: Uint8Array | undefined } | undefined> {
  const challenge = fromBase64Url(request.challenge);
  if (!challenge) return undefined;
  const extensions = await prfExtension().catch(() => undefined);
  let credential: PublicKeyCredential | null;
  try {
    credential = (await navigator.credentials.get({
      publicKey: {
        rpId: request.rpId,
        challenge: challenge as Uint8Array<ArrayBuffer>,
        userVerification: 'required',
        allowCredentials: request.credentialIds.flatMap((id) => {
          const raw = fromBase64Url(id);
          return raw ? [{ type: 'public-key' as const, id: raw as Uint8Array<ArrayBuffer> }] : [];
        }),
        ...(extensions
          ? { extensions: extensions as unknown as globalThis.AuthenticationExtensionsClientInputs }
          : {}),
        timeout: 60_000,
      },
    })) as PublicKeyCredential | null;
  } catch {
    return undefined;
  }
  if (!credential) return undefined;
  const response = credential.response as AuthenticatorAssertionResponse;
  const bytes = (buffer: ArrayBuffer) => toBase64Url(new Uint8Array(buffer));
  return {
    answer: {
      id: credential.id,
      rawId: bytes(credential.rawId),
      type: credential.type,
      response: {
        clientDataJSON: bytes(response.clientDataJSON),
        authenticatorData: bytes(response.authenticatorData),
        signature: bytes(response.signature),
        ...(response.userHandle ? { userHandle: bytes(response.userHandle) } : {}),
      },
    },
    credentialId: credential.id,
    output: prfOutput(credential.getClientExtensionResults()),
  };
}
