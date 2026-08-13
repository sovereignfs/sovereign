import { afterEach, beforeEach, describe, expect, it } from 'vitest';

beforeEach(() => {
  process.env.SOVEREIGN_HARNESS_ENROLLMENT_SECRET = 'test-secret';
});

afterEach(async () => {
  delete process.env.SOVEREIGN_HARNESS_ENROLLMENT_SECRET;
  const { resetRateLimitsForTests } = await import('../../../../src/rate-limit');
  resetRateLimitsForTests();
});

describe('POST /api/enroll', () => {
  it('returns 503 not_configured when SOVEREIGN_HARNESS_ENROLLMENT_SECRET is unset', async () => {
    delete process.env.SOVEREIGN_HARNESS_ENROLLMENT_SECRET;
    const { POST } = await import('../route');
    const res = await POST(new Request('http://localhost/api/enroll', { method: 'POST' }));
    expect(res.status).toBe(503);
    expect((await res.json()).error).toBe('not_configured');
  });

  it('issues an instanceId and a verifiable instanceKey', async () => {
    const { POST } = await import('../route');
    const { verifyEnrollmentToken } = await import('../../../../src/enrollment');
    const res = await POST(new Request('http://localhost/api/enroll', { method: 'POST' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(typeof body.instanceId).toBe('string');
    expect(typeof body.instanceKey).toBe('string');
    expect(verifyEnrollmentToken(body.instanceKey)).toEqual({ instanceId: body.instanceId });
  });

  it('rate-limits repeated enrollment from the same IP', async () => {
    const { POST } = await import('../route');
    const request = () =>
      POST(
        new Request('http://localhost/api/enroll', {
          method: 'POST',
          headers: { 'x-forwarded-for': '9.9.9.9' },
        }),
      );
    for (let i = 0; i < 10; i++) {
      expect((await request()).status).toBe(200);
    }
    const blocked = await request();
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get('Retry-After')).toBeTruthy();
  });
});
