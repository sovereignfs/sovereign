import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Download addresses that work without a session, for a few minutes (RFC 0004 §2): an `<img>` on another of the app's pages, or a
 * link handed to the browser. The signature covers the person, the file and when it stops working, made with the app's own key, and is
 * compared in constant time.
 */
export type Signature = { expires: number; signature: string };

const payload = (sub: string, id: string, expires: number) => `${sub}\n${id}\n${expires}`;

export function sign(key: string, sub: string, id: string, expires: number): string {
  return createHmac('sha256', key)
    .update(payload(sub, id, expires))
    .digest('base64url');
}

/** Whether a signature is good for this person and file and has not run out. Never throws on something malformed. */
export function verify(
  key: string,
  sub: string,
  id: string,
  given: { expires: unknown; signature: unknown },
  now: number,
): boolean {
  const expires = typeof given.expires === 'string' ? Number(given.expires) : given.expires;
  if (typeof expires !== 'number' || !Number.isSafeInteger(expires) || expires <= now) return false;
  if (typeof given.signature !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(given.signature))
    return false;
  const expected = Buffer.from(sign(key, sub, id, expires));
  const actual = Buffer.from(given.signature);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
