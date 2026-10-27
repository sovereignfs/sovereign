import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { decodeBase64, encodeBase64Url } from './encoding.js';
import { DecryptionError } from './errors.js';
import { parseKeyRing, type FieldKey, type KeyRing } from './keyring.js';

/** The envelope's version, so a later format can be told apart and read beside this one. */
const VERSION = 'sv1';
const IV_BYTES = 12; // the size AES-GCM is designed for
const TAG_BYTES = 16;
const MAX_CONTEXT_LENGTH = 256;

export type Opened = {
  value: string;
  /**
   * Set when the value was written under an older key: the same value as a fresh envelope
   * under the current key. Write it back, and a rotation finishes itself as values are read.
   */
  upgraded: string | undefined;
};

/**
 * Encrypts and decrypts the secrets an app stores (an SMTP password, say), with AES-256-GCM
 * under a key ring.
 *
 * - **Authenticated.** A value that was altered, or opened with the wrong key or context,
 *   does not decrypt; it throws a `DecryptionError` saying which of three things went wrong.
 * - **Bound to its context.** `context` (such as `settings.smtp_password`, or a table, column
 *   and row id) is authenticated with the value, so a ciphertext copied into another field
 *   or row does not decrypt there.
 * - **A key ring.** New values use the first key; any key in the ring decrypts. To rotate,
 *   put a new key first and keep the old ones until no stored value names them: `open`
 *   returns the upgraded envelope for every value still under an older key.
 * - **A fresh random 96-bit IV per value.** With random IVs one key stays safe for about
 *   2^32 values, far beyond a settings table; this is not for bulk data.
 *
 * Envelope: `sv1:<key id>:<iv>:<ciphertext>:<tag>`, base64url fields.
 */
export class FieldCipher {
  readonly #ring: KeyRing;

  constructor(ring: KeyRing) {
    this.#ring = ring;
  }

  /** Reads the text of a key ring (see `parseKeyRing`). */
  static fromKeyRing(raw: string): FieldCipher {
    return new FieldCipher(parseKeyRing(raw));
  }

  /** The id new values are encrypted under. Not secret. */
  get currentKeyId(): string {
    return this.#ring.current.id;
  }

  encrypt(plaintext: string, context: string): string {
    const key = this.#ring.current;
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv('aes-256-gcm', key.material, iv, { authTagLength: TAG_BYTES });
    cipher.setAAD(additionalData(key.id, context));
    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    return [
      VERSION,
      key.id,
      encodeBase64Url(iv),
      encodeBase64Url(ciphertext),
      encodeBase64Url(cipher.getAuthTag()),
    ].join(':');
  }

  /** The plaintext, or a `DecryptionError`. */
  decrypt(envelope: string, context: string): string {
    return this.open(envelope, context).value;
  }

  /** The plaintext, and the envelope to write back when the value is under an older key. */
  open(envelope: string, context: string): Opened {
    const parsed = parseEnvelope(envelope);
    const key: FieldKey | undefined = this.#ring.byId.get(parsed.keyId);
    if (key === undefined) throw new DecryptionError('unknown-key', parsed.keyId);

    // Outside the try: a bad context is a mistake in the caller, not a value that failed.
    const aad = additionalData(key.id, context);
    let value: string;
    try {
      const decipher = createDecipheriv('aes-256-gcm', key.material, parsed.iv, {
        authTagLength: TAG_BYTES,
      });
      decipher.setAAD(aad);
      decipher.setAuthTag(parsed.tag);
      value = Buffer.concat([decipher.update(parsed.ciphertext), decipher.final()]).toString(
        'utf8',
      );
    } catch {
      // Deliberately not the cause: it says nothing a caller can use, and must carry no value.
      throw new DecryptionError('authentication-failed', parsed.keyId);
    }
    const upgraded = key.id === this.#ring.current.id ? undefined : this.encrypt(value, context);
    return { value, upgraded };
  }

  /** Whether the envelope is under the current key. A value in any other shape is not. */
  isCurrent(envelope: string): boolean {
    try {
      return parseEnvelope(envelope).keyId === this.#ring.current.id;
    } catch {
      return false;
    }
  }
}

function additionalData(keyId: string, context: string): Buffer {
  if (context === '' || context.length > MAX_CONTEXT_LENGTH) {
    throw new TypeError(
      `The context must be 1-${MAX_CONTEXT_LENGTH} characters: where the value is stored, such as "settings.smtp_password".`,
    );
  }
  // NUL separates the parts, so no key id and context pair can be read as another.
  return Buffer.from(`sv-field-v1\0${keyId}\0${context}`, 'utf8');
}

type Envelope = { keyId: string; iv: Buffer; ciphertext: Buffer; tag: Buffer };

function parseEnvelope(envelope: string): Envelope {
  const parts = envelope.split(':');
  const [version, keyId, ivText, ciphertextText, tagText] = parts;
  if (
    parts.length !== 5 ||
    version !== VERSION ||
    !keyId ||
    !ivText ||
    ciphertextText === undefined ||
    !tagText
  ) {
    throw new DecryptionError('malformed');
  }
  const iv = decodeBase64(ivText);
  const tag = decodeBase64(tagText);
  // An empty plaintext has an empty ciphertext, which is a valid envelope.
  const ciphertext = ciphertextText === '' ? Buffer.alloc(0) : decodeBase64(ciphertextText);
  if (iv?.length !== IV_BYTES || tag?.length !== TAG_BYTES || ciphertext === undefined) {
    throw new DecryptionError('malformed', keyId);
  }
  return { keyId, iv, ciphertext, tag };
}
