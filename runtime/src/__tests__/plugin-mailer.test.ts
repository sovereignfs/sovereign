import { describe, expect, it } from 'vitest';
import {
  PLUGIN_MAILER_RATE_LIMIT_MAX_PER_PLUGIN,
  PLUGIN_MAILER_RATE_LIMIT_MAX_PER_RECIPIENT,
  checkPluginMailerRateLimit,
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
});
