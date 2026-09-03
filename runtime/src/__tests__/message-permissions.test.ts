import { describe, expect, it } from 'vitest';
import {
  MESSAGE_RATE_LIMIT_MAX_PER_PLUGIN,
  MESSAGE_RATE_LIMIT_MAX_PER_RECIPIENT,
  checkMessageRateLimit,
  messageRateLimitBucketCountForTests,
  requireMessagePluginContext,
  resetMessageRateLimitForTests,
} from '../message-permissions';

describe('requireMessagePluginContext (RFC 0048)', () => {
  it('rejects calls made outside a plugin route context', () => {
    expect(() => requireMessagePluginContext(null, { permissions: ['messages:send'] })).toThrow(
      /plugin route context/,
    );
  });

  it('rejects a plugin ID that is not installed', () => {
    expect(() => requireMessagePluginContext('com.example.ghost', undefined)).toThrow(
      /is not installed/,
    );
  });

  it('rejects a plugin without the messages:send permission', () => {
    expect(() =>
      requireMessagePluginContext('com.example.notes', { permissions: ['db:readWrite'] }),
    ).toThrow(/does not have the "messages:send" permission/);
  });

  it('returns the narrowed plugin ID and manifest when the permission is declared', () => {
    const manifest = { permissions: ['messages:send'] };
    expect(requireMessagePluginContext('com.example.notes', manifest)).toEqual({
      pluginId: 'com.example.notes',
      manifest,
    });
  });
});

describe('checkMessageRateLimit (RFC 0048)', () => {
  it('rate-limits per plugin regardless of recipient', () => {
    resetMessageRateLimitForTests();
    for (let i = 0; i < MESSAGE_RATE_LIMIT_MAX_PER_PLUGIN; i += 1) {
      const result = checkMessageRateLimit('com.example.notes', `user-${String(i)}`, 1_000);
      expect(result.allowed).toBe(true);
    }
    const denied = checkMessageRateLimit('com.example.notes', 'user-overflow', 1_000);
    expect(denied.allowed).toBe(false);
    expect(denied.scope).toBe('plugin');
    expect(denied.retryAfterSeconds).toBeGreaterThan(0);
  });

  it('rate-limits per recipient within a plugin, independent of the plugin-wide budget', () => {
    resetMessageRateLimitForTests();
    for (let i = 0; i < MESSAGE_RATE_LIMIT_MAX_PER_RECIPIENT; i += 1) {
      const result = checkMessageRateLimit('com.example.notes', 'user-1', 1_000);
      expect(result.allowed).toBe(true);
    }
    const denied = checkMessageRateLimit('com.example.notes', 'user-1', 1_000);
    expect(denied.allowed).toBe(false);
    expect(denied.scope).toBe('recipient');

    // A different recipient under the same plugin still has its own budget.
    expect(checkMessageRateLimit('com.example.notes', 'user-2', 1_000).allowed).toBe(true);
  });

  it('resets once the window elapses', () => {
    resetMessageRateLimitForTests();
    for (let i = 0; i < MESSAGE_RATE_LIMIT_MAX_PER_RECIPIENT; i += 1) {
      checkMessageRateLimit('com.example.notes', 'user-1', 1_000);
    }
    expect(checkMessageRateLimit('com.example.notes', 'user-1', 1_000).allowed).toBe(false);
    expect(checkMessageRateLimit('com.example.notes', 'user-1', 62_000).allowed).toBe(true);
  });

  describe('lazy eviction', () => {
    it('evicts expired entries from both maps once both the window and the eviction interval have elapsed, leaving a still-active pair untouched', () => {
      resetMessageRateLimitForTests();
      checkMessageRateLimit('plugin-a', 'user-a', 1_000);
      checkMessageRateLimit('plugin-b', 'user-b', 1_000);
      expect(messageRateLimitBucketCountForTests()).toBe(4); // 2 plugin + 2 recipient entries

      // Window elapsed (60_000ms) but the eviction interval (5min) has not
      // -- a call here must not shrink the combined count yet.
      checkMessageRateLimit('plugin-c', 'user-c', 61_500);
      expect(messageRateLimitBucketCountForTests()).toBe(6);

      // Eviction interval elapsed (5min since lastSweepAt, which starts at
      // 0) -- sweeps every expired entry from both maps before adding its own.
      checkMessageRateLimit('plugin-d', 'user-d', 400_000);
      expect(messageRateLimitBucketCountForTests()).toBe(2);
    });
  });
});
