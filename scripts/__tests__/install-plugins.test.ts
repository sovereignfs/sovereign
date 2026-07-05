import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  groupClones,
  isPluginInstalled,
  parsePluginsConfig,
  planInstall,
} from '../install-plugins';

describe('parsePluginsConfig', () => {
  it('parses an empty plugins array', () => {
    expect(parsePluginsConfig('{ "plugins": [] }')).toEqual({ plugins: [] });
  });

  it('parses valid entries', () => {
    const raw = JSON.stringify({
      plugins: [{ id: 'fs.example.tasks', repository: 'https://github.com/org/tasks' }],
    });
    expect(parsePluginsConfig(raw)).toEqual({
      plugins: [{ id: 'fs.example.tasks', repository: 'https://github.com/org/tasks' }],
    });
  });

  it('ignores unknown extra fields on entries', () => {
    const raw = JSON.stringify({
      plugins: [{ id: 'a', repository: 'r', branch: 'main' }],
    });
    expect(parsePluginsConfig(raw)).toEqual({ plugins: [{ id: 'a', repository: 'r' }] });
  });

  it('parses optional ref and subdir', () => {
    const raw = JSON.stringify({
      plugins: [{ id: 'example-basic', repository: 'r', ref: 'abc123', subdir: 'examples/basic' }],
    });
    expect(parsePluginsConfig(raw)).toEqual({
      plugins: [{ id: 'example-basic', repository: 'r', ref: 'abc123', subdir: 'examples/basic' }],
    });
  });

  it('throws on an empty ref or subdir when present', () => {
    expect(() =>
      parsePluginsConfig('{ "plugins": [{ "id": "a", "repository": "r", "ref": "" }] }'),
    ).toThrow(/\.ref/);
    expect(() =>
      parsePluginsConfig('{ "plugins": [{ "id": "a", "repository": "r", "subdir": 5 }] }'),
    ).toThrow(/\.subdir/);
  });

  it('throws on invalid JSON', () => {
    expect(() => parsePluginsConfig('{ not json')).toThrow(/not valid JSON/);
  });

  it('throws when "plugins" is missing or not an array', () => {
    expect(() => parsePluginsConfig('{}')).toThrow(/"plugins" array/);
    expect(() => parsePluginsConfig('{ "plugins": {} }')).toThrow(/"plugins" array/);
  });

  it('throws on a missing or empty id', () => {
    expect(() => parsePluginsConfig('{ "plugins": [{ "repository": "r" }] }')).toThrow(/\.id/);
    expect(() => parsePluginsConfig('{ "plugins": [{ "id": "", "repository": "r" }] }')).toThrow(
      /\.id/,
    );
  });

  it('throws on a missing repository', () => {
    expect(() => parsePluginsConfig('{ "plugins": [{ "id": "a" }] }')).toThrow(/\.repository/);
  });

  it('throws on duplicate ids', () => {
    const raw = JSON.stringify({
      plugins: [
        { id: 'dup', repository: 'r1' },
        { id: 'dup', repository: 'r2' },
      ],
    });
    expect(() => parsePluginsConfig(raw)).toThrow(/[Dd]uplicate/);
  });
});

describe('planInstall', () => {
  const config = {
    plugins: [
      { id: 'a', repository: 'ra' },
      { id: 'b', repository: 'rb' },
      { id: 'c', repository: 'rc' },
    ],
  };

  it('clones all when none are installed', () => {
    const { toClone, toSkip } = planInstall(config, () => false);
    expect(toClone.map((p) => p.id)).toEqual(['a', 'b', 'c']);
    expect(toSkip).toEqual([]);
  });

  it('skips all when all are installed', () => {
    const { toClone, toSkip } = planInstall(config, () => true);
    expect(toClone).toEqual([]);
    expect(toSkip.map((p) => p.id)).toEqual(['a', 'b', 'c']);
  });

  it('partitions by the predicate', () => {
    const { toClone, toSkip } = planInstall(config, (id) => id === 'b');
    expect(toClone.map((p) => p.id)).toEqual(['a', 'c']);
    expect(toSkip.map((p) => p.id)).toEqual(['b']);
  });
});

describe('groupClones', () => {
  it('groups entries sharing a repository and ref into one clone', () => {
    const groups = groupClones([
      { id: 'a', repository: 'repo1', ref: 'sha1', subdir: 'a' },
      { id: 'b', repository: 'repo1', ref: 'sha1', subdir: 'b' },
      { id: 'c', repository: 'repo2' },
    ]);
    expect(
      groups.map((g) => ({
        repository: g.repository,
        ref: g.ref,
        ids: g.entries.map((e) => e.id),
      })),
    ).toEqual([
      { repository: 'repo1', ref: 'sha1', ids: ['a', 'b'] },
      { repository: 'repo2', ref: undefined, ids: ['c'] },
    ]);
  });

  it('keeps the same repository at different refs in separate groups', () => {
    const groups = groupClones([
      { id: 'a', repository: 'repo1', ref: 'sha1' },
      { id: 'b', repository: 'repo1', ref: 'sha2' },
    ]);
    expect(groups).toHaveLength(2);
  });
});

describe('isPluginInstalled', () => {
  let pluginsDir: string;

  beforeEach(() => {
    pluginsDir = mkdtempSync(join(tmpdir(), 'install-plugins-'));
  });

  afterEach(() => {
    rmSync(pluginsDir, { recursive: true, force: true });
  });

  it('is false when neither the plain nor .local directory exists', () => {
    expect(isPluginInstalled('sovereign-tasks', pluginsDir)).toBe(false);
  });

  it('is true when plugins/<id> exists', () => {
    mkdirSync(join(pluginsDir, 'sovereign-tasks'));
    expect(isPluginInstalled('sovereign-tasks', pluginsDir)).toBe(true);
  });

  // The bug this guards against: a developer's plugins/<id>.local dev-override
  // checkout must count as "already installed" too, or a fresh install:plugins
  // run reclones the real repo alongside it — both declare the same manifest
  // id, producing a duplicate registry entry (a broken React key in the nav
  // rail at runtime).
  it('is true when only plugins/<id>.local exists', () => {
    mkdirSync(join(pluginsDir, 'sovereign-tasks.local'));
    expect(isPluginInstalled('sovereign-tasks', pluginsDir)).toBe(true);
  });
});
