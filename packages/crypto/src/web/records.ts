/**
 * Wrapped secrets (RFC 0005 §1.2): a 32-byte key encrypted with AES-256-GCM under another key, bound by its associated data to
 * whose it is and what it is for, and written as a small JSON record that names its suite.
 *
 * A key is opened to its bytes only inside the call that needs them, and those bytes are overwritten before the call returns; what
 * the caller keeps is a WebCrypto key that cannot be exported. That stops a key object being copied out. It does not stop a script
 * running on the page from opening a stored record itself, with a key it can use: such a script can do whatever the page can
 * (README, "What cannot be exported means").
 */
import { fromBase64Url, source, toBase64Url } from './bytes.js';
import { encodeFields, LABEL } from './fields.js';
import type { WebKey } from './password.js';

/** The only suite there is: RFC 0005 §1, suite 1. */
export const SUITE = 1;

/** A key is 32 bytes: the account key, an app key, a document key, the recovery kit. */
export const KEY_BYTES = 32;

const NONCE_BYTES = 12;
const TAG_BYTES = 16;

/** A secret encrypted under a key, as it is stored. */
export interface WrapRecord {
  readonly suite: typeof SUITE;
  readonly nonce: string;
  readonly ciphertext: string;
}

/** Why a record could not be opened. A wrong key and a record moved to another place look alike: both fail authentication. */
export class RecordError extends Error {
  constructor(readonly reason: 'malformed' | 'unknown-suite' | 'authentication-failed') {
    super(
      reason === 'malformed'
        ? 'The record is not one this code reads.'
        : reason === 'unknown-suite'
          ? 'The record names a suite this code does not have.'
          : 'The record did not open: the key, or where it was found, is not the one it was made for.',
    );
    this.name = 'RecordError';
  }
}

/** Fresh random bytes for a new key. The caller overwrites them once they are wrapped or imported. */
export const newKey = (): Uint8Array => crypto.getRandomValues(new Uint8Array(KEY_BYTES));

/** A 32-byte key as an AES-256-GCM key that cannot be exported, for encrypting and opening records. */
export const importWrappingKey = (raw: Uint8Array): Promise<WebKey> =>
  crypto.subtle.importKey('raw', source(raw), 'AES-GCM', false, ['encrypt', 'decrypt']);

/** Encrypts `secret` under `key`, bound to `associatedData`. */
export async function wrapSecret(
  key: WebKey,
  secret: Uint8Array,
  associatedData: Uint8Array,
): Promise<WrapRecord> {
  const nonce = crypto.getRandomValues(new Uint8Array(NONCE_BYTES));
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: nonce, additionalData: source(associatedData) },
      key,
      source(secret),
    ),
  );
  return { suite: SUITE, nonce: toBase64Url(nonce), ciphertext: toBase64Url(ciphertext) };
}

/** Reads a stored record, refusing anything not exactly a suite-1 wrap. */
export function parseWrapRecord(value: unknown): WrapRecord {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new RecordError('malformed');
  }
  const record = value as Record<string, unknown>;
  if (Object.keys(record).sort().join() !== 'ciphertext,nonce,suite')
    throw new RecordError('malformed');
  if (record.suite !== SUITE) {
    throw new RecordError(typeof record.suite === 'number' ? 'unknown-suite' : 'malformed');
  }
  const nonce = typeof record.nonce === 'string' ? fromBase64Url(record.nonce) : undefined;
  const ciphertext =
    typeof record.ciphertext === 'string' ? fromBase64Url(record.ciphertext) : undefined;
  if (nonce?.length !== NONCE_BYTES || !ciphertext || ciphertext.length < TAG_BYTES) {
    throw new RecordError('malformed');
  }
  return { suite: SUITE, nonce: record.nonce as string, ciphertext: record.ciphertext as string };
}

/** Opens a record to its bytes. The caller overwrites them as soon as it has made what it needs. */
export async function unwrapSecret(
  key: WebKey,
  value: unknown,
  associatedData: Uint8Array,
): Promise<Uint8Array> {
  const record = parseWrapRecord(value);
  try {
    return new Uint8Array(
      await crypto.subtle.decrypt(
        {
          name: 'AES-GCM',
          iv: source(fromBase64Url(record.nonce) as Uint8Array),
          additionalData: source(associatedData),
        },
        key,
        source(fromBase64Url(record.ciphertext) as Uint8Array),
      ),
    );
  } catch {
    throw new RecordError('authentication-failed');
  }
}

/** Opens a record that holds a 32-byte key straight into a wrapping key; its bytes never leave this call. */
export async function unwrapKey(
  key: WebKey,
  value: unknown,
  associatedData: Uint8Array,
): Promise<WebKey> {
  const raw = await unwrapSecret(key, value, associatedData);
  try {
    if (raw.length !== KEY_BYTES) throw new RecordError('malformed');
    return await importWrappingKey(raw);
  } finally {
    raw.fill(0);
  }
}

/**
 * Re-wraps a key under another, for a new way in (a passkey added, a password changed) or a new place, without the key ever being
 * a key object the caller holds.
 */
export async function rewrapKey(
  from: { key: WebKey; record: unknown; associatedData: Uint8Array },
  to: { key: WebKey; associatedData: Uint8Array },
): Promise<WrapRecord> {
  const raw = await unwrapSecret(from.key, from.record, from.associatedData);
  try {
    return await wrapSecret(to.key, raw, to.associatedData);
  } finally {
    raw.fill(0);
  }
}

/** The ways in an account key is wrapped for (core-app §5.3). */
export type WayIn = 'password' | 'passkey' | 'kit';

/** Associated data of an account key's wrap: whose, which way in, and which one of it (a passkey's credential id). */
export const accountWrapData = (sub: string, way: WayIn, id = ''): Uint8Array =>
  encodeFields(LABEL.accountWrap, sub, way, id);

/** Associated data of an app key, wrapped by the account key. */
export const appKeyData = (sub: string, clientId: string): Uint8Array =>
  encodeFields(LABEL.appKey, sub, clientId);
