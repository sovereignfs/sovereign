import { describe, expect, it } from 'vitest';
import { manifestDatabaseDialect, manifestDatabaseIsolation } from '../schema';
import { validateManifest } from '../validate';

const base = {
  schemaVersion: 1,
  id: 'fs.sovereign.tasks',
  name: 'Tasks',
  version: '1.0.0',
  type: 'platform',
  runtime: 'native',
  routePrefix: '/tasks',
  permissions: ['auth:session', 'db:readWrite'],
  compatibility: { minPlatformVersion: '0.4.0' },
};

describe('validateManifest', () => {
  it('accepts a valid platform manifest', () => {
    const res = validateManifest(base);
    expect(res.valid).toBe(true);
  });

  it('fails when a required field is missing', () => {
    const clone: Record<string, unknown> = { ...base };
    delete clone.schemaVersion;
    const res = validateManifest(clone);
    expect(res.valid).toBe(false);
    if (!res.valid) {
      expect(res.errors.join(' ')).toContain('schemaVersion');
    }
  });

  it('fails on an invalid enum value', () => {
    const res = validateManifest({ ...base, runtime: 'wasm' });
    expect(res.valid).toBe(false);
    if (!res.valid) {
      expect(res.errors.join(' ')).toContain('runtime');
    }
  });

  it('rejects planned runtime values until they are implemented', () => {
    for (const runtime of ['static', 'iframe-local', 'iframe-remote', 'external']) {
      const res = validateManifest({ ...base, runtime });
      expect(res.valid).toBe(false);
      if (!res.valid) {
        expect(res.errors.join(' ')).toContain('runtime');
      }
    }
  });

  it('requires repository when type is "sovereign"', () => {
    const res = validateManifest({ ...base, type: 'sovereign' });
    expect(res.valid).toBe(false);
    if (!res.valid) {
      expect(res.errors.join(' ')).toContain('repository');
    }
  });

  it('accepts a "sovereign" manifest that declares a repository', () => {
    const res = validateManifest({
      ...base,
      type: 'sovereign',
      repository: 'https://github.com/sovereignfs/sovereign-plugin-tasks',
    });
    expect(res.valid).toBe(true);
  });

  it('rejects unknown fields (strict)', () => {
    const res = validateManifest({ ...base, bogus: true });
    expect(res.valid).toBe(false);
  });

  it('rejects a routePrefix that does not start with "/"', () => {
    const res = validateManifest({ ...base, routePrefix: 'tasks' });
    expect(res.valid).toBe(false);
    if (!res.valid) {
      expect(res.errors.join(' ')).toContain('routePrefix');
    }
  });

  it('accepts a manifest with an icon field', () => {
    const res = validateManifest({ ...base, icon: 'icon.svg' });
    expect(res.valid).toBe(true);
  });

  it('accepts a manifest without an icon field (optional)', () => {
    const { icon: _icon, ...withoutIcon } = { ...base, icon: 'icon.svg' };
    const res = validateManifest(withoutIcon);
    expect(res.valid).toBe(true);
  });

  it('accepts a manifest that declares apiProvider (PLT-16)', () => {
    const res = validateManifest({ ...base, apiProvider: true });
    expect(res.valid).toBe(true);
  });

  it('accepts the legacy database string form', () => {
    expect(validateManifest({ ...base, database: 'shared' }).valid).toBe(true);
    expect(validateManifest({ ...base, database: 'isolated' }).valid).toBe(true);
  });

  it('accepts the database object form with a SQLite dialect override', () => {
    const res = validateManifest({
      ...base,
      database: { isolation: 'isolated', dialect: 'sqlite' },
    });
    expect(res.valid).toBe(true);
  });

  it('rejects postgres as a manifest database dialect', () => {
    const res = validateManifest({
      ...base,
      database: { isolation: 'isolated', dialect: 'postgres' },
    });
    expect(res.valid).toBe(false);
    if (!res.valid) {
      expect(res.errors.join(' ')).toContain('database');
    }
  });

  it('normalizes manifest database declarations', () => {
    expect(manifestDatabaseIsolation(undefined)).toBe('shared');
    expect(manifestDatabaseIsolation('isolated')).toBe('isolated');
    expect(manifestDatabaseIsolation({ isolation: 'isolated', dialect: 'sqlite' })).toBe(
      'isolated',
    );
    expect(manifestDatabaseIsolation({ dialect: 'sqlite' })).toBe('shared');
    expect(manifestDatabaseDialect({ isolation: 'isolated', dialect: 'sqlite' })).toBe('sqlite');
    expect(manifestDatabaseDialect({ isolation: 'isolated', dialect: 'postgres' })).toBeUndefined();
  });

  it('accepts shell: "overlay" (RFC 0001)', () => {
    const res = validateManifest({ ...base, shell: 'overlay' });
    expect(res.valid).toBe(true);
  });

  it('accepts shellConfig.overlaySize when shell is "overlay"', () => {
    const res = validateManifest({
      ...base,
      shell: 'overlay',
      shellConfig: { overlaySize: 'md' },
    });
    expect(res.valid).toBe(true);
  });

  it('rejects shellConfig.overlaySize without shell: "overlay"', () => {
    const res = validateManifest({ ...base, shellConfig: { overlaySize: 'md' } });
    expect(res.valid).toBe(false);
    if (!res.valid) {
      expect(res.errors.join(' ')).toContain('overlaySize');
    }
  });

  it('accepts the reserved cross-plugin data-sharing permissions (RFC 0002)', () => {
    const res = validateManifest({
      ...base,
      permissions: ['auth:session', 'db:readWrite', 'data:provide', 'data:consume'],
    });
    expect(res.valid).toBe(true);
  });

  // RFC 0024 — compatibility field validation
  it('rejects schemaVersion greater than the current maximum (RFC 0024)', () => {
    const res = validateManifest({ ...base, schemaVersion: 999 });
    expect(res.valid).toBe(false);
    if (!res.valid) {
      expect(res.errors.join(' ')).toContain('schemaVersion');
    }
  });

  it('rejects a non-semver string in minPlatformVersion (RFC 0024)', () => {
    const res = validateManifest({
      ...base,
      compatibility: { minPlatformVersion: 'latest' },
    });
    expect(res.valid).toBe(false);
    if (!res.valid) {
      expect(res.errors.join(' ')).toContain('semver');
    }
  });

  it('rejects a non-semver string in maxPlatformVersion (RFC 0024)', () => {
    const res = validateManifest({
      ...base,
      compatibility: { minPlatformVersion: '0.4.0', maxPlatformVersion: 'v2.x' },
    });
    expect(res.valid).toBe(false);
    if (!res.valid) {
      expect(res.errors.join(' ')).toContain('semver');
    }
  });

  it('accepts compatibility with both min and max versions (RFC 0024)', () => {
    const res = validateManifest({
      ...base,
      compatibility: { minPlatformVersion: '0.4.0', maxPlatformVersion: '1.0.0' },
    });
    expect(res.valid).toBe(true);
  });

  it('rejects unknown fields inside compatibility (RFC 0024)', () => {
    const res = validateManifest({
      ...base,
      compatibility: { minPlatformVersion: '0.4.0', unknownField: true },
    });
    expect(res.valid).toBe(false);
  });

  // RFC 0022 — plugin-declared capabilities
  it('accepts a manifest with a capabilities field (RFC 0022)', () => {
    const res = validateManifest({
      ...base,
      capabilities: {
        'create-item': { description: 'Create items.', defaultGrant: 'all' },
        'delete-item': { description: 'Delete items.' },
      },
    });
    expect(res.valid).toBe(true);
  });

  it('accepts capabilities without defaultGrant (defaults to none)', () => {
    const res = validateManifest({
      ...base,
      capabilities: { 'admin-panel': {} },
    });
    expect(res.valid).toBe(true);
  });

  it('rejects capability names that are not kebab-case lowercase (RFC 0022)', () => {
    const res = validateManifest({
      ...base,
      capabilities: { CreateItem: { description: 'Bad name.' } },
    });
    expect(res.valid).toBe(false);
  });

  it('rejects capability names starting with a digit', () => {
    const res = validateManifest({
      ...base,
      capabilities: { '1bad': {} },
    });
    expect(res.valid).toBe(false);
  });

  it('rejects an invalid defaultGrant value', () => {
    const res = validateManifest({
      ...base,
      capabilities: { feature: { defaultGrant: 'admins' } },
    });
    expect(res.valid).toBe(false);
  });

  it('rejects unknown fields inside a capability declaration', () => {
    const res = validateManifest({
      ...base,
      capabilities: { feature: { bogus: true } },
    });
    expect(res.valid).toBe(false);
  });
});
