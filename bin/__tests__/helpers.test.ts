import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import {
  PLATFORM_PLUGIN_DIRS,
  assertRemovablePlugin,
  defaultArchivePath,
  detectDialect,
  readPlatformVersion,
  resolvePluginIdFromManifest,
} from '../helpers';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

describe('detectDialect', () => {
  it.each([
    ['postgres://user:pass@host:5432/db', 'postgres'],
    ['postgresql://user@host/db', 'postgres'],
    ['file:./data/sovereign.db', 'sqlite'],
    ['/absolute/path/sovereign.db', 'sqlite'],
    [':memory:', 'sqlite'],
  ])('classifies %s as %s', (url, expected) => {
    expect(detectDialect(url)).toBe(expected);
  });
});

describe('defaultArchivePath', () => {
  it('builds a timestamped, version-tagged path under backups/', () => {
    const p = defaultArchivePath('/srv/sovereign', '1.2.3');
    expect(p).toMatch(
      /\/srv\/sovereign\/backups\/sovereign-backup-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-v1\.2\.3\.tar\.gz$/,
    );
  });
});

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

describe('readPlatformVersion', () => {
  it('returns the platform version from the workspace root package.json', () => {
    const v = readPlatformVersion(ROOT);
    expect(v).toMatch(/^\d+\.\d+\.\d+/);
  });

  it('returns "0.0.0" when the path has no package.json', () => {
    expect(readPlatformVersion('/tmp/nonexistent-12345')).toBe('0.0.0');
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
    expect(resolvePluginIdFromManifest(validManifest, ROOT)).toBe('fs.example.tasks');
  });

  it('throws on invalid JSON', () => {
    expect(() => resolvePluginIdFromManifest('{ not json', ROOT)).toThrow(/not valid JSON/);
  });

  it('throws when the manifest fails validation', () => {
    expect(() => resolvePluginIdFromManifest('{}', ROOT)).toThrow(/Invalid manifest\.json/);
  });

  it('throws when the plugin requires a newer platform', () => {
    const future = JSON.stringify({
      schemaVersion: 1,
      id: 'fs.example.future',
      name: 'Future Plugin',
      version: '1.0.0',
      type: 'platform',
      runtime: 'native',
      routePrefix: '/future',
      permissions: [],
      compatibility: { minPlatformVersion: '999.0.0' },
    });
    expect(() => resolvePluginIdFromManifest(future, ROOT)).toThrow(
      /incompatible with this platform/,
    );
  });
});
