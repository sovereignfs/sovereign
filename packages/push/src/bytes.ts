/** URL-safe base64 with no padding, the form every Web Push key and header uses. */
export const toBase64Url = (bytes: Uint8Array): string => Buffer.from(bytes).toString('base64url');

/**
 * Bytes from URL-safe base64, or `undefined` for anything that is not exactly that: no `+`, `/`, `=` or whitespace, and a length
 * that decodes whole. Node's own decoder skips what it cannot read, so the text is checked first.
 */
export function fromBase64Url(text: unknown): Uint8Array | undefined {
  if (typeof text !== 'string' || !/^[A-Za-z0-9_-]*$/.test(text) || text.length % 4 === 1)
    return undefined;
  const bytes = Buffer.from(text, 'base64url');
  // A text whose last character carries bits that are not zero is not the canonical form of any bytes.
  if (toBase64Url(bytes) !== text) return undefined;
  return new Uint8Array(bytes);
}

export const utf8 = (text: string): Uint8Array => new TextEncoder().encode(text);

export function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}
