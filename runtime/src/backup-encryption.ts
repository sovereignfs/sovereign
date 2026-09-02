import { Decrypter, Encrypter } from 'age-encryption';

/**
 * Encrypt data with a passphrase using age's own passphrase (scrypt) mode.
 * Returns the encrypted file as a base64url string.
 */
export async function encrypt(plaintext: Buffer, passphrase: string): Promise<string> {
  const encrypter = new Encrypter();
  encrypter.setPassphrase(passphrase);
  const ciphertext = await encrypter.encrypt(plaintext);
  return Buffer.from(ciphertext).toString('base64url');
}

/**
 * Decrypt data encrypted by `encrypt()`.
 * Throws if the passphrase is wrong or the data is tampered or corrupted.
 */
export async function decrypt(ciphertextBase64: string, passphrase: string): Promise<Buffer> {
  const decrypter = new Decrypter();
  decrypter.addPassphrase(passphrase);
  const ciphertext = Buffer.from(ciphertextBase64, 'base64url');
  try {
    const plaintext = await decrypter.decrypt(ciphertext);
    return Buffer.from(plaintext);
  } catch {
    throw new Error('Decryption failed: wrong passphrase or tampered/corrupted data');
  }
}

/**
 * Encrypt data to one or more age recipients (public keys, `age1...`) instead
 * of a passphrase. There is deliberately no corresponding server-side decrypt
 * function here — decrypting recipient-mode ciphertext happens only in the
 * operator's own `sv restore` invocation or client-side in the browser, never
 * in the running instance process (workstream 0023's "Sovereign never holds a
 * private key" invariant).
 */
export async function encryptToRecipients(
  plaintext: Buffer,
  recipients: string[],
): Promise<string> {
  const encrypter = new Encrypter();
  for (const recipient of recipients) {
    encrypter.addRecipient(recipient);
  }
  const ciphertext = await encrypter.encrypt(plaintext);
  return Buffer.from(ciphertext).toString('base64url');
}
