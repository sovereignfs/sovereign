import { fromBase64Url, passkeyPrfInput, PASSKEY_BYTES } from '@sovereignfs/crypto/web';
import type { AuthenticationExtensionsClientInputs } from '@better-auth/passkey/client';
import { readInstanceId } from '../auth/derive';

/**
 * The WebAuthn side of passkeys that unlock (core-app §5.5): the PRF extension every ceremony asks for, reading its result, and the
 * ceremony that unlocks a browser already signed in, whose answer is sent nowhere. Browser only, and only in handlers.
 *
 * better-auth's client takes `extensions`, removes their results from what it sends the server, and hands them back to the page when
 * asked (`returnWebAuthnResponse`): the PRF output never leaves the browser.
 */

/**
 * The `extensions` every passkey ceremony of core's pages asks for: the PRF of the instance's one input. Typed as better-auth's client
 * takes them, whose type (from SimpleWebAuthn) does not list `prf`; the browser receives them as they are.
 */
export async function prfExtension(): Promise<AuthenticationExtensionsClientInputs> {
  const input = await passkeyPrfInput(await readInstanceId());
  return { prf: { eval: { first: input } } } as unknown as AuthenticationExtensionsClientInputs;
}

/** The extension's output from a ceremony's results, when the passkey answered it: 32 bytes, or `undefined`. */
export function prfOutput(results: unknown): Uint8Array | undefined {
  const first = (results as { prf?: { results?: { first?: unknown } } } | undefined)?.prf?.results
    ?.first;
  const bytes =
    first instanceof ArrayBuffer
      ? new Uint8Array(first)
      : ArrayBuffer.isView(first)
        ? new Uint8Array(first.buffer, first.byteOffset, first.byteLength)
        : undefined;
  return bytes?.length === PASSKEY_BYTES ? new Uint8Array(bytes) : undefined;
}

/** Whether a registration's results say the passkey can answer the extension, though it gave no output yet. */
export function prfEnabled(results: unknown): boolean {
  return (results as { prf?: { enabled?: unknown } } | undefined)?.prf?.enabled === true;
}

/** The user-verified flag of WebAuthn's authenticator data: byte 32, bit 2. */
const USER_VERIFIED = 0x04;

/**
 * A passkey ceremony run for this page alone: no server sees its answer, so the page checks for itself that the passkey was unlocked
 * on the device (core-app §3.4.2), as core's hooks do for every answer sent to it. `credentialIds` limits it to those passkeys; with
 * none, the person picks any of theirs. `undefined` when it was cancelled, was not user-verified, or gave no PRF output.
 */
export async function localPasskeyCeremony(
  rpId: string,
  credentialIds: readonly string[] = [],
): Promise<{ credentialId: string; output: Uint8Array } | undefined> {
  const extensions = await prfExtension();
  let credential: PublicKeyCredential | null;
  try {
    credential = (await navigator.credentials.get({
      publicKey: {
        rpId,
        challenge: crypto.getRandomValues(new Uint8Array(32)),
        userVerification: 'required',
        allowCredentials: credentialIds.flatMap((id) => {
          const raw = fromBase64Url(id);
          return raw ? [{ type: 'public-key' as const, id: raw as Uint8Array<ArrayBuffer> }] : [];
        }),
        extensions: extensions as unknown as globalThis.AuthenticationExtensionsClientInputs,
        timeout: 60_000,
      },
    })) as PublicKeyCredential | null;
  } catch {
    return undefined;
  }
  if (!credential) return undefined;
  const response = credential.response as AuthenticatorAssertionResponse;
  const flags = new Uint8Array(response.authenticatorData)[32] ?? 0;
  if ((flags & USER_VERIFIED) === 0) return undefined;
  const output = prfOutput(credential.getClientExtensionResults());
  return output ? { credentialId: credential.id, output } : undefined;
}
