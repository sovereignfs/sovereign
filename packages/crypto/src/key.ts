import { randomBytes } from 'node:crypto';
import { KEY_BYTES } from './keyring.js';

/** A new random key, base64, ready to put after an id in the key ring: `k1:<this>`. */
export function generateKey(): string {
  return randomBytes(KEY_BYTES).toString('base64');
}
