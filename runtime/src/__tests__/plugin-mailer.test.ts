import { describe, expect, it } from 'vitest';
import {
  PLUGIN_MAILER_RATE_LIMIT_MAX_PER_PLUGIN,
  PLUGIN_MAILER_RATE_LIMIT_MAX_PER_RECIPIENT,
  checkPluginMailerRateLimit,
  pluginMailerRateLimitBucketCountForTests,
  requireMailerPluginContext,
  resetPluginMailerRateLimitForTests,
} from '../plugin-mailer';

describe('requireMailerPluginContext (RFC 0062)', () => {
  it('rejects calls made outside a plugin route context', () => {
    expect(() =>
      requireMailerPluginContext(null, { permissions: ['mailer:send'] }, 'mailer:send'),
    ).toThrow(/plugin route context/);
  });

  it('rejects a plugin ID that is not installed', () => {
    expect(() => requireMailerPluginContext('com.example.ghost', undefined, 'mailer:send')).toThrow(
      /is not installed/,
    );
  });

  it('rejects a plugin without the required permission', () => {
    expect(() =>
      requireMailerPluginContext(
        'com.example.notes',
        { permissions: ['db:readWrite'] },
        'mailer:send',
      ),
    ).toThrow(/does not have the "mailer:send" permission/);
  });

  it('rejects sdk.mailer.send for a plugin with mailer:send but not mailer:sendExternal', () => {
    const manifest = { permissions: ['mailer:send'] };
    expect(() =>
      requireMailerPluginContext('com.example.notes', manifest, 'mailer:sendExternal'),
    ).toThrow(/does not have the "mailer:sendExternal" permission/);
  });

  it('returns the narrowed plugin ID and manifest when the permission is declared', () => {
    const manifest = { permissions: ['mailer:send', 'mailer:sendExternal'] };
    expect(requireMailerPluginContext('com.example.notes', manifest, 'mailer:send')).toEqual({
      pluginId: 'com.example.notes',
      manifest,
    });
  });
});

describe('checkPluginMailerRateLimit (RFC 0062)', () => {
  it('rate-limits per plugin regardless of recipient', () => {
    resetPluginMailerRateLimitForTests();
    for (let i = 0; i < PLUGIN_MAILER_RATE_LIMIT_MAX_PER_PLUGIN; i += 1) {
      const result = checkPluginMailerRateLimit('com.example.notes', `user-${String(i)}`, 1_000);
      expect(result.allowed).toBe(true);
    }
    const denied = checkPluginMailerRateLimit('com.example.notes', 'user-overflow', 1_000);
    expect(denied.allowed).toBe(false);
    expect(denied.scope).toBe('plugin');
    expect(denied.retryAfterSeconds).toBeGreaterThan(0);
  });

  it('rate-limits per recipient within a plugin, independent of the plugin-wide budget', () => {
    resetPluginMailerRateLimitForTests();
    for (let i = 0; i < PLUGIN_MAILER_RATE_LIMIT_MAX_PER_RECIPIENT; i += 1) {
      const result = checkPluginMailerRateLimit('com.example.notes', 'user-1', 1_000);
      expect(result.allowed).toBe(true);
    }
    const denied = checkPluginMailerRateLimit('com.example.notes', 'user-1', 1_000);
    expect(denied.allowed).toBe(false);
    expect(denied.scope).toBe('recipient');

    // A different recipient under the same plugin still has its own budget.
    expect(checkPluginMailerRateLimit('com.example.notes', 'user-2', 1_000).allowed).toBe(true);
  });

  it('resets once the window elapses', () => {
    resetPluginMailerRateLimitForTests();
    for (let i = 0; i < PLUGIN_MAILER_RATE_LIMIT_MAX_PER_RECIPIENT; i += 1) {
      checkPluginMailerRateLimit('com.example.notes', 'user-1', 1_000);
    }
    expect(checkPluginMailerRateLimit('com.example.notes', 'user-1', 1_000).allowed).toBe(false);
    expect(checkPluginMailerRateLimit('com.example.notes', 'user-1', 62_000).allowed).toBe(true);
  });

  describe('lazy eviction', () => {
    it('evicts expired entries from both maps once both the window and the eviction interval have elapsed, leaving a still-active pair untouched', () => {
      resetPluginMailerRateLimitForTests();
      checkPluginMailerRateLimit('plugin-a', 'user-a', 1_000);
      checkPluginMailerRateLimit('plugin-b', 'user-b', 1_000);
      expect(pluginMailerRateLimitBucketCountForTests()).toBe(4); // 2 plugin + 2 recipient entries

      // Window elapsed (60_000ms) but the eviction interval (5min) has not
      // -- a call here must not shrink the combined count yet.
      checkPluginMailerRateLimit('plugin-c', 'user-c', 61_500);
      expect(pluginMailerRateLimitBucketCountForTests()).toBe(6);

      // Eviction interval elapsed (5min since lastSweepAt, which starts at
      // 0) -- sweeps every expired entry from both maps before adding its own.
      checkPluginMailerRateLimit('plugin-d', 'user-d', 400_000);
      expect(pluginMailerRateLimitBucketCountForTests()).toBe(2);
    });

    it('sweeps at most once per eviction interval, and the gate covers both checkBucket calls in a single invocation', () => {
      resetPluginMailerRateLimitForTests();
      checkPluginMailerRateLimit('plugin-a', 'user-a', 1_000);

      // Crosses the eviction-interval threshold -- sweeps plugin-a's pair
      // away and resets lastSweepAt to 300_000.
      checkPluginMailerRateLimit('plugin-b', 'user-b', 300_000);
      expect(pluginMailerRateLimitBucketCountForTests()).toBe(2);

      // plugin-b's own window has now elapsed, but this call sits well
      // within the eviction interval of the last sweep -- the gate must
      // block a re-sweep (checked once per invocation, covering both the
      // plugin-scope and recipient-scope checkBucket calls), so plugin-b's
      // pair survives despite being expired.
      checkPluginMailerRateLimit('plugin-c', 'user-c', 360_500);
      expect(pluginMailerRateLimitBucketCountForTests()).toBe(4);

      // A full interval past the last real sweep -- fires again and removes
      // every entry expired by this point.
      checkPluginMailerRateLimit('plugin-d', 'user-d', 600_000);
      expect(pluginMailerRateLimitBucketCountForTests()).toBe(2);
    });
  });
});
