import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SovereignManifest } from '@sovereignfs/manifest';

vi.mock('@sovereignfs/db', () => ({
  createPluginStatusRowIfAbsent: vi.fn(),
}));

import { createPluginStatusRowIfAbsent } from '@sovereignfs/db';
import { activatePlugin, getPluginCatalog } from '../plugin-catalog';

const mockPdb = { dialect: 'sqlite' } as never;

const launcher = { id: 'fs.sovereign.launcher', name: 'Launcher' } as SovereignManifest;
const tasks = { id: 'fs.example.tasks', name: 'Tasks', description: 'To-dos' } as SovereignManifest;
const shopper = { id: 'fs.example.shopper', name: 'Shopper' } as SovereignManifest;

afterEach(() => {
  vi.clearAllMocks();
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
