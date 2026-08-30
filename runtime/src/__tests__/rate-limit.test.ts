import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  checkGlobalRateLimit,
  clientIp,
  isGlobalRateLimitDisabled,
  rateLimitBucketCountForTests,
  resetGlobalRateLimitForTests,
} from '../rate-limit';

function request(headers: Record<string, string> = {}): NextRequest {
  return new NextRequest('http://runtime.test/', { headers });
}

describe('rate-limit', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    resetGlobalRateLimitForTests();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  describe('checkGlobalRateLimit', () => {
    it('allows requests under the configured max, then denies within the window', () => {
      process.env.SOVEREIGN_RATE_LIMIT_MAX_REQUESTS = '3';
      for (let i = 0; i < 3; i += 1) {
        expect(checkGlobalRateLimit('1.2.3.4', 1_000).allowed).toBe(true);
      }
      const denied = checkGlobalRateLimit('1.2.3.4', 1_000);
      expect(denied.allowed).toBe(false);
      expect(denied.retryAfterSeconds).toBeGreaterThan(0);
    });

    it('resets once the window elapses', () => {
      process.env.SOVEREIGN_RATE_LIMIT_MAX_REQUESTS = '1';
      process.env.SOVEREIGN_RATE_LIMIT_WINDOW_MS = '1000';
      expect(checkGlobalRateLimit('1.2.3.4', 1_000).allowed).toBe(true);
      expect(checkGlobalRateLimit('1.2.3.4', 1_500).allowed).toBe(false);
      expect(checkGlobalRateLimit('1.2.3.4', 2_001).allowed).toBe(true);
    });

    it('tracks separate keys independently', () => {
      process.env.SOVEREIGN_RATE_LIMIT_MAX_REQUESTS = '1';
      expect(checkGlobalRateLimit('1.2.3.4', 1_000).allowed).toBe(true);
      expect(checkGlobalRateLimit('5.6.7.8', 1_000).allowed).toBe(true);
      expect(checkGlobalRateLimit('1.2.3.4', 1_000).allowed).toBe(false);
    });

    it('falls back to the default window/max when the env vars are unset or invalid', () => {
      delete process.env.SOVEREIGN_RATE_LIMIT_MAX_REQUESTS;
      delete process.env.SOVEREIGN_RATE_LIMIT_WINDOW_MS;
      for (let i = 0; i < 300; i += 1) {
        expect(checkGlobalRateLimit('1.2.3.4', 1_000).allowed).toBe(true);
      }
      expect(checkGlobalRateLimit('1.2.3.4', 1_000).allowed).toBe(false);
    });

    it('treats a non-numeric env override as unset rather than crashing', () => {
      process.env.SOVEREIGN_RATE_LIMIT_MAX_REQUESTS = 'not-a-number';
      expect(checkGlobalRateLimit('1.2.3.4', 1_000).allowed).toBe(true);
    });
  });

  describe('lazy eviction', () => {
    it('evicts expired entries once both the window and the eviction interval have elapsed, leaving a still-active key untouched', () => {
      checkGlobalRateLimit('key-a', 1_000);
      checkGlobalRateLimit('key-b', 1_000);
      checkGlobalRateLimit('key-c', 1_000);
      expect(rateLimitBucketCountForTests()).toBe(3);

      // Window elapsed (default 60_000ms) but eviction interval (5min) has
      // not -- a call here must not shrink the map yet.
      checkGlobalRateLimit('key-d', 61_500);
      expect(rateLimitBucketCountForTests()).toBe(4);

      // Eviction interval elapsed (5min since lastSweepAt, which starts at
      // 0) -- this call sweeps every entry whose window has expired
      // (key-a/b/c/d all qualify by now) before adding its own new key.
      checkGlobalRateLimit('key-e', 400_000);
      expect(rateLimitBucketCountForTests()).toBe(1);
    });

    it('sweeps at most once per eviction interval, not on every call', () => {
      checkGlobalRateLimit('key-a', 1_000);

      // Crosses the eviction-interval threshold -- sweeps key-a away and
      // resets lastSweepAt to 300_000.
      checkGlobalRateLimit('key-b', 300_000);
      expect(rateLimitBucketCountForTests()).toBe(1);

      // key-b's own window (60_000ms) has now elapsed, but this call sits
      // well within EVICTION_INTERVAL_MS of the last sweep (300_000) -- the
      // gate must block a re-sweep, so key-b survives despite being expired.
      checkGlobalRateLimit('key-c', 360_500);
      expect(rateLimitBucketCountForTests()).toBe(2); // key-b (expired, unswept) + key-c

      // A full interval past the last real sweep (300_000) -- now it fires
      // again and removes every entry expired by this point (key-b and key-c
      // both are).
      checkGlobalRateLimit('key-d', 600_000);
      expect(rateLimitBucketCountForTests()).toBe(1);
    });
  });

  describe('isGlobalRateLimitDisabled', () => {
    it('is enabled by default (unset env var)', () => {
      delete process.env.SOVEREIGN_RATE_LIMIT_DISABLED;
      expect(isGlobalRateLimitDisabled()).toBe(false);
    });

    it.each(['1', 'true', 'yes', 'on', 'TRUE'])('treats %s as disabled', (value) => {
      process.env.SOVEREIGN_RATE_LIMIT_DISABLED = value;
      expect(isGlobalRateLimitDisabled()).toBe(true);
    });

    it('treats an unrecognized value as enabled (fail closed)', () => {
      process.env.SOVEREIGN_RATE_LIMIT_DISABLED = 'nah';
      expect(isGlobalRateLimitDisabled()).toBe(false);
    });
  });

  describe('clientIp', () => {
    it('trusts the last X-Forwarded-For hop, not the first', () => {
      // A client-forged first entry, with the proxy's own observed peer IP
      // appended as the last — the last entry is the one that can't be
      // spoofed by the client itself.
      expect(clientIp(request({ 'x-forwarded-for': '9.9.9.9, 5.6.7.8' }))).toBe('5.6.7.8');
    });

    it('handles a single X-Forwarded-For entry', () => {
      expect(clientIp(request({ 'x-forwarded-for': '1.2.3.4' }))).toBe('1.2.3.4');
    });

    it('falls back to X-Real-IP when X-Forwarded-For is absent', () => {
      expect(clientIp(request({ 'x-real-ip': '1.2.3.4' }))).toBe('1.2.3.4');
    });

    it('falls back to a fixed sentinel when neither header is present', () => {
      expect(clientIp(request())).toBe('unknown');
    });
  });
});
