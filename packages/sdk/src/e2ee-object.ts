/**
 * Encrypt/decrypt helpers for plugin object content under a per-object Data
 * Encryption Key (DEK) (RFC 0060 step 4). Pure WebCrypto, browser-only in
 * practice (also runs in Node for testing). Callers are responsible for
 * generating the DEK (`generateDek` in `e2ee-crypto.ts`) and wrapping it
 * under the unlocked CMK (`wrapDekWithCmk`) before storing the wrapped DEK
 * alongside the ciphertext this module produces — this module only ever
 * touches the unwrapped DEK, never the CMK.
 *
 * Two shapes are covered, matching RFC 0060's plaintext/encrypted metadata
 * split:
 * - `encryptBlob`/`decryptBlob` — binary payloads (document images, etc.)
 *   meant to travel through `sdk.storage` as opaque ciphertext.
 * - `encryptJson`/`decryptJson` — the "encrypted metadata" half of an
 *   object's fields (human-readable title, notes, document number, etc.),
 *   as opposed to the plaintext routing metadata (object id, plugin id,
 *   storage key) plugins keep server-visible.
 *
 * Each result carries its own IV and `algorithmVersion` so a future cipher
 * change is versioned per-object, not global — mirrors the wrapped-key shapes
 * in `e2ee-crypto.ts`.
 */

const AES_GCM_IV_BYTES = 12;

export const OBJECT_ALGORITHM_VERSION = 'v1';

/** Encrypted binary payload — the `ciphertext` Blob is safe to upload as opaque bytes. */
export interface EncryptedBlob {
  ciphertext: Blob;
  /** Base64url IV used for this encryption. */
  iv: string;
  algorithmVersion: string;
  /** The original `Blob.type`, needed to reconstruct it on decrypt. */
  contentType: string;
}

/** Encrypted JSON metadata — safe to store server-side as opaque ciphertext. */
export interface EncryptedJson {
  /** Base64url ciphertext of the UTF-8 JSON-serialized value. */
  ciphertext: string;
  /** Base64url IV used for this encryption. */
  iv: string;
  algorithmVersion: string;
}

function toBase64Url(bytes: ArrayBuffer | Uint8Array): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = '';
  for (const byte of arr) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(value: string): Uint8Array {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/');
  const withPadding = padded + '='.repeat((4 - (padded.length % 4)) % 4);
  const binary = atob(withPadding);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Encrypt a `Blob` (e.g. a document image) under the given DEK. */
export async function encryptBlob(dek: CryptoKey, blob: Blob): Promise<EncryptedBlob> {
  const iv = crypto.getRandomValues(new Uint8Array(AES_GCM_IV_BYTES));
  const plaintext = await blob.arrayBuffer();
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as BufferSource },
    dek,
    plaintext,
  );
  return {
    ciphertext: new Blob([ciphertext], { type: 'application/octet-stream' }),
    iv: toBase64Url(iv),
    algorithmVersion: OBJECT_ALGORITHM_VERSION,
    contentType: blob.type,
  };
}

/** Decrypt a `Blob` previously produced by `encryptBlob` with the matching DEK. */
export async function decryptBlob(dek: CryptoKey, encrypted: EncryptedBlob): Promise<Blob> {
  const iv = fromBase64Url(encrypted.iv);
  const ciphertext = await encrypted.ciphertext.arrayBuffer();
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: iv as BufferSource },
    dek,
    ciphertext,
  );
  return new Blob([plaintext], { type: encrypted.contentType });
}

/** Encrypt a JSON-serializable value (e.g. an object's human-readable metadata) under the given DEK. */
export async function encryptJson<T>(dek: CryptoKey, value: T): Promise<EncryptedJson> {
  const iv = crypto.getRandomValues(new Uint8Array(AES_GCM_IV_BYTES));
  const plaintext = new TextEncoder().encode(JSON.stringify(value));
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as BufferSource },
    dek,
    plaintext,
  );
  return {
    ciphertext: toBase64Url(ciphertext),
    iv: toBase64Url(iv),
    algorithmVersion: OBJECT_ALGORITHM_VERSION,
  };
}

/** Decrypt a JSON value previously produced by `encryptJson` with the matching DEK. */
export async function decryptJson<T>(dek: CryptoKey, encrypted: EncryptedJson): Promise<T> {
  const iv = fromBase64Url(encrypted.iv);
  const ciphertext = fromBase64Url(encrypted.ciphertext);
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: iv as BufferSource },
    dek,
    ciphertext as BufferSource,
  );
  return JSON.parse(new TextDecoder().decode(plaintext)) as T;
}
