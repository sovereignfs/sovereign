import { createCipheriv, createDecipheriv, createHash, randomBytes, scryptSync } from 'node:crypto';
import { required } from './config';

let key: Buffer | undefined;

/** The key a person's refresh token is kept under: derived from `__PREFIX___AUTH_SECRET`, which the instance made once and keeps. */
function secretKey(): Buffer {
  key ??= scryptSync(required('__PREFIX___AUTH_SECRET'), '__NAME__ refresh tokens', 32);
  return key;
}

/** A refresh token is a credential, so it is kept encrypted, with AES-256-GCM and a fresh nonce each time. */
export function seal(plain: string): string {
  const nonce = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', secretKey(), nonce);
  const body = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return Buffer.concat([nonce, cipher.getAuthTag(), body]).toString('base64');
}

export function open(sealed: string): string {
  const bytes = Buffer.from(sealed, 'base64');
  const decipher = createDecipheriv('aes-256-gcm', secretKey(), bytes.subarray(0, 12));
  decipher.setAuthTag(bytes.subarray(12, 28));
  return Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString('utf8');
}

/** What the conditional update compares, since the ciphertext differs every time it is made. */
export const fingerprint = (token: string): string =>
  createHash('sha256').update(token).digest('hex');
