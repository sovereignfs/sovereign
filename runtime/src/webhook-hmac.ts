import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Pure HMAC verification (RFC 0050) — split out from `sdk-host.ts`'s
 * `webhooks.verifyHmac` so the actual crypto comparison is directly
 * unit-testable without a database/secret-vault (which `sdk-host.ts` as a
 * whole isn't set up to be — see its own file for why). Computes
 * `HMAC(algorithm, secret, body)` as a hex digest and compares it against
 * `signatureHeader` with a length check before `timingSafeEqual` — `Buffer`s
 * of different length throw rather than compare, so the length check must
 * happen first (same idiom as `runtime/src/connections.ts`/`storage.ts`'s
 * `safeEqual`). `signatureHeader` is compared as a raw hex string, not
 * decoded first — decoding malformed input never throws in Node
 * (`Buffer.from(garbage, 'hex')` silently truncates), so comparing the
 * encoded string bytes directly is both simpler and no less safe.
 */
export function verifyHmacDigest(
  algorithm: 'sha256' | 'sha512',
  secret: string,
  body: Uint8Array,
  signatureHeader: string,
): boolean {
  const digest = createHmac(algorithm, secret).update(Buffer.from(body)).digest('hex');
  const expected = Buffer.from(digest, 'utf8');
  const actual = Buffer.from(signatureHeader, 'utf8');
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
