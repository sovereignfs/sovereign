import { describe, expect, it } from 'vitest';
import { requireNotificationsPluginContext } from '../notification-permissions';

describe('requireNotificationsPluginContext', () => {
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
