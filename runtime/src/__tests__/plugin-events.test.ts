import { describe, expect, it } from 'vitest';
import { requireEventsPluginContext } from '../plugin-events';

describe('requireEventsPluginContext', () => {
  it('throws when pluginId is null (no plugin route context)', () => {
    expect(() =>
      requireEventsPluginContext(null, { permissions: ['events:publish'] }, 'events:publish'),
    ).toThrow(/plugin route context/);
  });

  it('throws when the plugin is not installed (no manifest)', () => {
    expect(() =>
      requireEventsPluginContext('com.example.notes', undefined, 'events:publish'),
    ).toThrow(/not installed/);
  });

  it('throws when the manifest lacks the required permission', () => {
    expect(() =>
      requireEventsPluginContext(
        'com.example.notes',
        { permissions: ['db:readWrite'] },
        'events:publish',
      ),
    ).toThrow(/events:publish/);
  });

  it('does not throw and returns the narrowed pluginId/manifest when the permission is declared', () => {
    const manifest = { permissions: ['events:publish'] };
    const result = requireEventsPluginContext('com.example.notes', manifest, 'events:publish');
    expect(result).toEqual({ pluginId: 'com.example.notes', manifest });
  });

  it('checks the specific permission requested, not just any events permission', () => {
    expect(() =>
      requireEventsPluginContext(
        'com.example.notes',
        { permissions: ['events:subscribe'] },
        'events:publish',
      ),
    ).toThrow(/events:publish/);
  });
});
