import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32; // 256 bits
const IV_LENGTH = 12; // 96 bits, recommended for GCM
const SALT_LENGTH = 16; // 128 bits
const TAG_LENGTH = 16; // 128 bits

/**
 * Derive an AES-256 key from a passphrase using scrypt.
 * Parameters match the defaults used by the `scrypt` Node.js module.
 */
export function deriveKey(passphrase: string, salt: Buffer): Buffer {
  return scryptSync(passphrase, salt, KEY_LENGTH);
}

/**
 * Encrypt data with a passphrase-derived key using AES-256-GCM.
 * Returns the IV, salt, ciphertext, and auth tag concatenated (all base64url).
 */
export function encrypt(plaintext: Buffer, passphrase: string): string {
  const salt = randomBytes(SALT_LENGTH);
  const iv = randomBytes(IV_LENGTH);
  const key = deriveKey(passphrase, salt);

  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();

  // Concatenate: salt + iv + ciphertext + authTag
  const combined = Buffer.concat([salt, iv, encrypted, authTag]);
  return combined.toString('base64url');
}

/**
 * Decrypt data encrypted by `encrypt()`.
 * Throws if the passphrase is wrong or the data is tampered.
 */
export function decrypt(ciphertextBase64: string, passphrase: string): Buffer {
  const combined = Buffer.from(ciphertextBase64, 'base64url');

  if (combined.length < SALT_LENGTH + IV_LENGTH + TAG_LENGTH) {
    throw new Error('Invalid ciphertext: too short');
  }

  const salt = combined.subarray(0, SALT_LENGTH);
  const iv = combined.subarray(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
  const ciphertext = combined.subarray(SALT_LENGTH + IV_LENGTH, combined.length - TAG_LENGTH);
  const authTag = combined.subarray(combined.length - TAG_LENGTH);

  if (ciphertext.length === 0) {
    throw new Error('Invalid ciphertext: empty');
  }

  const key = deriveKey(passphrase, salt);
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  try {
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  } catch {
    throw new Error('Decryption failed: wrong passphrase or tampered data');
  }
}
