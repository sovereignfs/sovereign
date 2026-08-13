import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { verifyHmacDigest } from '../webhook-hmac';

function hexDigest(algorithm: 'sha256' | 'sha512', secret: string, body: string): string {
  return createHmac(algorithm, secret).update(Buffer.from(body, 'utf8')).digest('hex');
}

describe('verifyHmacDigest', () => {
  it('returns true for a correctly computed sha256 signature', () => {
    const body = new TextEncoder().encode('{"event":"delivered"}');
    const digest = hexDigest('sha256', 'my-secret', '{"event":"delivered"}');
    expect(verifyHmacDigest('sha256', 'my-secret', body, digest)).toBe(true);
  });

  it('returns true for a correctly computed sha512 signature', () => {
    const body = new TextEncoder().encode('{"event":"delivered"}');
    const digest = hexDigest('sha512', 'my-secret', '{"event":"delivered"}');
    expect(verifyHmacDigest('sha512', 'my-secret', body, digest)).toBe(true);
  });

  it('returns false for a wrong secret', () => {
    const body = new TextEncoder().encode('{"event":"delivered"}');
    const digest = hexDigest('sha256', 'my-secret', '{"event":"delivered"}');
    expect(verifyHmacDigest('sha256', 'wrong-secret', body, digest)).toBe(false);
  });

  it('returns false for a tampered body', () => {
    const digest = hexDigest('sha256', 'my-secret', '{"event":"delivered"}');
    const tamperedBody = new TextEncoder().encode('{"event":"refunded"}');
    expect(verifyHmacDigest('sha256', 'my-secret', tamperedBody, digest)).toBe(false);
  });

  it('returns false when the algorithm does not match how the digest was computed', () => {
    const body = new TextEncoder().encode('{"event":"delivered"}');
    const digest = hexDigest('sha256', 'my-secret', '{"event":"delivered"}');
    expect(verifyHmacDigest('sha512', 'my-secret', body, digest)).toBe(false);
  });

  it('returns false for an empty signature header', () => {
    const body = new TextEncoder().encode('{"event":"delivered"}');
    expect(verifyHmacDigest('sha256', 'my-secret', body, '')).toBe(false);
  });

  it('returns false for a signature of different length (no timingSafeEqual throw)', () => {
    const body = new TextEncoder().encode('{"event":"delivered"}');
    expect(() => verifyHmacDigest('sha256', 'my-secret', body, 'deadbeef')).not.toThrow();
    expect(verifyHmacDigest('sha256', 'my-secret', body, 'deadbeef')).toBe(false);
  });

  it('returns false for malformed (non-hex) input without throwing', () => {
    const body = new TextEncoder().encode('{"event":"delivered"}');
    expect(() => verifyHmacDigest('sha256', 'my-secret', body, 'not-hex-at-all!!')).not.toThrow();
    expect(verifyHmacDigest('sha256', 'my-secret', body, 'not-hex-at-all!!')).toBe(false);
  });

  it('is case-sensitive on the hex digest (uppercase does not match lowercase)', () => {
    const body = new TextEncoder().encode('{"event":"delivered"}');
    const digest = hexDigest('sha256', 'my-secret', '{"event":"delivered"}');
    expect(verifyHmacDigest('sha256', 'my-secret', body, digest.toUpperCase())).toBe(false);
  });
});
