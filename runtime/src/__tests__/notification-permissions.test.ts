import { beforeEach, describe, expect, it } from 'vitest';
import {
  checkNotificationRateLimit,
  NOTIFICATION_RATE_LIMIT_MAX_PER_PLUGIN,
  NOTIFICATION_RATE_LIMIT_MAX_PER_RECIPIENT,
  NOTIFICATION_RATE_LIMIT_WINDOW_MS,
  notificationRateLimitBucketCountForTests,
  requireNotificationsPluginContext,
  resetNotificationRateLimitForTests,
} from '../notification-permissions';

describe('requireNotificationsPluginContext', () => {
  it('throws when pluginId is null (missing/forged x-sovereign-plugin-id header)', () => {
    expect(() =>
      requireNotificationsPluginContext(null, {
        id: 'com.example.notes',
        permissions: ['notifications:send'],
      }),
    ).toThrow(/plugin route context/);
  });

  it('throws when the plugin is not installed (no manifest)', () => {
    expect(() => requireNotificationsPluginContext('com.example.notes', undefined)).toThrow(
      /not installed/,
    );
  });

  it('throws when the manifest lacks the notifications:send permission', () => {
    expect(() =>
      requireNotificationsPluginContext('com.example.notes', {
        id: 'com.example.notes',
        permissions: ['db:readWrite'],
      }),
    ).toThrow(/notifications:send/);
  });

  it('does not throw when the manifest has the notifications:send permission', () => {
    expect(() =>
      requireNotificationsPluginContext('com.example.notes', {
        id: 'com.example.notes',
        permissions: ['notifications:send'],
      }),
    ).not.toThrow();
  });
});

describe('checkNotificationRateLimit', () => {
  beforeEach(() => {
    resetNotificationRateLimitForTests();
  });

  it('allows sends under both the per-plugin and per-recipient limits', () => {
    const result = checkNotificationRateLimit('com.example.notes', 'user-1', 1000);
    expect(result).toEqual({ allowed: true });
    expect(notificationRateLimitBucketCountForTests()).toBe(2);
  });

  it('blocks once a single recipient exceeds the per-recipient limit, independent of other recipients', () => {
    const now = 1000;
    for (let i = 0; i < NOTIFICATION_RATE_LIMIT_MAX_PER_RECIPIENT; i++) {
      expect(checkNotificationRateLimit('com.example.notes', 'user-1', now).allowed).toBe(true);
    }
    const blocked = checkNotificationRateLimit('com.example.notes', 'user-1', now);
    expect(blocked).toMatchObject({ allowed: false, scope: 'recipient' });
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);

    // A different recipient is unaffected.
    expect(checkNotificationRateLimit('com.example.notes', 'user-2', now).allowed).toBe(true);
  });

  it('blocks the whole plugin once the per-plugin limit is exceeded, even across different recipients', () => {
    const now = 1000;
    for (let i = 0; i < NOTIFICATION_RATE_LIMIT_MAX_PER_PLUGIN; i++) {
      expect(checkNotificationRateLimit('com.example.notes', `user-${i}`, now).allowed).toBe(true);
    }
    const blocked = checkNotificationRateLimit('com.example.notes', 'user-overflow', now);
    expect(blocked).toMatchObject({ allowed: false, scope: 'plugin' });
  });

  it('resets after the rate-limit window elapses', () => {
    const now = 1000;
    for (let i = 0; i < NOTIFICATION_RATE_LIMIT_MAX_PER_RECIPIENT; i++) {
      checkNotificationRateLimit('com.example.notes', 'user-1', now);
    }
    expect(checkNotificationRateLimit('com.example.notes', 'user-1', now).allowed).toBe(false);
    expect(
      checkNotificationRateLimit(
        'com.example.notes',
        'user-1',
        now + NOTIFICATION_RATE_LIMIT_WINDOW_MS + 1,
      ).allowed,
    ).toBe(true);
  });

  it('scopes buckets per plugin — a different plugin is unaffected by another plugin exhausting its limit', () => {
    const now = 1000;
    for (let i = 0; i < NOTIFICATION_RATE_LIMIT_MAX_PER_PLUGIN; i++) {
      checkNotificationRateLimit('com.example.notes', `user-${i}`, now);
    }
    expect(checkNotificationRateLimit('com.example.other', 'user-1', now).allowed).toBe(true);
  });
});
