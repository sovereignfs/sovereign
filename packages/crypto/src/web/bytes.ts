/**
 * Byte helpers for code that runs in a browser as well as in Node: no `Buffer`, no `node:` import.
 * The server's own helpers (`../encoding.ts`) use `Buffer` and stay as they are.
 */

const encoder = new TextEncoder();

/** UTF-8 bytes of a string. */
export const utf8 = (text: string): Uint8Array => encoder.encode(text);

/** One array holding each of `parts` in turn. */
export function concat(...parts: readonly Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

const URL_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

/** Unpadded base64url, the form every value of RFC 0005 is written in. */
export function toBase64Url(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i] as number;
    const b = bytes[i + 1];
    const c = bytes[i + 2];
    out += URL_ALPHABET[a >> 2];
    out += URL_ALPHABET[((a & 3) << 4) | ((b ?? 0) >> 4)];
    if (b !== undefined) out += URL_ALPHABET[((b & 15) << 2) | ((c ?? 0) >> 6)];
    if (c !== undefined) out += URL_ALPHABET[c & 63];
  }
  return out;
}

/**
 * Unpadded base64url to bytes, or `undefined` for anything that is not exactly that: a character
 * outside the alphabet, padding, or a length no encoding produces. Never a best guess.
 */
export function fromBase64Url(text: string): Uint8Array | undefined {
  if (text.length % 4 === 1) return undefined;
  const values: number[] = [];
  for (const char of text) {
    const value = URL_ALPHABET.indexOf(char);
    if (value === -1) return undefined;
    values.push(value);
  }
  const out = new Uint8Array(Math.floor((values.length * 3) / 4));
  let at = 0;
  for (let i = 0; i < values.length; i += 4) {
    const [a = 0, b = 0, c, d] = values.slice(i, i + 4);
    out[at++] = (a << 2) | (b >> 4);
    if (c !== undefined) out[at++] = ((b & 15) << 4) | (c >> 2);
    if (d !== undefined) out[at++] = (((c ?? 0) & 3) << 6) | d;
  }
  // Bits left over in the last character must be zero, or two strings would decode alike.
  return toBase64Url(out) === text ? out : undefined;
}

/** A `BufferSource` WebCrypto accepts for any `Uint8Array`, whatever buffer type it is over. */
export const source = (bytes: Uint8Array): Uint8Array<ArrayBuffer> =>
  new Uint8Array(bytes) as Uint8Array<ArrayBuffer>;
