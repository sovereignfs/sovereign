import { createHmac } from 'node:crypto';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/** RFC 4648 base32, which is what an authenticator app is given. */
export function base32Decode(text: string): Buffer {
  let bits = '';
  for (const char of text.replace(/=+$/, '').toUpperCase()) {
    const value = ALPHABET.indexOf(char);
    if (value < 0) throw new Error(`not base32: ${char}`);
    bits += value.toString(2).padStart(5, '0');
  }
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8)
    bytes.push(Number.parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}

/**
 * The code an authenticator app shows (RFC 6238, SHA-1), written here on purpose rather than taken
 * from better-auth: the tests must agree with the standard, not with the code under test.
 */
export function totp(secretBase32: string, atMs = Date.now(), digits = 6, period = 30): string {
  const counter = Math.floor(atMs / 1000 / period);
  const message = Buffer.alloc(8);
  message.writeBigUInt64BE(BigInt(counter));
  const hmac = createHmac('sha1', base32Decode(secretBase32)).update(message).digest();
  const offset = (hmac[hmac.length - 1] ?? 0) & 0xf;
  const binary =
    (((hmac[offset] ?? 0) & 0x7f) << 24) |
    (((hmac[offset + 1] ?? 0) & 0xff) << 16) |
    (((hmac[offset + 2] ?? 0) & 0xff) << 8) |
    ((hmac[offset + 3] ?? 0) & 0xff);
  return String(binary % 10 ** digits).padStart(digits, '0');
}

/** The secret an `otpauth://` address carries. */
export function secretOf(uri: string): string {
  const secret = new URL(uri).searchParams.get('secret');
  if (!secret) throw new Error('the address carries no secret');
  return secret;
}
