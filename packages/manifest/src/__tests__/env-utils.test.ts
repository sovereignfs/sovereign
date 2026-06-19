import { describe, expect, it } from 'vitest';
import { toEnvSlug, toEnvVarName } from '../env-utils';
import { validateManifest } from '../validate';

const baseManifest = {
  schemaVersion: 1,
  id: 'fs.sovereign.tasks',
  name: 'Tasks',
  version: '1.0.0',
  type: 'platform',
  runtime: 'native',
  routePrefix: '/tasks',
  permissions: [],
  compatibility: { minPlatformVersion: '0.4.0' },
} as const;

describe('toEnvSlug', () => {
  it('replaces dots and hyphens with underscores and uppercases', () => {
    expect(toEnvSlug('fs.my-plugin')).toBe('FS_MY_PLUGIN');
  });

  it('handles a full reverse-DNS id', () => {
    expect(toEnvSlug('com.example.tasks')).toBe('COM_EXAMPLE_TASKS');
  });

  it('handles a single-segment id', () => {
    expect(toEnvSlug('myplugin')).toBe('MYPLUGIN');
  });

  it('handles a deeply-nested id', () => {
    expect(toEnvSlug('fs.sovereign.example-api')).toBe('FS_SOVEREIGN_EXAMPLE_API');
  });
});

describe('toEnvVarName', () => {
  it('produces a runtime-scope namespaced key', () => {
    expect(toEnvVarName('fs.my-plugin', 'API_KEY', 'runtime')).toBe(
      'SV_PLUGIN_FS_MY_PLUGIN_API_KEY',
    );
  });

  it('produces a build-scope NEXT_PUBLIC_ key', () => {
    expect(toEnvVarName('fs.my-plugin', 'API_URL', 'build')).toBe(
      'NEXT_PUBLIC_SV_PLUGIN_FS_MY_PLUGIN_API_URL',
    );
  });
});

describe('manifest env field validation', () => {
  it('accepts a valid runtime env var declaration', () => {
    const res = validateManifest({
      ...baseManifest,
      env: {
        API_KEY: {
          description: 'Third-party API key',
          required: true,
          secret: true,
          scope: 'runtime',
        },
      },
    });
    expect(res.valid).toBe(true);
  });

  it('accepts a non-secret build-scope var with a default', () => {
    const res = validateManifest({
      ...baseManifest,
      env: {
        API_URL: {
          description: 'API base URL',
          scope: 'build',
          default: 'https://api.example.com',
        },
      },
    });
    expect(res.valid).toBe(true);
  });

  it('rejects a secret var with a default', () => {
    const res = validateManifest({
      ...baseManifest,
      env: {
        API_KEY: {
          description: 'Secret key',
          secret: true,
          scope: 'runtime',
          default: 'hardcoded',
        },
      },
    });
    expect(res.valid).toBe(false);
    if (!res.valid) {
      expect(res.errors.join(' ')).toContain('default');
    }
  });

  it('rejects a secret var with build scope', () => {
    const res = validateManifest({
      ...baseManifest,
      env: {
        API_KEY: { description: 'Secret key', secret: true, scope: 'build' },
      },
    });
    expect(res.valid).toBe(false);
    if (!res.valid) {
      expect(res.errors.join(' ')).toContain('scope');
    }
  });

  it('rejects an env key that is not UPPER_CASE', () => {
    const res = validateManifest({
      ...baseManifest,
      env: {
        api_key: { description: 'key', scope: 'runtime' },
      },
    });
    expect(res.valid).toBe(false);
  });

  it('rejects an env key that starts with a digit', () => {
    const res = validateManifest({
      ...baseManifest,
      env: {
        '1_KEY': { description: 'key', scope: 'runtime' },
      },
    });
    expect(res.valid).toBe(false);
  });
});
