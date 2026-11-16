/**
 * The password derivation of RFC 0005 §1.1 and core-app §5.2. One Argon2id run over the password gives a secret from which two
 * unrelated values are made:
 *
 * - the **sign-in value**, `svp1.` and 43 base64url characters, which a browser sends where it used to send the password;
 * - the **unlock key**, which never leaves the browser and opens the person's account key.
 *
 * The secret itself is held only as a WebCrypto key that cannot be exported, from the moment it is made until the unlock key is
 * made from it: the unlock key needs a salt that core hands out only after signing in.
 *
 * Browser-safe: WebCrypto (`crypto.subtle`, so a secure context in a browser) and libsodium, and nothing of Node's.
 */
import { argon2id, ARGON2_SALT_BYTES, type Argon2Cost } from './argon2.js';
import { concat, source, toBase64Url, utf8 } from './bytes.js';

/**
 * A WebCrypto key. Named from `crypto.subtle` itself: the shared configuration has no DOM types, and Node's name the class as a
 * value only.
 */
export type WebKey = Awaited<ReturnType<typeof crypto.subtle.importKey>>;

/** A derivation: which one (the number after `svp`) and what it costs. */
export interface PasswordDerivation extends Argon2Cost {
  readonly version: number;
}

/**
 * The derivation in use: 19 MiB and 3 passes, measured on an iPhone 15 Pro at about one second (RFC 0005 §1.4; the README's
 * table). The cost is the same for every account on every instance; changing it is a new version.
 */
export const PASSWORD_DERIVATION: PasswordDerivation = {
  version: 1,
  memoryBytes: 19 * 1024 * 1024,
  passes: 3,
};

/** An instance id is 32 random bytes (core-app §5.2). */
export const INSTANCE_ID_BYTES = 32;

const SALT_LABEL = utf8('sovereign/1/password');
const SIGN_IN_INFO = utf8('sovereign/1/sign-in');
const UNLOCK_INFO = utf8('sovereign/1/unlock');

/** The address as the derivation reads it: trimmed, in lower case. */
export const normaliseAddress = (address: string): string => address.trim().toLowerCase();

/**
 * The Argon2id salt: the first 16 bytes of SHA-256("sovereign/1/password" ‖ instance id ‖ address). The instance id has a fixed
 * length, so nothing can be moved across the boundary between it and the address.
 */
export async function passwordSalt(instanceId: Uint8Array, address: string): Promise<Uint8Array> {
  if (instanceId.length !== INSTANCE_ID_BYTES) {
    throw new TypeError(`An instance id is ${INSTANCE_ID_BYTES} bytes, not ${instanceId.length}.`);
  }
  const input = concat(SALT_LABEL, instanceId, utf8(normaliseAddress(address)));
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', source(input)));
  return digest.slice(0, ARGON2_SALT_BYTES);
}

/** What a password derives to. */
export interface DerivedPassword {
  /** Sent to core where the password used to be. */
  readonly signIn: string;
  /** The secret both values come from, as a key that cannot be exported; give it to `deriveUnlockKey` and drop it. */
  readonly secret: WebKey;
}

export interface DerivePasswordInput {
  readonly password: string;
  readonly address: string;
  readonly instanceId: Uint8Array;
  /** Defaults to `PASSWORD_DERIVATION`. Another is passed only while a cost is being changed (RFC 0005 §1.4). */
  readonly derivation?: PasswordDerivation;
}

const hkdf = (info: Uint8Array, salt: Uint8Array = new Uint8Array()) =>
  ({ name: 'HKDF', hash: 'SHA-256', salt: source(salt), info: source(info) }) as const;

/** The sign-in value and the secret the unlock key is made from, by one Argon2id run. */
export async function derivePassword(input: DerivePasswordInput): Promise<DerivedPassword> {
  const derivation = input.derivation ?? PASSWORD_DERIVATION;
  const salt = await passwordSalt(input.instanceId, input.address);
  const password = utf8(input.password.normalize('NFKC'));
  const raw = await argon2id(password, salt, derivation);
  password.fill(0);
  let secret: WebKey;
  try {
    secret = await crypto.subtle.importKey('raw', source(raw), 'HKDF', false, [
      'deriveBits',
      'deriveKey',
    ]);
  } finally {
    raw.fill(0);
  }
  const bits = new Uint8Array(await crypto.subtle.deriveBits(hkdf(SIGN_IN_INFO), secret, 256));
  return { signIn: `svp${derivation.version}.${toBase64Url(bits)}`, secret };
}

/**
 * The unlock key: HKDF of the secret with the salt the vault keeps for the account. An AES-256-GCM key that cannot be exported,
 * for opening and writing the account key's `password` way in.
 */
export function deriveUnlockKey(secret: WebKey, vaultSalt: Uint8Array): Promise<WebKey> {
  return crypto.subtle.deriveKey(
    hkdf(UNLOCK_INFO, vaultSalt),
    secret,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}
