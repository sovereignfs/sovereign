import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SovereignManifest } from '@sovereignfs/manifest';

vi.mock('@sovereignfs/db', () => ({
  createPluginStatusRowIfAbsent: vi.fn(),
  getPlatformSetting: vi.fn(),
  setPlatformSetting: vi.fn(),
}));

import {
  createPluginStatusRowIfAbsent,
  getPlatformSetting,
  setPlatformSetting,
} from '@sovereignfs/db';
import { activatePlugin, backfillPluginCatalogOnce, getPluginCatalog } from '../plugin-catalog';

const mockPdb = { dialect: 'sqlite' } as never;

const launcher = { id: 'fs.sovereign.launcher', name: 'Launcher' } as SovereignManifest;
const tasks = { id: 'fs.example.tasks', name: 'Tasks', description: 'To-dos' } as SovereignManifest;
const shopper = { id: 'fs.example.shopper', name: 'Shopper' } as SovereignManifest;

afterEach(() => {
  vi.clearAllMocks();
});

describe('backfillPluginCatalogOnce', () => {
  it('does nothing when the backfill has already run', async () => {
    vi.mocked(getPlatformSetting).mockResolvedValue('true');

    await backfillPluginCatalogOnce(mockPdb, [tasks, shopper]);

    expect(createPluginStatusRowIfAbsent).not.toHaveBeenCalled();
    expect(setPlatformSetting).not.toHaveBeenCalled();
  });

  it('backfills every non-chrome plugin as everyone/enabled and sets the flag', async () => {
    vi.mocked(getPlatformSetting).mockResolvedValue(null);
    vi.mocked(createPluginStatusRowIfAbsent).mockResolvedValue(true);

    await backfillPluginCatalogOnce(mockPdb, [launcher, tasks, shopper]);

    expect(createPluginStatusRowIfAbsent).toHaveBeenCalledTimes(2);
    expect(createPluginStatusRowIfAbsent).toHaveBeenCalledWith(mockPdb, 'fs.example.tasks', {
      enabled: true,
      accessPolicy: 'everyone',
      selfService: false,
    });
    expect(createPluginStatusRowIfAbsent).toHaveBeenCalledWith(mockPdb, 'fs.example.shopper', {
      enabled: true,
      accessPolicy: 'everyone',
      selfService: false,
    });
    expect(setPlatformSetting).toHaveBeenCalledWith(mockPdb, 'plugin_catalog_backfilled', 'true');
  });

  it('excludes chrome plugins from the backfill', async () => {
    vi.mocked(getPlatformSetting).mockResolvedValue(null);

    await backfillPluginCatalogOnce(mockPdb, [launcher]);

    expect(createPluginStatusRowIfAbsent).not.toHaveBeenCalled();
    expect(setPlatformSetting).toHaveBeenCalled();
  });
});

describe('getPluginCatalog', () => {
  it('excludes chrome plugins and flags active vs inactive', () => {
    const result = getPluginCatalog([launcher, tasks, shopper], new Set(['fs.example.tasks']));
    expect(result).toEqual([
      { id: 'fs.example.tasks', name: 'Tasks', description: 'To-dos', active: true },
      { id: 'fs.example.shopper', name: 'Shopper', description: '', active: false },
    ]);
  });
});

describe('activatePlugin', () => {
  it('creates the plugin_status row with a disabled policy and reports activated', async () => {
    vi.mocked(createPluginStatusRowIfAbsent).mockResolvedValue(true);

    const result = await activatePlugin(mockPdb, 'fs.example.tasks');

    expect(result).toEqual({ activated: true });
    expect(createPluginStatusRowIfAbsent).toHaveBeenCalledWith(mockPdb, 'fs.example.tasks', {
      enabled: true,
      accessPolicy: 'disabled',
      selfService: false,
    });
  });

  it('reports already-active without overwriting an existing row', async () => {
    vi.mocked(createPluginStatusRowIfAbsent).mockResolvedValue(false);

    const result = await activatePlugin(mockPdb, 'fs.example.tasks');

    expect(result).toEqual({ activated: false, reason: 'already-active' });
  });
});
