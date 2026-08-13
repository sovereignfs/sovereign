/**
 * Client-side crypto for the `device-only` offline tier's Device Storage Key
 * (RFC 0093) — WebAuthn PRF derivation (native Keychain/Keystore's web
 * equivalent) plus the independent recovery-secret wrapper from RFC 0093
 * §3. Pure Web Authentication API + WebCrypto — runs in the browser (or any
 * environment with `navigator.credentials`/`crypto.subtle`, which includes
 * a suitably stubbed test environment).
 *
 * **Deliberately self-contained, not built on `e2ee-crypto.ts`.** RFC 0093
 * §3 is explicit that the Device Storage Key and RFC 0060's CMK are
 * independent secrets specifically so a compromise of one never implies the
 * other — that independence is worth holding at the *implementation* level
 * too, not just the secret-value level: this module's own PBKDF2/AES-GCM
 * wrap logic (below) is a deliberate, small duplication of the same pattern
 * `e2ee-crypto.ts` uses for its CMK, not a refactor to share it. The one
 * exception is `generateRecoverySecret` (imported, not duplicated) — it is
 * a generic "produce a random human-recordable string" utility with no CMK-
 * specific logic at all, so reusing it crosses no independence boundary.
 *
 * PRF repurposes WebAuthn's *authentication* ceremony as a *local key
 * derivation* primitive — the browser asks the platform authenticator
 * (Secure Enclave, StrongBox, TPM — frequently the same hardware Keychain/
 * Keystore already use) to prove presence and, via the `prf` extension, hand
 * back a reproducible secret derived from a credential-bound value that
 * never leaves the authenticator. Same credential + same salt always
 * produces the same output; it can only be reproduced by repeating the
 * ceremony, live, every time — the same property `device-client.ts`'s
 * `secureStorage` capability gets from Keychain/Keystore natively.
 *
 * **No server round-trip is required or expected for the PRF ceremony.**
 * The WebAuthn spec requires a `challenge` on every
 * `navigator.credentials.get()` call regardless of purpose, but this module
 * never sends it anywhere or checks a signature against it — this is a
 * local-only ceremony, not an authentication event a relying party
 * verifies. Do not read the presence of a challenge as evidence this talks
 * to the server; it doesn't. (The recovery-secret wrap functions below are
 * pure WebCrypto and never touch the network either — *storing* the
 * resulting wrapped ciphertext, e.g. for RFC 0093 §4's opt-in server
 * backup, is the caller's own concern, same boundary `e2ee-crypto.ts`
 * draws around its own wrap functions.)
 *
 * Scope: derive the storage key from an existing PRF-capable passkey, and
 * wrap/unwrap it with a recovery secret. Registering a *new* PRF-capable
 * passkey when none exists (RFC 0093 §2, epic task 1.22's own note: "does
 * not assume the login passkey can be reused") is Account enrollment UX
 * coordinated with better-auth's passkey plugin server-side — out of scope
 * for this pure-crypto module, same boundary `e2ee-crypto.ts` draws around
 * its own key material vs. `e2ee-object.ts`'s content helpers.
 */

import { generateRecoverySecret } from './e2ee-crypto';

/**
 * Fixed, purpose-scoped PRF salt (RFC 0093 §2, resolved). Not a secret —
 * its only job is domain separation between different PRF uses of the same
 * passkey (e.g. if RFC 0060's own CMK ever adopts PRF unlock too, it must
 * use a different fixed salt so the two derived keys are never
 * correlatable). Derived from a descriptive string via SHA-256 rather than
 * a hand-picked byte literal, so it stays auditable; deterministic, so
 * every derivation call reproduces it with nothing to store.
 */
const PRF_SALT_PURPOSE = 'sovereign:device-only-storage:v1';

async function getPrfSalt(): Promise<ArrayBuffer> {
  return crypto.subtle.digest('SHA-256', new TextEncoder().encode(PRF_SALT_PURPOSE));
}

/** Whether this environment can even attempt the ceremony — checked before every call below. */
export function isWebAuthnAvailable(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    typeof navigator.credentials !== 'undefined' &&
    typeof PublicKeyCredential !== 'undefined'
  );
}

/**
 * Whether this device currently has a *usable* platform authenticator with
 * user verification — a passcode, fingerprint, or face unlock actually
 * configured, not just WebAuthn API support in the abstract
 * (`isWebAuthnAvailable()` above). A device with the API present but nothing
 * enrolled can still start a passkey creation ceremony, which then fails
 * with no good error message to show — checking this first lets a caller
 * show a clear, actionable "set up a passcode" screen instead of an opaque
 * ceremony failure (RFC 0093 §2/§5, epic task 1.22's no-device-passcode
 * hard-block case). Purely a capability query — no prompt, no user
 * interaction, safe to call on every mount.
 */
export async function isUserVerifyingPlatformAuthenticatorAvailable(): Promise<boolean> {
  if (
    !isWebAuthnAvailable() ||
    typeof PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable !== 'function'
  ) {
    return false;
  }
  return PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
}

export type PrfDerivationResult =
  | { status: 'ok'; key: CryptoKey; credentialId: ArrayBuffer }
  | { status: 'unsupported' } // WebAuthn (or the browser generally) unavailable in this environment
  | { status: 'unavailable' } // ceremony completed but the credential that answered isn't PRF-capable
  | { status: 'cancelled' } // the user dismissed the platform prompt
  | { status: 'failed'; error: string };

/**
 * Run the PRF ceremony against an existing passkey and derive this
 * device-only store's non-extractable wrapping key from the result.
 *
 * @param credentialId Target a specific, already-enrolled credential (its
 * `rawId` from a prior `ok` result) — the deterministic path once
 * enrollment has happened once. Omit to let the platform present its own
 * resident-credential picker (first enrollment, or when the caller hasn't
 * stored a credential id yet).
 */
export async function deriveDeviceOnlyKeyViaPrf(
  credentialId?: BufferSource,
): Promise<PrfDerivationResult> {
  if (!isWebAuthnAvailable()) {
    return { status: 'unsupported' };
  }

  const salt = await getPrfSalt();
  // Required by the WebAuthn spec on every call; never sent to or checked
  // by a server — see the module doc comment.
  const challenge = crypto.getRandomValues(new Uint8Array(32));

  let assertion: Credential | null;
  try {
    assertion = await navigator.credentials.get({
      publicKey: {
        challenge: challenge as BufferSource,
        allowCredentials: credentialId ? [{ id: credentialId, type: 'public-key' }] : [],
        userVerification: 'required',
        extensions: { prf: { eval: { first: salt as BufferSource } } },
      } as PublicKeyCredentialRequestOptions & {
        extensions: { prf: { eval: { first: BufferSource } } };
      },
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'NotAllowedError') {
      return { status: 'cancelled' };
    }
    return { status: 'failed', error: err instanceof Error ? err.message : String(err) };
  }

  if (!assertion || !('getClientExtensionResults' in assertion)) {
    return { status: 'unavailable' };
  }

  const extensionResults = (
    assertion as PublicKeyCredential
  ).getClientExtensionResults() as unknown as {
    prf?: { results?: { first?: ArrayBuffer } };
  };
  const prfOutput = extensionResults.prf?.results?.first;
  if (!prfOutput) {
    // The ceremony succeeded, but this authenticator/credential doesn't
    // support PRF. The caller's next step is enrollment (register a new
    // passkey with the extension explicitly requested), not a retry.
    return { status: 'unavailable' };
  }

  const key = await crypto.subtle.importKey('raw', prfOutput, { name: 'AES-GCM' }, false, [
    'wrapKey',
    'unwrapKey',
  ]);
  return { status: 'ok', key, credentialId: (assertion as PublicKeyCredential).rawId };
}

/**
 * RFC 0093 §3, "Wrapper 2" — an independent recovery secret that unwraps
 * the *same* underlying Device Storage Key as wrapper 1 (Keychain/Keystore
 * natively, or `deriveDeviceOnlyKeyViaPrf` above on web). Re-exports
 * `generateRecoverySecret` from `e2ee-crypto.ts` unchanged — see the module
 * doc comment for why that specific reuse is safe while the wrap/unwrap
 * logic below is not shared.
 */
export { generateRecoverySecret };

const AES_GCM_KEY_LENGTH = 256;
const AES_GCM_IV_BYTES = 12;
const PBKDF2_SALT_BYTES = 16;
const PBKDF2_ITERATIONS = 600_000; // OWASP 2023 guidance for PBKDF2-HMAC-SHA256, matching e2ee-crypto.ts
const WRAP_ALGORITHM_VERSION = 'v1';

/** Ciphertext + KDF metadata needed to unwrap the Device Storage Key later. Safe to store (e.g. RFC 0093 §4's opt-in server backup stores exactly this, as ciphertext the server cannot read). */
export interface RecoveryWrappedDeviceStorageKey {
  /** Base64url `iv || ciphertext`. */
  wrappedKey: string;
  algorithmVersion: string;
  kdfAlgorithm: string;
  /** JSON-encoded KDF parameters. */
  kdfParams: string;
  kdfSalt: string;
}

/**
 * Exported alongside the wrap/unwrap functions: callers need to persist a
 * PRF credential's `rawId` (e.g. `device-only-storage.ts`'s
 * `prfCredentialId`, so a later `deriveDeviceOnlyKeyViaPrf` call can target
 * the exact credential instead of prompting a picker across every passkey
 * on the device) in the same base64url form this module already uses.
 */
export function toBase64Url(bytes: ArrayBuffer | Uint8Array): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = '';
  for (const byte of arr) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function fromBase64Url(value: string): Uint8Array {
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

/**
 * Generate a new, extractable Device Storage Key — the actual 256-bit
 * AES-GCM key that (directly or via further derivation) protects the OPFS
 * database. Extractable, unlike `deriveDeviceOnlyKeyViaPrf`'s output: this
 * key must be wrappable under *two* independent wrappers (RFC 0093 §3),
 * and `subtle.wrapKey` requires the key being wrapped to be extractable —
 * only the wrapping key itself may be (and here, is) non-extractable. Its
 * own raw bytes are never exposed to JS as plaintext outside a `wrapKey`
 * call; only ciphertext ever leaves this module.
 */
export function generateDeviceStorageKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: 'AES-GCM', length: AES_GCM_KEY_LENGTH }, true, [
    'wrapKey',
    'unwrapKey',
  ]);
}

/** Ciphertext + metadata needed to unwrap the Device Storage Key using wrapper 1 (the PRF-derived key). Safe to persist locally alongside the recovery-wrapped copy — it is ciphertext either way. */
export interface PrfWrappedDeviceStorageKey {
  /** Base64url `iv || ciphertext`. */
  wrappedKey: string;
  algorithmVersion: string;
}

/**
 * Wrapper 1 (RFC 0093 §3): wrap the Device Storage Key with the
 * non-extractable key `deriveDeviceOnlyKeyViaPrf` produced. This is the
 * fast, daily-use path.
 */
export async function wrapDeviceStorageKeyWithPrfKey(
  deviceStorageKey: CryptoKey,
  prfKey: CryptoKey,
): Promise<PrfWrappedDeviceStorageKey> {
  const iv = crypto.getRandomValues(new Uint8Array(AES_GCM_IV_BYTES));
  const wrapped = await crypto.subtle.wrapKey('raw', deviceStorageKey, prfKey, {
    name: 'AES-GCM',
    iv: iv as BufferSource,
  });
  return {
    wrappedKey: toBase64Url(concatBytes(iv, new Uint8Array(wrapped))),
    algorithmVersion: WRAP_ALGORITHM_VERSION,
  };
}

/**
 * Unwrap the Device Storage Key using wrapper 1 (the PRF-derived key).
 * Returned extractable — RFC 0093 §3 requires re-wrapping under a *fresh*
 * wrapper 1 after the old one is invalidated (a re-enrolled passkey), which
 * needs the unwrapped key to be extractable again, same as
 * `e2ee-crypto.ts#unwrapCmkWithDeviceKey`.
 */
export function unwrapDeviceStorageKeyWithPrfKey(
  wrapped: PrfWrappedDeviceStorageKey,
  prfKey: CryptoKey,
): Promise<CryptoKey> {
  const combined = fromBase64Url(wrapped.wrappedKey);
  const iv = combined.slice(0, AES_GCM_IV_BYTES);
  const ciphertext = combined.slice(AES_GCM_IV_BYTES);
  return crypto.subtle.unwrapKey(
    'raw',
    ciphertext as BufferSource,
    prfKey,
    { name: 'AES-GCM', iv: iv as BufferSource },
    { name: 'AES-GCM', length: AES_GCM_KEY_LENGTH },
    true,
    ['wrapKey', 'unwrapKey'],
  );
}

/**
 * Wrap the Device Storage Key with a key derived from the recovery secret
 * shown at setup time. Used both for wrapper 2's daily-recovery path (RFC
 * 0093 §3) and, unchanged, as the ciphertext RFC 0093 §4's opt-in server
 * backup stores.
 */
export async function wrapDeviceStorageKeyWithRecoverySecret(
  key: CryptoKey,
  recoverySecret: string,
): Promise<RecoveryWrappedDeviceStorageKey> {
  const salt = crypto.getRandomValues(new Uint8Array(PBKDF2_SALT_BYTES));
  const wrappingKey = await deriveWrappingKeyFromSecret(recoverySecret, salt);
  const iv = crypto.getRandomValues(new Uint8Array(AES_GCM_IV_BYTES));
  const wrapped = await crypto.subtle.wrapKey('raw', key, wrappingKey, {
    name: 'AES-GCM',
    iv: iv as BufferSource,
  });
  return {
    wrappedKey: toBase64Url(concatBytes(iv, new Uint8Array(wrapped))),
    algorithmVersion: WRAP_ALGORITHM_VERSION,
    kdfAlgorithm: 'PBKDF2-SHA256',
    kdfParams: JSON.stringify({ iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' }),
    kdfSalt: toBase64Url(salt),
  };
}

/**
 * Unwrap the Device Storage Key given the recovery secret. Throws if the
 * secret is wrong (matches `e2ee-crypto.ts#unwrapCmkWithRecoverySecret`'s
 * behavior — `crypto.subtle.unwrapKey` rejects on an authentication-tag
 * mismatch, which a wrong PBKDF2-derived key always produces with AES-GCM).
 * Returned extractable, same reasoning as
 * `unwrapDeviceStorageKeyWithPrfKey` — recovering via wrapper 2 is exactly
 * the moment a fresh wrapper 1 needs to be generated and wrapped.
 */
export async function unwrapDeviceStorageKeyWithRecoverySecret(
  wrapped: RecoveryWrappedDeviceStorageKey,
  recoverySecret: string,
): Promise<CryptoKey> {
  const salt = fromBase64Url(wrapped.kdfSalt);
  const wrappingKey = await deriveWrappingKeyFromSecret(recoverySecret, salt);
  const combined = fromBase64Url(wrapped.wrappedKey);
  const iv = combined.slice(0, AES_GCM_IV_BYTES);
  const ciphertext = combined.slice(AES_GCM_IV_BYTES);
  return crypto.subtle.unwrapKey(
    'raw',
    ciphertext as BufferSource,
    wrappingKey,
    { name: 'AES-GCM', iv: iv as BufferSource },
    { name: 'AES-GCM', length: AES_GCM_KEY_LENGTH },
    true,
    ['wrapKey', 'unwrapKey'],
  );
}
