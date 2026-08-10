import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock factories are hoisted above this file's own top-level code (including
// the static import of '../plugin-migrations', which pulls in
// '@sovereignfs/db' transitively) — vi.hoisted() is the sanctioned way to
// share `vi.fn()`s between a factory and the assertions below without a
// "Cannot access before initialization" error.
const { runPluginMigrations, provisionPluginDb, getPluginDb } = vi.hoisted(() => ({
  runPluginMigrations: vi.fn(async (_pluginDb: unknown, _folder: string) => {}),
  provisionPluginDb: vi.fn(async (_pluginId: string) => {}),
  getPluginDb: vi.fn((pluginId: string) => ({ dialect: 'sqlite' as const, db: { pluginId } })),
}));

// registry is deliberately out of alphabetical order here — the loop-isolation
// bug this suite guards against only shows up when the offending plugin does
// NOT sort last, since an uncaught throw inside a `for` loop aborts the whole
// loop, not just its own iteration — a real production incident (see
// docs/incidents/2026-07-24-rfc-0071-encryption-rollout.md), originally found
// via RFC 0071's encryption enforcement but not specific to it: any per-plugin
// migration failure must isolate the same way.
vi.mock('../../generated/registry', () => ({
  registry: [
    { id: 'fs.example.aaa', type: 'sovereign' },
    { id: 'fs.example.broken', type: 'sovereign' },
    { id: 'fs.example.zzz', type: 'sovereign' },
  ],
}));

vi.mock('@sovereignfs/db', () => ({
  findWorkspaceRoot: () => '/fake-workspace-root-does-not-exist',
  getPluginDb,
  getPlatformDb: async () => ({ dialect: 'sqlite' as const, db: {} }),
  pluginMigrationsFolder: (pluginDir: string, dialect: string) =>
    `${pluginDir}/migrations/${dialect}`,
  pluginMigrationsTableName: (pluginId: string) => `__drizzle_migrations_${pluginId}`,
  provisionPluginDb,
  resolveDialect: () => ({ dialect: 'sqlite' as const }),
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

describe('runAllPluginMigrations — per-plugin failure isolation', () => {
  beforeEach(() => {
    runPluginMigrations.mockClear();
    provisionPluginDb.mockClear();
    getPluginDb.mockClear();
    getPluginDb.mockImplementation((pluginId: string) => ({
      dialect: 'sqlite' as const,
      db: { pluginId },
    }));
  });

  it('migrates every plugin when none fail', async () => {
    const { runAllPluginMigrations } = await import('../plugin-migrations');
    await expect(runAllPluginMigrations()).resolves.toBeUndefined();

    const migratedIds = provisionPluginDb.mock.calls.map((call) => call[0]);
    expect(migratedIds).toEqual(['fs.example.aaa', 'fs.example.broken', 'fs.example.zzz']);
  });

  it("one plugin's migration failure is logged but does not abort the rest of the loop", async () => {
    runPluginMigrations.mockImplementation(async (pluginDb: unknown) => {
      const id = (pluginDb as { db: { pluginId: string } }).db.pluginId;
      if (id === 'fs.example.broken') throw new Error('broken migration SQL');
    });
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { runAllPluginMigrations } = await import('../plugin-migrations');

    await expect(runAllPluginMigrations()).resolves.toBeUndefined();

    // The plugin sorted before the failure, and the one sorted after it, both
    // still got migrated — this is the actual regression this test guards:
    // an uncaught throw for "broken" must never abort the whole loop, so
    // "zzz" (alphabetically after it) still gets its migrations run.
    const migratedIds = runPluginMigrations.mock.calls.map(
      (call) => (call[0] as { db: { pluginId: string } }).db.pluginId,
    );
    expect(migratedIds).toContain('fs.example.aaa');
    expect(migratedIds).toContain('fs.example.broken');
    expect(migratedIds).toContain('fs.example.zzz');
    expect(error).toHaveBeenCalled();
  });
});
