import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resetAdminRateLimitForTests } from '../admin-rate-limit';
import { checkAdminKey } from '../admin-guard';

function requestWithAuth(header?: string, ip = '203.0.113.1'): Request {
  return new Request('http://localhost:3000/api/admin/plugins', {
    headers: {
      ...(header ? { authorization: header } : {}),
      'x-forwarded-for': ip,
    },
  });
}

describe('checkAdminKey (runtime)', () => {
  const original = process.env.SOVEREIGN_ADMIN_KEY;

  beforeEach(() => {
    process.env.SOVEREIGN_ADMIN_KEY = 'test-admin-key';
    resetAdminRateLimitForTests();
  });

  afterEach(() => {
    if (original === undefined) delete process.env.SOVEREIGN_ADMIN_KEY;
    else process.env.SOVEREIGN_ADMIN_KEY = original;
  });

  it('returns null for a valid bearer token', () => {
    expect(checkAdminKey(requestWithAuth('Bearer test-admin-key'))).toBeNull();
  });

  it('returns 403 for a wrong key', () => {
    expect(checkAdminKey(requestWithAuth('Bearer wrong'))?.status).toBe(403);
  });

  it('returns 403 when the header is missing', () => {
    expect(checkAdminKey(requestWithAuth())?.status).toBe(403);
  });

  it('returns 403, not a thrown error, for a wrong key of a different length', () => {
    // timingSafeEqual throws on mismatched-length buffers -- this proves the
    // length check runs first, matching the pattern already established in
    // connections.ts/storage.ts's own safeEqual().
    expect(() => checkAdminKey(requestWithAuth('Bearer x'))).not.toThrow();
    expect(checkAdminKey(requestWithAuth('Bearer x'))?.status).toBe(403);
  });

  it('returns 503 when SOVEREIGN_ADMIN_KEY is not configured', () => {
    delete process.env.SOVEREIGN_ADMIN_KEY;
    expect(checkAdminKey(requestWithAuth('Bearer anything'))?.status).toBe(503);
  });

  it('an unconfigured-key 503 does not count against the rate limit', () => {
    delete process.env.SOVEREIGN_ADMIN_KEY;
    for (let i = 0; i < 20; i++) {
      expect(checkAdminKey(requestWithAuth('Bearer anything'))?.status).toBe(503);
    }
    process.env.SOVEREIGN_ADMIN_KEY = 'test-admin-key';
    expect(checkAdminKey(requestWithAuth('Bearer test-admin-key'))).toBeNull();
  });

  it('returns 429 with Retry-After once an IP has failed the key check too many times', () => {
    for (let i = 0; i < 10; i++) {
      expect(checkAdminKey(requestWithAuth('Bearer wrong'))?.status).toBe(403);
    }
    const tripped = checkAdminKey(requestWithAuth('Bearer wrong'));
    expect(tripped?.status).toBe(429);
    expect(tripped?.headers.get('Retry-After')).toBeTruthy();
  });

  it('rejects even a correct key once the IP has already tripped the limiter', () => {
    for (let i = 0; i < 10; i++) {
      checkAdminKey(requestWithAuth('Bearer wrong'));
    }
    const result = checkAdminKey(requestWithAuth('Bearer test-admin-key'));
    expect(result?.status).toBe(429);
  });

  it('does not throttle a different IP', () => {
    for (let i = 0; i < 10; i++) {
      checkAdminKey(requestWithAuth('Bearer wrong', '203.0.113.1'));
    }
    expect(checkAdminKey(requestWithAuth('Bearer test-admin-key', '203.0.113.2'))).toBeNull();
  });

  it('does not throttle repeated valid requests from the same IP', () => {
    for (let i = 0; i < 20; i++) {
      expect(checkAdminKey(requestWithAuth('Bearer test-admin-key'))).toBeNull();
    }
  });
});
