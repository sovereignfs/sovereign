import { randomBytes } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { assertPluginEncryptionRequirement } from '../plugin-migrations';

const KEY_ENV = 'SOVEREIGN_DB_ENCRYPTION_KEY';

describe('assertPluginEncryptionRequirement (RFC 0071)', () => {
  afterEach(() => {
    Reflect.deleteProperty(process.env, KEY_ENV);
    vi.restoreAllMocks();
  });

  it('is a no-op when the plugin does not require encryption', () => {
    expect(() =>
      assertPluginEncryptionRequirement('fs.example.plugin', { isolation: 'isolated' }, 'sqlite'),
    ).not.toThrow();
  });

  it('throws, naming the plugin, when SQLite is required but no key is configured', () => {
    Reflect.deleteProperty(process.env, KEY_ENV);
    expect(() =>
      assertPluginEncryptionRequirement(
        'fs.example.healthlog',
        { isolation: 'isolated', requireEncryption: true },
        'sqlite',
      ),
    ).toThrow(/fs\.example\.healthlog/);
  });

  it('does not throw when SQLite is required and a key is configured', () => {
    process.env[KEY_ENV] = randomBytes(32).toString('base64');
    expect(() =>
      assertPluginEncryptionRequirement(
        'fs.example.healthlog',
        { isolation: 'isolated', requireEncryption: true },
        'sqlite',
      ),
    ).not.toThrow();
  });

  it('warns instead of throwing when Postgres is required — no SQLCipher equivalent there', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(() =>
      assertPluginEncryptionRequirement(
        'fs.example.healthlog',
        { isolation: 'isolated', requireEncryption: true },
        'postgres',
      ),
    ).not.toThrow();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]?.[0]).toContain('fs.example.healthlog');
  });
});

// Mock factories are hoisted above this file's own top-level code (including
// the static `assertPluginEncryptionRequirement` import above, which pulls in
// '@sovereignfs/db' transitively) — vi.hoisted() is the sanctioned way to
// share `vi.fn()`s between a factory and the assertions below without a
// "Cannot access before initialization" error.
const { runPluginMigrations, provisionPluginDb, getPluginDb } = vi.hoisted(() => ({
  runPluginMigrations: vi.fn(async (_pluginDb: unknown, _folder: string) => {}),
  provisionPluginDb: vi.fn(async (_pluginId: string, _dialect: string) => {}),
  getPluginDb: vi.fn((pluginId: string) => ({ dialect: 'sqlite' as const, db: { pluginId } })),
}));

// registry is deliberately out of alphabetical order here — the bug this
// suite guards against only shows up when the offending plugin does NOT sort
// last, since the old code aborted the whole loop rather than just its own
// iteration.
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

describe('runAllPluginMigrations (RFC 0071 — isolation from a single plugin failure)', () => {
  beforeEach(() => {
    runPluginMigrations.mockClear();
    provisionPluginDb.mockClear();
    getPluginDb.mockClear();
    Reflect.deleteProperty(process.env, KEY_ENV);
  });

  it('still migrates every other plugin when one plugin violates requireEncryption, then throws once naming it', async () => {
    const { runAllPluginMigrations } = await import('../plugin-migrations');

    await expect(runAllPluginMigrations()).rejects.toThrow(/fs\.example\.healthlog/);

    // The plugin sorted before the violator, and the one sorted after it,
    // both still got migrated — this is the actual regression this test
    // guards: previously the uncaught throw for healthlog aborted the whole
    // loop, so "zzz" (alphabetically after it) never got its migrations run.
    const migratedIds = provisionPluginDb.mock.calls.map((call) => call[0]);
    expect(migratedIds).toContain('fs.example.aaa');
    expect(migratedIds).toContain('fs.example.zzz');
    expect(migratedIds).not.toContain('fs.example.healthlog');
  });

  it('migrates every plugin and does not throw once the key is configured', async () => {
    process.env[KEY_ENV] = randomBytes(32).toString('base64');
    const { runAllPluginMigrations } = await import('../plugin-migrations');

    await expect(runAllPluginMigrations()).resolves.toBeUndefined();

    const migratedIds = provisionPluginDb.mock.calls.map((call) => call[0]);
    expect(migratedIds).toEqual(['fs.example.aaa', 'fs.example.healthlog', 'fs.example.zzz']);
  });
});
