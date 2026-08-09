import { beforeEach, describe, expect, it } from 'vitest';
import {
  checkEnrollRateLimit,
  checkPushRateLimit,
  clientIp,
  resetRateLimitsForTests,
} from '../rate-limit';

beforeEach(() => {
  resetRateLimitsForTests();
});

describe('checkEnrollRateLimit', () => {
  it('allows up to the limit, then blocks with a Retry-After', () => {
    for (let i = 0; i < 10; i++) {
      expect(checkEnrollRateLimit('1.2.3.4', 0).allowed).toBe(true);
    }
    const blocked = checkEnrollRateLimit('1.2.3.4', 0);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
  });

  it('tracks different IPs independently', () => {
    for (let i = 0; i < 10; i++) checkEnrollRateLimit('1.1.1.1', 0);
    expect(checkEnrollRateLimit('1.1.1.1', 0).allowed).toBe(false);
    expect(checkEnrollRateLimit('2.2.2.2', 0).allowed).toBe(true);
  });

  it('resets after the window elapses', () => {
    for (let i = 0; i < 10; i++) checkEnrollRateLimit('1.2.3.4', 0);
    expect(checkEnrollRateLimit('1.2.3.4', 0).allowed).toBe(false);
    expect(checkEnrollRateLimit('1.2.3.4', 61_000).allowed).toBe(true);
  });
});

describe('checkPushRateLimit', () => {
  it('tracks per instance id, higher ceiling than enroll', () => {
    for (let i = 0; i < 600; i++) {
      expect(checkPushRateLimit('instance-a', 0).allowed).toBe(true);
    }
    expect(checkPushRateLimit('instance-a', 0).allowed).toBe(false);
    expect(checkPushRateLimit('instance-b', 0).allowed).toBe(true);
  });
});

describe('clientIp', () => {
  it('trusts the last X-Forwarded-For hop', () => {
    const req = new Request('http://localhost', {
      headers: { 'x-forwarded-for': '203.0.113.1, 10.0.0.1' },
    });
    expect(clientIp(req)).toBe('10.0.0.1');
  });

  it('falls back to X-Real-IP', () => {
    const req = new Request('http://localhost', { headers: { 'x-real-ip': '203.0.113.9' } });
    expect(clientIp(req)).toBe('203.0.113.9');
  });

  it('falls back to a sentinel when neither header is present', () => {
    const req = new Request('http://localhost');
    expect(clientIp(req)).toBe('unknown');
  });
});
