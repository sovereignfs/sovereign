import { createCipheriv, createDecipheriv, createHash, randomBytes, scryptSync } from 'node:crypto';
import { required } from './config';

const keys = new Map<string, Buffer>();

/**
 * The key a secret of the app's is kept under, one for each purpose (a person's refresh token, a device's push keys): derived from
 * `__PREFIX___AUTH_SECRET`, which the instance made once and keeps.
 */
function secretKey(purpose: string): Buffer {
  let key = keys.get(purpose);
  if (!key) {
    key = scryptSync(required('__PREFIX___AUTH_SECRET'), `__NAME__ ${purpose}`, 32);
    keys.set(purpose, key);
  }
  return key;
}

/** A secret is kept encrypted, with AES-256-GCM and a fresh nonce each time. By default, a refresh token's key. */
export function seal(plain: string, purpose = 'refresh tokens'): string {
  const nonce = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', secretKey(purpose), nonce);
  const body = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return Buffer.concat([nonce, cipher.getAuthTag(), body]).toString('base64');
}

export function open(sealed: string, purpose = 'refresh tokens'): string {
  const bytes = Buffer.from(sealed, 'base64');
  const decipher = createDecipheriv('aes-256-gcm', secretKey(purpose), bytes.subarray(0, 12));
  decipher.setAuthTag(bytes.subarray(12, 28));
  return Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString('utf8');
}

/** What the conditional update compares, since the ciphertext differs every time it is made. */
export const fingerprint = (token: string): string =>
  createHash('sha256').update(token).digest('hex');
