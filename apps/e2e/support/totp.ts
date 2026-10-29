import { createHmac } from 'node:crypto';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function fromBase32(text: string): Buffer {
  let bits = '';
  for (const character of text.replace(/[\s=]/g, '').toUpperCase()) {
    const value = ALPHABET.indexOf(character);
    if (value < 0) throw new Error(`Not a base32 key: ${text}`);
    bits += value.toString(2).padStart(5, '0');
  }
  const bytes: number[] = [];
  for (let at = 0; at + 8 <= bits.length; at += 8) bytes.push(parseInt(bits.slice(at, at + 8), 2));
  return Buffer.from(bytes);
}

/** The code an authenticator app shows for a key (RFC 6238: HMAC-SHA1, 30 seconds, 6 digits), `step` periods from now. */
export function totpCode(key: string, step = 0, now = Date.now()): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(now / 30_000) + step));
  const digest = createHmac('sha1', fromBase32(key)).update(counter).digest();
  const offset = (digest[digest.length - 1] ?? 0) & 0x0f;
  const number = digest.readUInt32BE(offset) & 0x7fffffff;
  return String(number % 1_000_000).padStart(6, '0');
}
