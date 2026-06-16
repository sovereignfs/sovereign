import { describe, expect, it } from 'vitest';
import { parsePluginsConfig, planInstall } from '../install-plugins';

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
