import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock factories hoisted above this file's own top-level code, mirroring
// plugin-migrations.test.ts's convention for the sibling per-plugin
// isolation suite this one follows the same pattern for.
const { getPlatformDb, setPluginEnabled } = vi.hoisted(() => ({
  getPlatformDb: vi.fn(async () => ({ dialect: 'sqlite' as const, db: {} })),
  setPluginEnabled: vi.fn(async (_pdb: unknown, _pluginId: string, _enabled: boolean) => {}),
}));

const { checkCompatibility } = vi.hoisted(() => ({
  checkCompatibility: vi.fn(),
}));

const { getInstalledPlugins } = vi.hoisted(() => ({
  getInstalledPlugins: vi.fn(),
}));

const { markIncompatible, recordWarnings } = vi.hoisted(() => ({
  markIncompatible: vi.fn(),
  recordWarnings: vi.fn(),
}));

const { getPlatformVersion } = vi.hoisted(() => ({
  getPlatformVersion: vi.fn(() => '1.0.0'),
}));

vi.mock('@sovereignfs/db', () => ({ getPlatformDb, setPluginEnabled }));
vi.mock('@sovereignfs/manifest', () => ({ checkCompatibility }));
vi.mock('../registry', () => ({ getInstalledPlugins }));
vi.mock('../plugin-compat', () => ({ markIncompatible, recordWarnings }));
vi.mock('../platform-version', () => ({ getPlatformVersion }));

interface FakeManifest {
  id: string;
}

function manifest(id: string): FakeManifest {
  return { id };
}

describe('checkBootCompatibility', () => {
  beforeEach(() => {
    getPlatformDb.mockClear();
    setPluginEnabled.mockClear();
    setPluginEnabled.mockImplementation(async () => {});
    checkCompatibility.mockReset();
    getInstalledPlugins.mockReset();
    markIncompatible.mockClear();
    recordWarnings.mockClear();
  });

  it('disables an incompatible manifest and records warnings for a compatible one', async () => {
    getInstalledPlugins.mockReturnValue([manifest('fs.example.ok'), manifest('fs.example.bad')]);
    checkCompatibility.mockImplementation((m: FakeManifest) =>
      m.id === 'fs.example.bad'
        ? { compatible: false, reason: 'too old', warnings: [] }
        : { compatible: true, warnings: ['minor drift'] },
    );

    const { checkBootCompatibility } = await import('../boot-compat');
    await checkBootCompatibility();

    expect(markIncompatible).toHaveBeenCalledWith('fs.example.bad', 'too old');
    expect(setPluginEnabled).toHaveBeenCalledWith(expect.anything(), 'fs.example.bad', false);
    expect(recordWarnings).toHaveBeenCalledWith('fs.example.ok', ['minor drift']);
    expect(markIncompatible).not.toHaveBeenCalledWith('fs.example.ok', expect.anything());
  });

  it("isolates one manifest's checkCompatibility() throw -- deliberately not last -- and still evaluates the manifests after it", async () => {
    getInstalledPlugins.mockReturnValue([
      manifest('fs.example.aaa'),
      manifest('fs.example.throws'),
      manifest('fs.example.zzz'),
    ]);
    checkCompatibility.mockImplementation((m: FakeManifest) => {
      if (m.id === 'fs.example.throws') {
        // Simulates semver.gt() throwing a TypeError on a malformed
        // minPlatformVersion/maxPlatformVersion string.
        throw new TypeError('Invalid Version: not-a-semver');
      }
      return { compatible: true, warnings: [] };
    });

    const { checkBootCompatibility } = await import('../boot-compat');
    await expect(checkBootCompatibility()).resolves.toBeUndefined();

    expect(recordWarnings).toHaveBeenCalledWith('fs.example.aaa', []);
    expect(recordWarnings).toHaveBeenCalledWith('fs.example.zzz', []);
    expect(markIncompatible).not.toHaveBeenCalled();
    expect(setPluginEnabled).not.toHaveBeenCalled();
  });

  it("isolates one manifest's setPluginEnabled() rejection -- deliberately not last -- and still evaluates the manifests after it", async () => {
    getInstalledPlugins.mockReturnValue([
      manifest('fs.example.aaa'),
      manifest('fs.example.dbfail'),
      manifest('fs.example.zzz'),
    ]);
    checkCompatibility.mockImplementation((m: FakeManifest) =>
      m.id === 'fs.example.dbfail'
        ? { compatible: false, reason: 'too new', warnings: [] }
        : { compatible: true, warnings: [] },
    );
    setPluginEnabled.mockImplementation(async (_pdb: unknown, pluginId: string) => {
      if (pluginId === 'fs.example.dbfail') throw new Error('db down');
    });

    const { checkBootCompatibility } = await import('../boot-compat');
    await expect(checkBootCompatibility()).resolves.toBeUndefined();

    expect(recordWarnings).toHaveBeenCalledWith('fs.example.aaa', []);
    expect(recordWarnings).toHaveBeenCalledWith('fs.example.zzz', []);
    expect(markIncompatible).toHaveBeenCalledWith('fs.example.dbfail', 'too new');
  });
});
