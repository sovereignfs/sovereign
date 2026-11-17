/**
 * A passkey's way into the account key (core-app §5.5, RFC 0005 §1.2), through the WebAuthn PRF extension.
 *
 * - **The PRF input** is one per instance: SHA-256 of a label and the instance id. Signing in with a passkey is discoverable, so the
 *   page does not know whose passkey answers before it does, and WebAuthn takes inputs per credential (`evalByCredential`) only with a
 *   list of credentials. The output still differs for every passkey, since each holds its own secret.
 * - **The passkey's key** is HKDF of the PRF output with a salt of 32 random bytes made for that passkey and kept with its wrap, so no
 *   two passkeys, of one person or of two, share what goes into their key.
 *
 * The PRF output never leaves the browser: it is not sent with the WebAuthn answer, and only the wrap it makes is kept by core.
 */
import { concat, source, utf8 } from './bytes.js';
import type { WebKey } from './password.js';

const INPUT_LABEL = utf8('sovereign/1/passkey-prf');
const KEY_INFO = utf8('sovereign/1/passkey-unlock');

/** Bytes of a PRF output and of a passkey's salt. */
export const PASSKEY_BYTES = 32;

/** The PRF input every passkey of this instance is asked for: 32 bytes, the same for everyone, and not a secret. */
export async function passkeyPrfInput(instanceId: Uint8Array): Promise<Uint8Array> {
  return new Uint8Array(
    await crypto.subtle.digest('SHA-256', source(concat(INPUT_LABEL, instanceId))),
  );
}

/** The key a passkey wraps the account key with: AES-256-GCM, from HKDF of its PRF output and its salt, and not exportable. */
export async function passkeyKey(prfOutput: Uint8Array, salt: Uint8Array): Promise<WebKey> {
  if (prfOutput.length !== PASSKEY_BYTES) throw new TypeError('A PRF output is 32 bytes.');
  if (salt.length !== PASSKEY_BYTES) throw new TypeError('A passkey salt is 32 bytes.');
  const material = await crypto.subtle.importKey('raw', source(prfOutput), 'HKDF', false, [
    'deriveKey',
  ]);
  return crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: source(salt), info: source(KEY_INFO) },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}
