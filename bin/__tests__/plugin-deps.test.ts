import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const spawnSyncMock = vi.hoisted(() =>
  vi.fn((_command: string, _args?: readonly string[]) => ({ status: 0 })),
);
vi.mock('node:child_process', () => ({ spawnSync: spawnSyncMock }));

import {
  computePlatformPeerNames,
  extractExternalDeps,
  hoistDepsForPlugin,
  mergePluginDeps,
  pruneDepsForPlugin,
  prunePluginDeps,
  readPluginDepsLedger,
  syncLocalPluginDeps,
  writePluginDepsLedger,
  type PluginDepsLedger,
} from '../plugin-deps';

describe('extractExternalDeps', () => {
  it('filters out @sovereignfs/* workspace packages', () => {
    const result = extractExternalDeps(
      { '@sovereignfs/sdk': 'workspace:*', 'date-fns': '^3.0.0' },
      new Set(),
    );
    expect(result).toEqual({ 'date-fns': '^3.0.0' });
  });

  it('filters out platform peers', () => {
    const result = extractExternalDeps(
      { next: 'catalog:', react: 'catalog:', 'date-fns': '^3.0.0' },
      new Set(['next', 'react']),
    );
    expect(result).toEqual({ 'date-fns': '^3.0.0' });
  });

  it('keeps a genuine external dep untouched, including its exact range', () => {
    const result = extractExternalDeps({ '@dnd-kit/core': '^6.3.1' }, new Set());
    expect(result).toEqual({ '@dnd-kit/core': '^6.3.1' });
  });

  it('returns an empty object for a plugin with only workspace/peer deps', () => {
    const result = extractExternalDeps(
      { '@sovereignfs/ui': 'workspace:*', next: 'catalog:' },
      new Set(['next']),
    );
    expect(result).toEqual({});
  });
});

describe('computePlatformPeerNames', () => {
  it('treats every runtime dep not attributed to a plugin as a platform peer', () => {
    const ledger: PluginDepsLedger = { 'fs.example.tasks': { 'date-fns': '^3.0.0' } };
    const runtimeDeps = { next: 'catalog:', 'date-fns': '^3.0.0', react: 'catalog:' };
    const peers = computePlatformPeerNames(runtimeDeps, ledger);
    expect(peers).toEqual(new Set(['next', 'react']));
  });

  it('treats a hand-added dep outside the ledger as a peer (never mistakenly pruned)', () => {
    const peers = computePlatformPeerNames({ 'hand-added': '^1.0.0' }, {});
    expect(peers.has('hand-added')).toBe(true);
  });
});

describe('mergePluginDeps', () => {
  it('adds new deps and records them in the ledger under the plugin id', () => {
    const runtimeDeps: Record<string, string> = { next: 'catalog:' };
    const ledger: PluginDepsLedger = {};
    const result = mergePluginDeps(
      'fs.example.tasks',
      { '@dnd-kit/core': '^6.3.1' },
      runtimeDeps,
      ledger,
    );
    expect(result.added).toEqual(['@dnd-kit/core']);
    expect(result.conflicts).toEqual([]);
    expect(runtimeDeps['@dnd-kit/core']).toBe('^6.3.1');
    expect(ledger['fs.example.tasks']).toEqual({ '@dnd-kit/core': '^6.3.1' });
  });

  it('is a no-op (unchanged) when the identical range is already present', () => {
    const runtimeDeps: Record<string, string> = { 'date-fns': '^3.0.0' };
    const ledger: PluginDepsLedger = { 'fs.a': { 'date-fns': '^3.0.0' } };
    const result = mergePluginDeps('fs.b', { 'date-fns': '^3.0.0' }, runtimeDeps, ledger);
    expect(result.unchanged).toEqual(['date-fns']);
    expect(result.added).toEqual([]);
  });

  it('keeps the newer version on a conflict and reports it', () => {
    const runtimeDeps: Record<string, string> = { 'date-fns': '^2.0.0' };
    const ledger: PluginDepsLedger = { 'fs.a': { 'date-fns': '^2.0.0' } };
    const result = mergePluginDeps('fs.b', { 'date-fns': '^3.0.0' }, runtimeDeps, ledger);
    expect(result.conflicts).toEqual([
      { name: 'date-fns', existing: '^2.0.0', incoming: '^3.0.0', kept: '^3.0.0' },
    ]);
    expect(runtimeDeps['date-fns']).toBe('^3.0.0');
  });

  it('keeps the existing (older) version when the incoming range is older', () => {
    const runtimeDeps: Record<string, string> = { 'date-fns': '^3.0.0' };
    const ledger: PluginDepsLedger = { 'fs.a': { 'date-fns': '^3.0.0' } };
    const result = mergePluginDeps('fs.b', { 'date-fns': '^2.0.0' }, runtimeDeps, ledger);
    expect(result.conflicts[0]?.kept).toBe('^3.0.0');
    expect(runtimeDeps['date-fns']).toBe('^3.0.0');
  });

  it('sorts runtimeDeps alphabetically after merging', () => {
    const runtimeDeps: Record<string, string> = { zod: '^4.0.0', next: 'catalog:' };
    const ledger: PluginDepsLedger = {};
    mergePluginDeps('fs.a', { 'date-fns': '^3.0.0' }, runtimeDeps, ledger);
    expect(Object.keys(runtimeDeps)).toEqual(['date-fns', 'next', 'zod']);
  });
});

describe('prunePluginDeps', () => {
  it('removes a dep only the departing plugin needed', () => {
    const runtimeDeps: Record<string, string> = { 'date-fns': '^3.0.0', next: 'catalog:' };
    const ledger: PluginDepsLedger = { 'fs.a': { 'date-fns': '^3.0.0' } };
    const result = prunePluginDeps('fs.a', runtimeDeps, ledger);
    expect(result.removed).toEqual(['date-fns']);
    expect(result.kept).toEqual([]);
    expect(runtimeDeps).toEqual({ next: 'catalog:' });
    expect(ledger['fs.a']).toBeUndefined();
  });

  it('keeps a dep still needed by another remaining plugin', () => {
    const runtimeDeps: Record<string, string> = { 'date-fns': '^3.0.0' };
    const ledger: PluginDepsLedger = {
      'fs.a': { 'date-fns': '^3.0.0' },
      'fs.b': { 'date-fns': '^3.0.0' },
    };
    const result = prunePluginDeps('fs.a', runtimeDeps, ledger);
    expect(result.removed).toEqual([]);
    expect(result.kept).toEqual(['date-fns']);
    expect(runtimeDeps['date-fns']).toBe('^3.0.0');
    expect(ledger['fs.b']).toEqual({ 'date-fns': '^3.0.0' });
  });

  it('is a no-op for a plugin with no ledger entry', () => {
    const runtimeDeps: Record<string, string> = { next: 'catalog:' };
    const ledger: PluginDepsLedger = {};
    const result = prunePluginDeps('fs.unknown', runtimeDeps, ledger);
    expect(result).toEqual({ removed: [], kept: [] });
    expect(runtimeDeps).toEqual({ next: 'catalog:' });
  });
});

describe('readPluginDepsLedger / writePluginDepsLedger', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'plugin-deps-ledger-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('returns {} when the ledger file does not exist', () => {
    expect(readPluginDepsLedger(join(dir, 'plugin-deps.json'))).toEqual({});
  });

  it('round-trips a ledger through disk', () => {
    const path = join(dir, 'nested', 'plugin-deps.json');
    const ledger: PluginDepsLedger = { 'fs.a': { 'date-fns': '^3.0.0' } };
    writePluginDepsLedger(path, ledger);
    expect(readPluginDepsLedger(path)).toEqual(ledger);
    expect(readFileSync(path, 'utf8')).toMatch(/\n$/);
  });
});

describe('hoistDepsForPlugin / pruneDepsForPlugin (orchestrators)', () => {
  let root: string;
  let runtimePkgPath: string;
  let ledgerPath: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'plugin-deps-root-'));
    mkdirSync(join(root, 'runtime'), { recursive: true });
    runtimePkgPath = join(root, 'runtime', 'package.json');
    ledgerPath = join(root, 'runtime', 'generated', 'plugin-deps.json');
    writeFileSync(
      runtimePkgPath,
      JSON.stringify({ name: 'runtime', dependencies: { next: 'catalog:' } }, null, 2),
    );
    spawnSyncMock.mockClear();
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('hoistDepsForPlugin is a no-op for a plugin with no external deps', () => {
    const pluginDir = mkdtempSync(join(tmpdir(), 'plugin-deps-plugin-'));
    writeFileSync(
      join(pluginDir, 'package.json'),
      JSON.stringify({ dependencies: { next: 'catalog:', '@sovereignfs/sdk': 'workspace:*' } }),
    );
    const result = hoistDepsForPlugin({
      pluginId: 'fs.example.noop',
      pluginPkgPath: join(pluginDir, 'package.json'),
      runtimePkgPath,
      ledgerPath,
      root,
    });
    expect(result).toBeNull();
    expect(spawnSyncMock).not.toHaveBeenCalled();
    rmSync(pluginDir, { recursive: true, force: true });
  });

  it('hoistDepsForPlugin writes runtime/package.json and the ledger, then installs', () => {
    const pluginDir = mkdtempSync(join(tmpdir(), 'plugin-deps-plugin-'));
    writeFileSync(
      join(pluginDir, 'package.json'),
      JSON.stringify({ dependencies: { '@dnd-kit/core': '^6.3.1', next: 'catalog:' } }),
    );

    const result = hoistDepsForPlugin({
      pluginId: 'fs.example.tasks',
      pluginPkgPath: join(pluginDir, 'package.json'),
      runtimePkgPath,
      ledgerPath,
      root,
    });

    expect(result?.added).toEqual(['@dnd-kit/core']);

    const runtimePkg = JSON.parse(readFileSync(runtimePkgPath, 'utf8')) as {
      dependencies: Record<string, string>;
    };
    expect(runtimePkg.dependencies['@dnd-kit/core']).toBe('^6.3.1');
    expect(readPluginDepsLedger(ledgerPath)).toEqual({
      'fs.example.tasks': { '@dnd-kit/core': '^6.3.1' },
    });

    const installCall = spawnSyncMock.mock.calls.find(
      (call) => call[0] === 'pnpm' && (call[1] as string[]).includes('install'),
    );
    expect(installCall).toBeDefined();
    expect(installCall?.[1]).toEqual(['install', '--filter', 'runtime']);

    rmSync(pluginDir, { recursive: true, force: true });
  });

  it('hoistDepsForPlugin skips pnpm install when install: false', () => {
    const pluginDir = mkdtempSync(join(tmpdir(), 'plugin-deps-plugin-'));
    writeFileSync(
      join(pluginDir, 'package.json'),
      JSON.stringify({ dependencies: { 'date-fns': '^3.0.0' } }),
    );

    hoistDepsForPlugin({
      pluginId: 'fs.example.tasks',
      pluginPkgPath: join(pluginDir, 'package.json'),
      runtimePkgPath,
      ledgerPath,
      root,
      install: false,
    });

    const installCall = spawnSyncMock.mock.calls.find(
      (call) => call[0] === 'pnpm' && (call[1] as string[]).includes('install'),
    );
    expect(installCall).toBeUndefined();

    rmSync(pluginDir, { recursive: true, force: true });
  });

  it('pruneDepsForPlugin is a no-op for a plugin with no ledger entry', () => {
    const result = pruneDepsForPlugin({
      pluginId: 'fs.example.never-installed',
      runtimePkgPath,
      ledgerPath,
      root,
    });
    expect(result).toBeNull();
    expect(spawnSyncMock).not.toHaveBeenCalled();
  });

  it('pruneDepsForPlugin removes deps and installs when something was actually removed', () => {
    writePluginDepsLedger(ledgerPath, { 'fs.example.tasks': { '@dnd-kit/core': '^6.3.1' } });
    writeFileSync(
      runtimePkgPath,
      JSON.stringify(
        { name: 'runtime', dependencies: { next: 'catalog:', '@dnd-kit/core': '^6.3.1' } },
        null,
        2,
      ),
    );

    const result = pruneDepsForPlugin({
      pluginId: 'fs.example.tasks',
      runtimePkgPath,
      ledgerPath,
      root,
    });

    expect(result?.removed).toEqual(['@dnd-kit/core']);
    const runtimePkg = JSON.parse(readFileSync(runtimePkgPath, 'utf8')) as {
      dependencies: Record<string, string>;
    };
    expect(runtimePkg.dependencies['@dnd-kit/core']).toBeUndefined();
    expect(readPluginDepsLedger(ledgerPath)).toEqual({});
    const installCall = spawnSyncMock.mock.calls.find(
      (call) => call[0] === 'pnpm' && (call[1] as string[]).includes('install'),
    );
    expect(installCall).toBeDefined();
  });

  it('pruneDepsForPlugin does not install when the removed dep is still needed by another plugin', () => {
    writePluginDepsLedger(ledgerPath, {
      'fs.a': { 'date-fns': '^3.0.0' },
      'fs.b': { 'date-fns': '^3.0.0' },
    });
    writeFileSync(
      runtimePkgPath,
      JSON.stringify({ name: 'runtime', dependencies: { 'date-fns': '^3.0.0' } }, null, 2),
    );

    const result = pruneDepsForPlugin({ pluginId: 'fs.a', runtimePkgPath, ledgerPath, root });
    expect(result?.removed).toEqual([]);
    expect(result?.kept).toEqual(['date-fns']);
    const installCall = spawnSyncMock.mock.calls.find(
      (call) => call[0] === 'pnpm' && (call[1] as string[]).includes('install'),
    );
    expect(installCall).toBeUndefined();
  });
});

describe('syncLocalPluginDeps', () => {
  let root: string;
  let pluginsDir: string;
  let runtimePkgPath: string;
  let ledgerPath: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'plugin-deps-sync-root-'));
    pluginsDir = join(root, 'plugins');
    mkdirSync(pluginsDir, { recursive: true });
    mkdirSync(join(root, 'runtime'), { recursive: true });
    runtimePkgPath = join(root, 'runtime', 'package.json');
    ledgerPath = join(root, 'runtime', 'generated', 'plugin-deps.json');
    writeFileSync(
      runtimePkgPath,
      JSON.stringify({ name: 'runtime', dependencies: { next: 'catalog:' } }, null, 2),
    );
    spawnSyncMock.mockClear();
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  function writeLocalPlugin(
    dirName: string,
    manifestId: string,
    deps: Record<string, string>,
  ): void {
    const dir = join(pluginsDir, dirName);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'manifest.json'), JSON.stringify({ id: manifestId }));
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ dependencies: deps }));
  }

  it('ignores directories that are not *.local', () => {
    writeLocalPlugin('sovereign-plugin-tasks', 'fs.example.tasks', { 'date-fns': '^3.0.0' });
    const result = syncLocalPluginDeps({ pluginsDir, runtimePkgPath, ledgerPath, root });
    expect(result.changed).toBe(false);
  });

  it('hoists a new dep found in a .local plugin and installs once', () => {
    writeLocalPlugin('sovereign-plugin-tasks.local', 'fs.example.tasks', {
      '@dnd-kit/core': '^6.3.1',
      next: 'catalog:',
    });
    const result = syncLocalPluginDeps({ pluginsDir, runtimePkgPath, ledgerPath, root });
    expect(result.changed).toBe(true);
    expect(readPluginDepsLedger(ledgerPath)).toEqual({
      'fs.example.tasks': { '@dnd-kit/core': '^6.3.1' },
    });
    const installCalls = spawnSyncMock.mock.calls.filter(
      (call) => call[0] === 'pnpm' && (call[1] as string[]).includes('install'),
    );
    expect(installCalls).toHaveLength(1);
  });

  it('is a no-op on a second run with nothing changed (no re-install)', () => {
    writeLocalPlugin('sovereign-plugin-tasks.local', 'fs.example.tasks', {
      '@dnd-kit/core': '^6.3.1',
    });
    syncLocalPluginDeps({ pluginsDir, runtimePkgPath, ledgerPath, root });
    spawnSyncMock.mockClear();

    const second = syncLocalPluginDeps({ pluginsDir, runtimePkgPath, ledgerPath, root });
    expect(second.changed).toBe(false);
    expect(spawnSyncMock).not.toHaveBeenCalled();
  });

  it('picks up a dep removed from a .local plugin package.json', () => {
    writeLocalPlugin('sovereign-plugin-tasks.local', 'fs.example.tasks', {
      '@dnd-kit/core': '^6.3.1',
    });
    syncLocalPluginDeps({ pluginsDir, runtimePkgPath, ledgerPath, root });

    writeLocalPlugin('sovereign-plugin-tasks.local', 'fs.example.tasks', {});
    const result = syncLocalPluginDeps({ pluginsDir, runtimePkgPath, ledgerPath, root });
    expect(result.changed).toBe(true);
    expect(readPluginDepsLedger(ledgerPath)['fs.example.tasks']).toBeUndefined();
  });

  it('skips a .local plugin directory with no manifest.json', () => {
    const dir = join(pluginsDir, 'broken.local');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ dependencies: {} }));
    const result = syncLocalPluginDeps({ pluginsDir, runtimePkgPath, ledgerPath, root });
    expect(result.changed).toBe(false);
  });
});
