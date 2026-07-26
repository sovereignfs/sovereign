import { randomBytes } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { assertPluginEncryptionRequirement } from '../plugin-migrations';
import { getCompatibilityWarnings } from '../plugin-compat';

const KEY_ENV = 'SOVEREIGN_DB_ENCRYPTION_KEY';

describe('assertPluginEncryptionRequirement (RFC 0071, softened by task 8.15)', () => {
  afterEach(() => {
    Reflect.deleteProperty(process.env, KEY_ENV);
    vi.restoreAllMocks();
  });

  it('is a no-op when the plugin does not require encryption', () => {
    expect(() =>
      assertPluginEncryptionRequirement('fs.example.plugin', { isolation: 'isolated' }, 'sqlite'),
    ).not.toThrow();
  });

  it('warns (never throws) naming the plugin, when SQLite is required but no key is configured', () => {
    Reflect.deleteProperty(process.env, KEY_ENV);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(() =>
      assertPluginEncryptionRequirement(
        'fs.example.healthlog',
        { isolation: 'isolated', requireEncryption: true },
        'sqlite',
      ),
    ).not.toThrow();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]?.[0]).toContain('fs.example.healthlog');
  });

  it('records the no-key warning persistently via recordWarnings, not just console', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    assertPluginEncryptionRequirement(
      'fs.example.healthlog-persistent',
      { isolation: 'isolated', requireEncryption: true },
      'sqlite',
    );
    const warnings = getCompatibilityWarnings('fs.example.healthlog-persistent');
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('requires database encryption');
    expect(warnings[0]).toContain('SOVEREIGN_DB_ENCRYPTION_KEY');
  });

  it("does not warn when SQLite is required and a key is configured — per-file conversion is getPluginDb's job", () => {
    process.env[KEY_ENV] = randomBytes(32).toString('base64');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(() =>
      assertPluginEncryptionRequirement(
        'fs.example.healthlog',
        { isolation: 'isolated', requireEncryption: true },
        'sqlite',
      ),
    ).not.toThrow();
    expect(warn).not.toHaveBeenCalled();
  });

  it('warns instead of throwing when Postgres is required — no SQLCipher equivalent there', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(() =>
      assertPluginEncryptionRequirement(
        'fs.example.healthlog-pg-warn',
        { isolation: 'isolated', requireEncryption: true },
        'postgres',
      ),
    ).not.toThrow();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]?.[0]).toContain('fs.example.healthlog-pg-warn');
  });

  it('records the Postgres-fallback warning persistently, not just to console — a bare console.warn vanishes after boot', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    assertPluginEncryptionRequirement(
      'fs.example.healthlog-persistent-pg',
      { isolation: 'isolated', requireEncryption: true },
      'postgres',
    );
    const warnings = getCompatibilityWarnings('fs.example.healthlog-persistent-pg');
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('requires database encryption');
    expect(warnings[0]).toContain('Postgres');
  });
});

// Mock factories are hoisted above this file's own top-level code (including
// the static `assertPluginEncryptionRequirement` import above, which pulls in
// '@sovereignfs/db' transitively) — vi.hoisted() is the sanctioned way to
// share `vi.fn()`s between a factory and the assertions below without a
// "Cannot access before initialization" error.
const { runPluginMigrations, provisionPluginDb, getPluginDb, DbEncryptionConfigError } = vi.hoisted(
  () => {
    class DbEncryptionConfigError extends Error {
      constructor(message: string) {
        super(message);
        this.name = 'DbEncryptionConfigError';
      }
    }
    return {
      runPluginMigrations: vi.fn(async (_pluginDb: unknown, _folder: string) => {}),
      provisionPluginDb: vi.fn(async (_pluginId: string, _dialect: string) => {}),
      getPluginDb: vi.fn((pluginId: string) => ({ dialect: 'sqlite' as const, db: { pluginId } })),
      DbEncryptionConfigError,
    };
  },
);

// registry is deliberately out of alphabetical order here — the loop-isolation
// bug this suite guards against only shows up when the offending plugin does
// NOT sort last, since the old code aborted the whole loop rather than just
// its own iteration.
vi.mock('../../generated/registry', () => ({
  registry: [
    { id: 'fs.example.aaa', database: { isolation: 'isolated', dialect: 'sqlite' } },
    {
      id: 'fs.example.healthlog',
      database: { isolation: 'isolated', dialect: 'sqlite', requireEncryption: true },
    },
    { id: 'fs.example.zzz', database: { isolation: 'isolated', dialect: 'sqlite' } },
  ],
}));

vi.mock('@sovereignfs/db', () => ({
  DbEncryptionConfigError,
  dbEncryptionKeyFromEnv: () => {
    const raw = process.env[KEY_ENV];
    return raw ? Buffer.from(raw, 'base64') : undefined;
  },
  findWorkspaceRoot: () => '/fake-workspace-root-does-not-exist',
  getPluginDb,
  getPlatformDb: async () => ({ dialect: 'sqlite' as const, db: {} }),
  pluginMigrationsFolder: (pluginDir: string, dialect: string) =>
    `${pluginDir}/migrations/${dialect}`,
  pluginMigrationsTableName: (pluginId: string) => `__drizzle_migrations_${pluginId}`,
  provisionPluginDb,
  resolveDialect: () => ({ dialect: 'sqlite' as const, url: 'file::memory:' }),
  runPluginMigrations,
}));

// Every plugin in the fake registry is "isolated" with a migrations folder —
// existsSync only needs to say yes to the folders this suite manufactures
// (pluginMigrationsFolder's mock output) and no to the real-filesystem plugin
// dir scan in buildIdToDirMap, so it falls back to using manifest.id as the
// directory name.
vi.mock('node:fs', () => ({
  existsSync: (path: string) => path.includes('/migrations/'),
  readdirSync: () => [],
  readFileSync: () => '{}',
}));

describe('runAllPluginMigrations (task 8.15 — per-database, not startup-wide, enforcement)', () => {
  beforeEach(() => {
    runPluginMigrations.mockClear();
    provisionPluginDb.mockClear();
    getPluginDb.mockClear();
    getPluginDb.mockImplementation((pluginId: string) => ({
      dialect: 'sqlite' as const,
      db: { pluginId },
    }));
    Reflect.deleteProperty(process.env, KEY_ENV);
  });

  it('migrates every plugin, including the one requiring encryption, when no key is configured — no longer a violation', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { runAllPluginMigrations } = await import('../plugin-migrations');

    await expect(runAllPluginMigrations()).resolves.toBeUndefined();

    // The whole point of task 8.15: a missing key no longer blocks
    // provisioning for the plugin that wants encryption — it just runs
    // unencrypted, loudly warned.
    const migratedIds = provisionPluginDb.mock.calls.map((call) => call[0]);
    expect(migratedIds).toEqual(['fs.example.aaa', 'fs.example.healthlog', 'fs.example.zzz']);
    expect(warn).toHaveBeenCalled();
  });

  it('migrates every plugin and does not throw once the key is configured', async () => {
    process.env[KEY_ENV] = randomBytes(32).toString('base64');
    const { runAllPluginMigrations } = await import('../plugin-migrations');

    await expect(runAllPluginMigrations()).resolves.toBeUndefined();

    const migratedIds = provisionPluginDb.mock.calls.map((call) => call[0]);
    expect(migratedIds).toEqual(['fs.example.aaa', 'fs.example.healthlog', 'fs.example.zzz']);
  });

  it('still migrates every other plugin when getPluginDb throws DbEncryptionConfigError for one (unconverted existing file), then throws once naming it', async () => {
    // This is the case that's still genuinely fatal in production under task
    // 8.15: the key IS configured, the plugin DOES require encryption, but
    // its existing file hasn't been converted (`sv db encrypt` needed) —
    // surfaced by getPluginDb/resolvePluginEncryptionKey, not by
    // assertPluginEncryptionRequirement.
    process.env[KEY_ENV] = randomBytes(32).toString('base64');
    getPluginDb.mockImplementation((pluginId: string) => {
      if (pluginId === 'fs.example.healthlog') {
        throw new DbEncryptionConfigError(
          `Plugin "${pluginId}" requires database encryption and the key is set, but its ` +
            'existing database has not been encrypted yet.',
        );
      }
      return { dialect: 'sqlite' as const, db: { pluginId } };
    });
    const { runAllPluginMigrations } = await import('../plugin-migrations');

    await expect(runAllPluginMigrations()).rejects.toThrow(/fs\.example\.healthlog/);

    // The plugin sorted before the violator, and the one sorted after it,
    // both still got migrated — this is the actual regression this test
    // guards: an uncaught throw for healthlog must never abort the whole
    // loop, so "zzz" (alphabetically after it) still gets its migrations run.
    const migratedIds = provisionPluginDb.mock.calls.map((call) => call[0]);
    expect(migratedIds).toContain('fs.example.aaa');
    expect(migratedIds).toContain('fs.example.zzz');
    // provisionPluginDb IS called for healthlog too (it runs before the
    // getPluginDb throw); runPluginMigrations is what never happens for it.
    const migratedViaRunPluginMigrations = runPluginMigrations.mock.calls.map(
      (call) => (call[0] as { db: { pluginId: string } }).db.pluginId,
    );
    expect(migratedViaRunPluginMigrations).not.toContain('fs.example.healthlog');
  });

  it('warns and continues instead of throwing when NODE_ENV=development, for the unconverted-file case', async () => {
    process.env[KEY_ENV] = randomBytes(32).toString('base64');
    getPluginDb.mockImplementation((pluginId: string) => {
      if (pluginId === 'fs.example.healthlog') {
        throw new DbEncryptionConfigError(`Plugin "${pluginId}" requires database encryption.`);
      }
      return { dialect: 'sqlite' as const, db: { pluginId } };
    });
    vi.stubEnv('NODE_ENV', 'development');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const { runAllPluginMigrations } = await import('../plugin-migrations');
      const { getCompatibilityWarnings } = await import('../plugin-compat');

      await expect(runAllPluginMigrations()).resolves.toBeUndefined();

      expect(warn).toHaveBeenCalled();
      const warnings = getCompatibilityWarnings('fs.example.healthlog');
      expect(warnings.some((w) => w.includes('requires database encryption'))).toBe(true);

      const migratedIds = provisionPluginDb.mock.calls.map((call) => call[0]);
      expect(migratedIds).toContain('fs.example.aaa');
      expect(migratedIds).toContain('fs.example.zzz');
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
