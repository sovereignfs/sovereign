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

  it('accepts a manifest that declares publicRoutes (RFC 0042)', () => {
    const res = validateManifest({
      ...base,
      publicRoutes: [{ prefix: '/p', description: 'Token-protected public read-only pages.' }],
    });
    expect(res.valid).toBe(true);
  });

  it('accepts a publicRoutes entry without a description', () => {
    expect(validateManifest({ ...base, publicRoutes: [{ prefix: '/p' }] }).valid).toBe(true);
  });

  it('rejects a publicRoutes prefix that does not start with "/"', () => {
    const res = validateManifest({ ...base, publicRoutes: [{ prefix: 'p' }] });
    expect(res.valid).toBe(false);
    if (!res.valid) expect(res.errors.join(' ')).toContain('publicRoutes');
  });

  it('rejects a publicRoutes prefix of "/"', () => {
    const res = validateManifest({ ...base, publicRoutes: [{ prefix: '/' }] });
    expect(res.valid).toBe(false);
    if (!res.valid) expect(res.errors.join(' ')).toContain('publicRoutes');
  });

  it('rejects a publicRoutes prefix containing ".." segments', () => {
    const res = validateManifest({ ...base, publicRoutes: [{ prefix: '/p/../../etc' }] });
    expect(res.valid).toBe(false);
    if (!res.valid) expect(res.errors.join(' ')).toContain('publicRoutes');
  });

  it('rejects a publicRoutes prefix containing route group / interception markers', () => {
    expect(validateManifest({ ...base, publicRoutes: [{ prefix: '/(group)' }] }).valid).toBe(false);
    expect(validateManifest({ ...base, publicRoutes: [{ prefix: '/(.)p' }] }).valid).toBe(false);
  });

  it('rejects an empty publicRoutes array', () => {
    expect(validateManifest({ ...base, publicRoutes: [] }).valid).toBe(false);
  });

  it('rejects duplicate publicRoutes prefixes within a plugin', () => {
    const res = validateManifest({
      ...base,
      publicRoutes: [{ prefix: '/p' }, { prefix: '/p' }],
    });
    expect(res.valid).toBe(false);
    if (!res.valid) expect(res.errors.join(' ')).toContain('unique');
  });

  it('accepts a manifest that declares the example marker', () => {
    expect(validateManifest({ ...base, example: true }).valid).toBe(true);
  });

  it('rejects a non-boolean example marker', () => {
    expect(validateManifest({ ...base, example: 'yes' }).valid).toBe(false);
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

  it('accepts external connection provider declarations (RFC 0049)', () => {
    const res = validateManifest({
      ...base,
      connections: {
        providers: [
          {
            id: 'email.google',
            title: 'Google Mail',
            callbackPath: '/connections/google/callback',
            scopes: ['https://www.googleapis.com/auth/gmail.readonly'],
          },
        ],
      },
    });
    expect(res.valid).toBe(true);
  });

  it('accepts provider-defined OAuth scope strings that are not "user"/"plugin"/"instance"', () => {
    const res = validateManifest({
      ...base,
      connections: {
        providers: [
          {
            id: 'git.github',
            title: 'GitHub',
            callbackPath: '/connections/github/callback',
            scopes: ['repo', 'read:user'],
          },
        ],
      },
    });
    expect(res.valid).toBe(true);
  });

  it('rejects an empty connection provider scopes array', () => {
    const res = validateManifest({
      ...base,
      connections: {
        providers: [
          {
            id: 'git.github',
            title: 'GitHub',
            callbackPath: '/connections/github/callback',
            scopes: [],
          },
        ],
      },
    });
    expect(res.valid).toBe(false);
  });

  it('accepts external provider config declarations (Task 3.27)', () => {
    const res = validateManifest({
      ...base,
      connections: {
        providers: [
          {
            id: 'github',
            title: 'GitHub',
            callbackPath: '/connections/github/callback',
            scopes: ['user'],
            config: {
              public: {
                clientId: {
                  label: 'Client ID',
                  env: 'GITHUB_CLIENT_ID',
                  required: true,
                },
              },
              secrets: {
                clientSecret: {
                  label: 'Client secret',
                  env: 'GITHUB_CLIENT_SECRET',
                  required: true,
                },
              },
            },
          },
        ],
      },
    });
    expect(res.valid).toBe(true);
  });

  it('rejects malformed external provider config env keys (Task 3.27)', () => {
    const res = validateManifest({
      ...base,
      connections: {
        providers: [
          {
            id: 'github',
            title: 'GitHub',
            callbackPath: '/connections/github/callback',
            scopes: ['user'],
            config: {
              secrets: {
                clientSecret: {
                  label: 'Client secret',
                  env: 'github-client-secret',
                },
              },
            },
          },
        ],
      },
    });
    expect(res.valid).toBe(false);
    if (!res.valid) {
      expect(res.errors.join(' ')).toContain('provider config env keys');
    }
  });

  it('rejects connection callback paths outside the plugin route tree (RFC 0049)', () => {
    const res = validateManifest({
      ...base,
      connections: {
        providers: [
          {
            id: 'Email.Google',
            title: 'Google Mail',
            callbackPath: 'connections/google/callback',
            scopes: ['user'],
          },
        ],
      },
    });
    expect(res.valid).toBe(false);
    if (!res.valid) {
      expect(res.errors.join(' ')).toContain('callbackPath');
    }
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

  it('accepts a valid schedules declaration (RFC 0046 Phase 1)', () => {
    const res = validateManifest({
      ...base,
      schedules: [{ id: 'due-reminders', intervalMinutes: 1, entry: 'app/_jobs/due-reminders.ts' }],
    });
    expect(res.valid).toBe(true);
  });

  it('rejects a schedule entry outside app/', () => {
    const res = validateManifest({
      ...base,
      schedules: [{ id: 'x', intervalMinutes: 1, entry: 'lib/jobs.ts' }],
    });
    expect(res.valid).toBe(false);
  });

  it('rejects a schedule entry that traverses out of the plugin', () => {
    const res = validateManifest({
      ...base,
      schedules: [{ id: 'x', intervalMinutes: 1, entry: 'app/../../etc/passwd.ts' }],
    });
    expect(res.valid).toBe(false);
  });

  it('rejects a non-.ts schedule entry', () => {
    const res = validateManifest({
      ...base,
      schedules: [{ id: 'x', intervalMinutes: 1, entry: 'app/_jobs/handler.tsx' }],
    });
    expect(res.valid).toBe(false);
  });

  it('rejects non-integer and sub-minute intervals', () => {
    for (const intervalMinutes of [0, -1, 1.5]) {
      const res = validateManifest({
        ...base,
        schedules: [{ id: 'x', intervalMinutes, entry: 'app/_jobs/x.ts' }],
      });
      expect(res.valid).toBe(false);
    }
  });

  it('rejects duplicate schedule ids within a plugin', () => {
    const res = validateManifest({
      ...base,
      schedules: [
        { id: 'same', intervalMinutes: 1, entry: 'app/_jobs/a.ts' },
        { id: 'same', intervalMinutes: 5, entry: 'app/_jobs/b.ts' },
      ],
    });
    expect(res.valid).toBe(false);
  });

  it('rejects schedule ids that are not kebab-case lowercase', () => {
    const res = validateManifest({
      ...base,
      schedules: [{ id: 'DueReminders', intervalMinutes: 1, entry: 'app/_jobs/x.ts' }],
    });
    expect(res.valid).toBe(false);
  });

  it('rejects an empty schedules array', () => {
    const res = validateManifest({ ...base, schedules: [] });
    expect(res.valid).toBe(false);
  });

  it('accepts a valid integrations.optional declaration (RFC 0051)', () => {
    const res = validateManifest({
      ...base,
      integrations: {
        optional: [
          {
            provider: 'io.example.crm',
            reason: 'Link records to contacts',
            contracts: ['crm.contacts'],
          },
        ],
      },
    });
    expect(res.valid).toBe(true);
  });

  it('rejects an integrations entry missing required fields', () => {
    const res = validateManifest({
      ...base,
      integrations: { optional: [{ provider: 'io.example.crm' }] },
    });
    expect(res.valid).toBe(false);
    if (!res.valid) {
      expect(res.errors.join(' ')).toContain('reason');
    }
  });

  it('rejects unknown keys inside an integrations entry', () => {
    const res = validateManifest({
      ...base,
      integrations: {
        optional: [{ provider: 'io.example.crm', reason: 'x', unexpected: true }],
      },
    });
    expect(res.valid).toBe(false);
  });
});
