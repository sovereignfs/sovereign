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
 * Scope: CMK generation, master-key wrap/unwrap (recovery secret, device
 * key), and per-object Data Encryption Key (DEK) generation/wrap/unwrap.
 * Generic Blob/JSON encrypt/decrypt helpers that use a DEK live in
 * `e2ee-object.ts`; this module only handles key material.
 */

const AES_GCM_KEY_LENGTH = 256;
const AES_GCM_IV_BYTES = 12;
const PBKDF2_SALT_BYTES = 16;
const PBKDF2_ITERATIONS = 600_000; // OWASP 2023 guidance for PBKDF2-HMAC-SHA256
const RECOVERY_SECRET_ENTROPY_BYTES = 20; // 160 bits

export const CMK_ALGORITHM = 'AES-GCM-256';
export const KDF_ALGORITHM = 'PBKDF2-SHA256';
export const WRAP_ALGORITHM_VERSION = 'v1';

/** The CMK both encrypts/decrypts content directly and wraps/unwraps per-object DEKs. */
const CMK_KEY_USAGES: KeyUsage[] = ['encrypt', 'decrypt', 'wrapKey', 'unwrapKey'];
/** A DEK only ever encrypts/decrypts object content — it never wraps another key. */
const DEK_KEY_USAGES: KeyUsage[] = ['encrypt', 'decrypt'];

/** Base64url `iv || ciphertext` for a wrapped key, plus the algorithm version it was wrapped under. */
interface WrappedKey {
  value: string;
  algorithmVersion: string;
}

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

/** Ciphertext + metadata needed to unwrap a per-object DEK later. Safe to store server-side as-is. */
export interface WrappedDek {
  /** Base64url `iv || ciphertext`. */
  wrappedDek: string;
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

/**
 * Generate a new, extractable Client Master Key. Includes `wrapKey`/
 * `unwrapKey` usages (not just `encrypt`/`decrypt`) since the CMK wraps
 * per-object DEKs (`wrapDekWithCmk`/`unwrapDekWithCmk` below) in addition to
 * being itself wrapped by a recovery secret or device key.
 */
export function generateCmk(): Promise<CryptoKey> {
  return crypto.subtle.generateKey(
    { name: 'AES-GCM', length: AES_GCM_KEY_LENGTH },
    true,
    CMK_KEY_USAGES,
  );
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
    CMK_KEY_USAGES,
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

async function wrapKeyWith(key: CryptoKey, wrappingKey: CryptoKey): Promise<WrappedKey> {
  const iv = crypto.getRandomValues(new Uint8Array(AES_GCM_IV_BYTES));
  const wrapped = await crypto.subtle.wrapKey('raw', key, wrappingKey, {
    name: 'AES-GCM',
    iv: iv as BufferSource,
  });
  return {
    value: toBase64Url(concatBytes(iv, new Uint8Array(wrapped))),
    algorithmVersion: WRAP_ALGORITHM_VERSION,
  };
}

async function unwrapKeyWith(
  wrappedValue: string,
  wrappingKey: CryptoKey,
  extractable: boolean,
  usages: KeyUsage[],
): Promise<CryptoKey> {
  const combined = fromBase64Url(wrappedValue);
  const iv = combined.slice(0, AES_GCM_IV_BYTES);
  const ciphertext = combined.slice(AES_GCM_IV_BYTES);
  return crypto.subtle.unwrapKey(
    'raw',
    ciphertext as BufferSource,
    wrappingKey,
    { name: 'AES-GCM', iv: iv as BufferSource },
    { name: 'AES-GCM', length: AES_GCM_KEY_LENGTH },
    extractable,
    usages,
  );
}

/** Wrap the CMK with this device's own key. */
export async function wrapCmkWithDeviceKey(
  cmk: CryptoKey,
  deviceKey: CryptoKey,
): Promise<WrappedCmk> {
  const { value, algorithmVersion } = await wrapKeyWith(cmk, deviceKey);
  return { wrappedCmk: value, algorithmVersion };
}

/** Unwrap the CMK using this device's own key. */
export function unwrapCmkWithDeviceKey(
  wrapped: WrappedCmk,
  deviceKey: CryptoKey,
): Promise<CryptoKey> {
  return unwrapKeyWith(wrapped.wrappedCmk, deviceKey, true, CMK_KEY_USAGES);
}

/**
 * Generate a new, extractable per-object Data Encryption Key (DEK). One DEK
 * per encrypted object/document — never reused across objects — so
 * compromising a single object's key never exposes any other object (RFC
 * 0060 key hierarchy: CMK wraps DEKs, DEKs encrypt object content).
 */
export function generateDek(): Promise<CryptoKey> {
  return crypto.subtle.generateKey(
    { name: 'AES-GCM', length: AES_GCM_KEY_LENGTH },
    true,
    DEK_KEY_USAGES,
  );
}

/** Wrap a per-object DEK with the (unlocked) CMK. Safe to store server-side as-is. */
export async function wrapDekWithCmk(dek: CryptoKey, cmk: CryptoKey): Promise<WrappedDek> {
  const { value, algorithmVersion } = await wrapKeyWith(dek, cmk);
  return { wrappedDek: value, algorithmVersion };
}

/** Unwrap a per-object DEK using the (unlocked) CMK. Throws if the CMK doesn't match. */
export function unwrapDekWithCmk(wrapped: WrappedDek, cmk: CryptoKey): Promise<CryptoKey> {
  return unwrapKeyWith(wrapped.wrappedDek, cmk, true, DEK_KEY_USAGES);
}
