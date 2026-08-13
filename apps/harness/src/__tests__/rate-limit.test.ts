import { beforeEach, describe, expect, it } from 'vitest';
import {
  checkChatRateLimit,
  checkEnrollRateLimit,
  clientIp,
  releaseChatSlot,
  resetConcurrencyForTests,
  resetRateLimitsForTests,
  tryAcquireChatSlot,
} from '../rate-limit';

beforeEach(() => {
  resetRateLimitsForTests();
  resetConcurrencyForTests();
});

describe('checkEnrollRateLimit', () => {
  it('allows requests under the limit', () => {
    for (let i = 0; i < 10; i++) {
      expect(checkEnrollRateLimit('1.2.3.4').allowed).toBe(true);
    }
  });

  it('blocks the 11th request in the same window', () => {
    for (let i = 0; i < 10; i++) checkEnrollRateLimit('1.2.3.4');
    const result = checkEnrollRateLimit('1.2.3.4');
    expect(result.allowed).toBe(false);
    expect(result.retryAfterSeconds).toBeGreaterThan(0);
  });

  it('tracks separate IPs independently', () => {
    for (let i = 0; i < 10; i++) checkEnrollRateLimit('1.2.3.4');
    expect(checkEnrollRateLimit('5.6.7.8').allowed).toBe(true);
  });

  it('resets after the window elapses', () => {
    const now = Date.now();
    for (let i = 0; i < 10; i++) checkEnrollRateLimit('1.2.3.4', now);
    expect(checkEnrollRateLimit('1.2.3.4', now + 61_000).allowed).toBe(true);
  });
});

describe('checkChatRateLimit', () => {
  it('allows requests under the limit and blocks past it', () => {
    for (let i = 0; i < 60; i++) {
      expect(checkChatRateLimit('instance-a').allowed).toBe(true);
    }
    expect(checkChatRateLimit('instance-a').allowed).toBe(false);
  });
});

describe('concurrency slot', () => {
  it('allows up to maxConcurrency in flight, blocks beyond it', () => {
    expect(tryAcquireChatSlot(2)).toBe(true);
    expect(tryAcquireChatSlot(2)).toBe(true);
    expect(tryAcquireChatSlot(2)).toBe(false);
  });

  it('frees a slot on release', () => {
    tryAcquireChatSlot(1);
    expect(tryAcquireChatSlot(1)).toBe(false);
    releaseChatSlot();
    expect(tryAcquireChatSlot(1)).toBe(true);
  });
});

describe('clientIp', () => {
  it('uses the last X-Forwarded-For hop', () => {
    const request = new Request('http://x', {
      headers: { 'x-forwarded-for': '1.1.1.1, 2.2.2.2, 3.3.3.3' },
    });
    expect(clientIp(request)).toBe('3.3.3.3');
  });

  it('falls back to X-Real-IP', () => {
    const request = new Request('http://x', { headers: { 'x-real-ip': '9.9.9.9' } });
    expect(clientIp(request)).toBe('9.9.9.9');
  });

  it('falls back to unknown', () => {
    expect(clientIp(new Request('http://x'))).toBe('unknown');
  });
});
