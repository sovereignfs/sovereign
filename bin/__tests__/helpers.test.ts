import { describe, expect, it } from 'vitest';

import {
  PLATFORM_PLUGIN_DIRS,
  assertRemovablePlugin,
  resolvePluginIdFromManifest,
} from '../helpers';

describe('assertRemovablePlugin', () => {
  it.each(PLATFORM_PLUGIN_DIRS)('refuses to remove the platform plugin %s', (id) => {
    expect(() => {
      assertRemovablePlugin(id);
    }).toThrow(/built-in platform plugin/);
  });

  it('allows removing a third-party plugin', () => {
    expect(() => {
      assertRemovablePlugin('fs.example.tasks');
    }).not.toThrow();
  });
});

describe('resolvePluginIdFromManifest', () => {
  const validManifest = JSON.stringify({
    schemaVersion: 1,
    id: 'fs.example.tasks',
    name: 'Tasks',
    version: '1.0.0',
    type: 'platform',
    runtime: 'native',
    routePrefix: '/tasks',
    permissions: ['auth:session'],
    compatibility: { minPlatformVersion: '0.4.0' },
  });

  it('returns the id from a valid manifest', () => {
    expect(resolvePluginIdFromManifest(validManifest)).toBe('fs.example.tasks');
  });

  it('throws on invalid JSON', () => {
    expect(() => resolvePluginIdFromManifest('{ not json')).toThrow(/not valid JSON/);
  });

  it('throws when the manifest fails validation', () => {
    expect(() => resolvePluginIdFromManifest('{}')).toThrow(/Invalid manifest\.json/);
  });
});
