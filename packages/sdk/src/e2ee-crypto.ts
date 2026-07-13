/**
 * Client-side Client Master Key (CMK) crypto (RFC 0060). Pure WebCrypto —
 * runs in the browser (or any environment with a global `crypto.subtle`,
 * which includes Node for testing). No plaintext key material or wrapped
 * bytes ever need to leave this module's caller before being sent to the
 * server as opaque ciphertext.
 *
 * Resolves RFC 0060 open question 2 (browser KDF choice): PBKDF2-HMAC-SHA256
 * via native WebCrypto, not Argon2id — Argon2id has no native WebCrypto
 * primitive, and pulling in a WASM implementation is out of scope for this
 * pass. `kdfAlgorithm`/`kdfParams` are stored per-wrapper specifically so a
 * future Argon2id upgrade doesn't require a schema change, only a new
 * `kdfAlgorithm` value and a migration path for existing wrappers.
 *
 * Scope: CMK generation and *master-key* wrap/unwrap only (recovery secret,
 * device key). Per-object DEK wrap/unwrap and generic Blob/JSON
 * encrypt/decrypt helpers for plugin data are a later adoption-path step
 * (not implemented here).
 */

const AES_GCM_KEY_LENGTH = 256;
const AES_GCM_IV_BYTES = 12;
const PBKDF2_SALT_BYTES = 16;
const PBKDF2_ITERATIONS = 600_000; // OWASP 2023 guidance for PBKDF2-HMAC-SHA256
const RECOVERY_SECRET_ENTROPY_BYTES = 20; // 160 bits

export const CMK_ALGORITHM = 'AES-GCM-256';
export const KDF_ALGORITHM = 'PBKDF2-SHA256';
export const WRAP_ALGORITHM_VERSION = 'v1';

/** Ciphertext + metadata needed to unwrap a CMK later. Safe to store server-side as-is. */
export interface WrappedCmk {
  /** Base64url `iv || ciphertext`. */
  wrappedCmk: string;
  algorithmVersion: string;
}

/** A `WrappedCmk` plus the KDF metadata needed to re-derive the wrapping key from a secret. */
export interface RecoveryWrappedCmk extends WrappedCmk {
  kdfAlgorithm: string;
  /** JSON-encoded KDF parameters. */
  kdfParams: string;
  kdfSalt: string;
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

function concatBytes(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
}

/**
 * A high-entropy, human-recordable recovery secret. Grouped base32
 * (Crockford-ish alphabet, ambiguous characters removed) rather than a
 * BIP39 word list — no wordlist dependency, ~160 bits of entropy in 32
 * displayed characters across 6 groups (e.g. `AB3DE-FGH2J-...`).
 */
export function generateRecoverySecret(): string {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no 0/O, 1/I/L
  const bytes = crypto.getRandomValues(new Uint8Array(RECOVERY_SECRET_ENTROPY_BYTES));
  let out = '';
  for (const byte of bytes) out += alphabet[byte % alphabet.length];
  return out.match(/.{1,5}/g)?.join('-') ?? out;
}

/** Generate a new, extractable Client Master Key. */
export function generateCmk(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: 'AES-GCM', length: AES_GCM_KEY_LENGTH }, true, [
    'encrypt',
    'decrypt',
  ]);
}

async function deriveWrappingKeyFromSecret(secret: string, salt: Uint8Array): Promise<CryptoKey> {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret.normalize('NFKC')),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: AES_GCM_KEY_LENGTH },
    false,
    ['wrapKey', 'unwrapKey'],
  );
}

/** Wrap the CMK with a key derived from the user's recovery secret. */
export async function wrapCmkWithRecoverySecret(
  cmk: CryptoKey,
  recoverySecret: string,
): Promise<RecoveryWrappedCmk> {
  const salt = crypto.getRandomValues(new Uint8Array(PBKDF2_SALT_BYTES));
  const wrappingKey = await deriveWrappingKeyFromSecret(recoverySecret, salt);
  const iv = crypto.getRandomValues(new Uint8Array(AES_GCM_IV_BYTES));
  const wrapped = await crypto.subtle.wrapKey('raw', cmk, wrappingKey, {
    name: 'AES-GCM',
    iv: iv as BufferSource,
  });
  return {
    wrappedCmk: toBase64Url(concatBytes(iv, new Uint8Array(wrapped))),
    kdfAlgorithm: KDF_ALGORITHM,
    kdfParams: JSON.stringify({ iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' }),
    kdfSalt: toBase64Url(salt),
    algorithmVersion: WRAP_ALGORITHM_VERSION,
  };
}

/** Unwrap the CMK given the recovery secret. Throws if the secret is wrong. */
export async function unwrapCmkWithRecoverySecret(
  wrapped: RecoveryWrappedCmk,
  recoverySecret: string,
): Promise<CryptoKey> {
  const salt = fromBase64Url(wrapped.kdfSalt);
  const wrappingKey = await deriveWrappingKeyFromSecret(recoverySecret, salt);
  const combined = fromBase64Url(wrapped.wrappedCmk);
  const iv = combined.slice(0, AES_GCM_IV_BYTES);
  const ciphertext = combined.slice(AES_GCM_IV_BYTES);
  return crypto.subtle.unwrapKey(
    'raw',
    ciphertext as BufferSource,
    wrappingKey,
    { name: 'AES-GCM', iv: iv as BufferSource },
    { name: 'AES-GCM', length: AES_GCM_KEY_LENGTH },
    true,
    ['encrypt', 'decrypt'],
  );
}

/**
 * Generate a device-local wrapping key. Non-extractable — once created, no
 * script (including a compromised page on this origin) can ever read its raw
 * bytes back out via `exportKey`; it can only be used, via its `CryptoKey`
 * handle, for wrap/unwrap. Must be persisted with IndexedDB (the only Web
 * storage API that can hold a live `CryptoKey`) — see `e2ee-device.ts`.
 */
export function generateDeviceKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: 'AES-GCM', length: AES_GCM_KEY_LENGTH }, false, [
    'wrapKey',
    'unwrapKey',
  ]);
}

/** Wrap the CMK with this device's own key. */
export async function wrapCmkWithDeviceKey(
  cmk: CryptoKey,
  deviceKey: CryptoKey,
): Promise<WrappedCmk> {
  const iv = crypto.getRandomValues(new Uint8Array(AES_GCM_IV_BYTES));
  const wrapped = await crypto.subtle.wrapKey('raw', cmk, deviceKey, {
    name: 'AES-GCM',
    iv: iv as BufferSource,
  });
  return {
    wrappedCmk: toBase64Url(concatBytes(iv, new Uint8Array(wrapped))),
    algorithmVersion: WRAP_ALGORITHM_VERSION,
  };
}

/** Unwrap the CMK using this device's own key. */
export async function unwrapCmkWithDeviceKey(
  wrapped: WrappedCmk,
  deviceKey: CryptoKey,
): Promise<CryptoKey> {
  const combined = fromBase64Url(wrapped.wrappedCmk);
  const iv = combined.slice(0, AES_GCM_IV_BYTES);
  const ciphertext = combined.slice(AES_GCM_IV_BYTES);
  return crypto.subtle.unwrapKey(
    'raw',
    ciphertext as BufferSource,
    deviceKey,
    { name: 'AES-GCM', iv: iv as BufferSource },
    { name: 'AES-GCM', length: AES_GCM_KEY_LENGTH },
    true,
    ['encrypt', 'decrypt'],
  );
}
