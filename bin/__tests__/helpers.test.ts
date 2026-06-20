import { existsSync, readFileSync, rmSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  PLATFORM_PLUGIN_DIRS,
  assertRemovablePlugin,
  authHealthUrl,
  defaultArchivePath,
  detectDialect,
  pollUntilHealthy,
  readPlatformVersion,
  renderPm2Config,
  resolvePluginIdFromManifest,
  scaffoldPlugin,
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

describe('scaffoldPlugin', () => {
  const tmpDir = join(
    resolve(dirname(fileURLToPath(import.meta.url)), '../..'),
    'data',
    '.scaffold-test',
  );

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('creates the canonical skeleton with the correct files', () => {
    const dir = scaffoldPlugin({
      id: 'io.example.test-plugin',
      name: 'Test Plugin',
      description: 'A test scaffold',
      routePrefix: '/test-plugin',
      outDir: tmpDir,
    });

    expect(dir).toBe(join(tmpDir, 'io.example.test-plugin'));
    expect(existsSync(join(dir, 'manifest.json'))).toBe(true);
    expect(existsSync(join(dir, 'package.json'))).toBe(true);
    expect(existsSync(join(dir, 'tsconfig.json'))).toBe(true);
    expect(existsSync(join(dir, 'icon.svg'))).toBe(true);
    expect(existsSync(join(dir, 'app', 'page.tsx'))).toBe(true);
    expect(existsSync(join(dir, 'app', 'test-plugin.module.css'))).toBe(true);
  });

  it('writes a valid manifest with the supplied fields', () => {
    const dir = scaffoldPlugin({
      id: 'io.example.my-app',
      name: 'My App',
      description: 'My description',
      routePrefix: '/my-app',
      outDir: tmpDir,
    });

    const manifest = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8')) as Record<
      string,
      unknown
    >;
    expect(manifest.id).toBe('io.example.my-app');
    expect(manifest.name).toBe('My App');
    expect(manifest.routePrefix).toBe('/my-app');
    expect(manifest.schemaVersion).toBe(1);
    expect(manifest.type).toBe('sovereign');
    expect(manifest.runtime).toBe('native');
    expect(manifest.shell).toBe('default');
  });

  it('uses workspace:* refs when workspaceDeps is true', () => {
    const dir = scaffoldPlugin({
      id: 'io.example.ws-plugin',
      name: 'WS Plugin',
      description: '',
      routePrefix: '/ws-plugin',
      outDir: tmpDir,
      workspaceDeps: true,
    });

    const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as {
      dependencies: Record<string, string>;
    };
    expect(pkg.dependencies['@sovereignfs/sdk']).toBe('workspace:*');
  });

  it('uses latest refs when workspaceDeps is false', () => {
    const dir = scaffoldPlugin({
      id: 'io.example.npm-plugin',
      name: 'NPM Plugin',
      description: '',
      routePrefix: '/npm-plugin',
      outDir: tmpDir,
    });

    const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as {
      dependencies: Record<string, string>;
    };
    expect(pkg.dependencies['@sovereignfs/sdk']).toBe('latest');
  });

  it('throws when the output directory already exists', () => {
    scaffoldPlugin({
      id: 'io.example.dup-plugin',
      name: 'Dup',
      description: '',
      routePrefix: '/dup-plugin',
      outDir: tmpDir,
    });
    expect(() =>
      scaffoldPlugin({
        id: 'io.example.dup-plugin',
        name: 'Dup',
        description: '',
        routePrefix: '/dup-plugin',
        outDir: tmpDir,
      }),
    ).toThrow(/already exists/);
  });
});

describe('authHealthUrl', () => {
  it('uses the default loopback URL when SOVEREIGN_AUTH_URL is unset', () => {
    expect(authHealthUrl({})).toBe('http://127.0.0.1:3001/api/health');
  });

  it('derives the URL from SOVEREIGN_AUTH_URL', () => {
    expect(authHealthUrl({ SOVEREIGN_AUTH_URL: 'http://auth:3001' })).toBe(
      'http://auth:3001/api/health',
    );
  });

  it('strips a trailing slash before appending the path', () => {
    expect(authHealthUrl({ SOVEREIGN_AUTH_URL: 'http://auth:3001/' })).toBe(
      'http://auth:3001/api/health',
    );
  });
});

describe('pollUntilHealthy', () => {
  it('returns true when the first fetch succeeds', async () => {
    const fetchFn = vi.fn().mockResolvedValue({ ok: true });
    const result = await pollUntilHealthy('http://localhost/health', 5_000, fetchFn);
    expect(result).toBe(true);
    expect(fetchFn).toHaveBeenCalledOnce();
  });

  it('retries on failure and returns true once healthy', async () => {
    const fetchFn = vi
      .fn()
      .mockRejectedValueOnce(new Error('ECONNREFUSED'))
      .mockResolvedValue({ ok: true });
    const result = await pollUntilHealthy('http://localhost/health', 5_000, fetchFn);
    expect(result).toBe(true);
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('returns false when the timeout elapses without a healthy response', async () => {
    const fetchFn = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    const result = await pollUntilHealthy('http://localhost/health', 100, fetchFn);
    expect(result).toBe(false);
  });
});

describe('renderPm2Config', () => {
  it('includes both sovereign-auth and sovereign-runtime apps', () => {
    const config = renderPm2Config({ dir: '/opt/sovereign' });
    expect(config).toContain("name: 'sovereign-auth'");
    expect(config).toContain("name: 'sovereign-runtime'");
  });

  it('sets the auth HOSTNAME to 127.0.0.1', () => {
    const config = renderPm2Config({ dir: '/opt/sovereign' });
    // Auth block comes before runtime; check the loopback binding is in auth section.
    const authIdx = config.indexOf("name: 'sovereign-auth'");
    const runtimeIdx = config.indexOf("name: 'sovereign-runtime'");
    const authSection = config.slice(authIdx, runtimeIdx);
    expect(authSection).toContain("HOSTNAME: '127.0.0.1'");
  });

  it('sets the runtime HOSTNAME to 0.0.0.0', () => {
    const config = renderPm2Config({ dir: '/opt/sovereign' });
    const runtimeIdx = config.indexOf("name: 'sovereign-runtime'");
    const runtimeSection = config.slice(runtimeIdx);
    expect(runtimeSection).toContain("HOSTNAME: '0.0.0.0'");
  });

  it('embeds the correct standalone server.js paths', () => {
    const config = renderPm2Config({ dir: '/opt/sovereign' });
    expect(config).toContain('/opt/sovereign/apps/auth/.next/standalone/apps/auth/server.js');
    expect(config).toContain('/opt/sovereign/runtime/.next/standalone/runtime/server.js');
  });

  it('includes the env_file entry when provided', () => {
    const config = renderPm2Config({ dir: '/opt/sovereign', envFile: '/opt/sovereign/.env' });
    expect(config).toContain("env_file: '/opt/sovereign/.env'");
  });

  it('omits env_file when not provided', () => {
    const config = renderPm2Config({ dir: '/opt/sovereign' });
    expect(config).not.toContain('env_file');
  });
});
