import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const spawnSyncMock = vi.hoisted(() =>
  vi.fn((_command: string, _args?: readonly string[]) => ({ status: 0 })),
);
const execFileSyncMock = vi.hoisted(() => vi.fn());
vi.mock('node:child_process', () => ({
  spawnSync: spawnSyncMock,
  execFileSync: execFileSyncMock,
}));

import {
  groupClones,
  hoistDepsForClonedPlugins,
  isPluginInstalled,
  parsePluginsConfig,
  planInstall,
  resolveToken,
  withGitCredentials,
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

  it('parses an optional tokenEnv on an https:// repository', () => {
    const raw = JSON.stringify({
      plugins: [
        { id: 'a', repository: 'https://github.com/acme/private-plugin', tokenEnv: 'ACME_TOKEN' },
      ],
    });
    expect(parsePluginsConfig(raw)).toEqual({
      plugins: [
        { id: 'a', repository: 'https://github.com/acme/private-plugin', tokenEnv: 'ACME_TOKEN' },
      ],
    });
  });

  it('throws on an empty tokenEnv when present', () => {
    expect(() =>
      parsePluginsConfig(
        '{ "plugins": [{ "id": "a", "repository": "https://x/y", "tokenEnv": "" }] }',
      ),
    ).toThrow(/\.tokenEnv/);
  });

  it('throws when tokenEnv is set on a non-https:// repository', () => {
    expect(() =>
      parsePluginsConfig(
        '{ "plugins": [{ "id": "a", "repository": "git@github.com:org/r.git", "tokenEnv": "T" }] }',
      ),
    ).toThrow(/https:\/\//);
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

  it('carries tokenEnv onto the group', () => {
    const groups = groupClones([{ id: 'a', repository: 'https://x/y', tokenEnv: 'T' }]);
    expect(groups[0]?.tokenEnv).toBe('T');
  });

  it('throws when entries sharing a repo+ref declare different tokenEnv values', () => {
    expect(() =>
      groupClones([
        { id: 'a', repository: 'repo1', ref: 'sha1', tokenEnv: 'T1' },
        { id: 'b', repository: 'repo1', ref: 'sha1', tokenEnv: 'T2' },
      ]),
    ).toThrow(/tokenEnv/);
  });
});

describe('resolveToken', () => {
  it('returns undefined when tokenEnv is undefined', () => {
    expect(resolveToken(undefined, {})).toBeUndefined();
  });

  it('returns the env var value when set', () => {
    expect(resolveToken('MY_TOKEN', { MY_TOKEN: 'secret' })).toBe('secret');
  });

  it('throws a clear error naming the env var when unset', () => {
    expect(() => resolveToken('MY_TOKEN', {})).toThrow(/MY_TOKEN/);
  });

  it('throws when the env var is set but empty', () => {
    expect(() => resolveToken('MY_TOKEN', { MY_TOKEN: '' })).toThrow(/MY_TOKEN/);
  });
});

describe('withGitCredentials', () => {
  it('calls fn with no credArgs when token is undefined', () => {
    const credArgs = withGitCredentials('https://github.com/org/repo', undefined, (args) => args);
    expect(credArgs).toEqual([]);
  });

  it('writes a 0600 credential file embedding the token, then removes it after fn runs', () => {
    let capturedFile: string | undefined;
    const credArgs = withGitCredentials('https://github.com/org/repo', 'shh-secret', (args) => {
      // args: ['-c', 'credential.helper=', '-c', 'credential.helper=store --file=<path>']
      const helperArg = args[3] ?? '';
      capturedFile = helperArg.replace('credential.helper=store --file=', '');
      expect(existsSync(capturedFile)).toBe(true);
      const contents = readFileSync(capturedFile, 'utf8');
      expect(contents).toContain('shh-secret');
      expect(contents).toContain('x-access-token');
      const mode = statSync(capturedFile).mode & 0o777;
      expect(mode).toBe(0o600);
      return args;
    });
    expect(credArgs[0]).toBe('-c');
    expect(capturedFile).toBeDefined();
    expect(existsSync(capturedFile as string)).toBe(false);
  });

  it('cleans up the credential file even when fn throws', () => {
    let capturedFile: string | undefined;
    expect(() =>
      withGitCredentials('https://github.com/org/repo', 'shh-secret', (args) => {
        const helperArg = args[3] ?? '';
        capturedFile = helperArg.replace('credential.helper=store --file=', '');
        throw new Error('boom');
      }),
    ).toThrow(/boom/);
    expect(existsSync(capturedFile as string)).toBe(false);
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

// RFC 0057: install-plugins.ts's bulk clone path (what `pnpm install:plugins`
// / a real Docker build runs) previously never hoisted a cloned plugin's
// external deps into runtime/package.json, unlike `sv plugin add` and `pnpm
// dev`'s local-plugin sync — the gap that let sovereign-plugin-travellog ship
// without nanoid/tz-lookup/@dnd-kit declared anywhere the build could see.
describe('hoistDepsForClonedPlugins', () => {
  let root: string;
  let pluginsDir: string;
  let runtimePkgPath: string;
  let ledgerPath: string;
  let logSpy: ReturnType<typeof vi.spyOn>;
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'install-plugins-hoist-root-'));
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
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
    logSpy.mockRestore();
    warnSpy.mockRestore();
  });

  const paths = () => ({ pluginsDir, runtimePkgPath, ledgerPath, root });

  it('is a no-op when no plugins were cloned', () => {
    hoistDepsForClonedPlugins([], paths());
    expect(spawnSyncMock).not.toHaveBeenCalled();
    expect(logSpy).not.toHaveBeenCalled();
    expect(existsSync(ledgerPath)).toBe(false);
  });

  it('hoists a cloned plugin declaring an external dep into runtime/package.json and the ledger', () => {
    mkdirSync(join(pluginsDir, 'fs.example.tasks'), { recursive: true });
    writeFileSync(
      join(pluginsDir, 'fs.example.tasks', 'package.json'),
      JSON.stringify({ dependencies: { 'date-fns': '^3.0.0', next: 'catalog:' } }),
    );

    hoistDepsForClonedPlugins(['fs.example.tasks'], paths());

    const runtimePkg = JSON.parse(readFileSync(runtimePkgPath, 'utf8')) as {
      dependencies: Record<string, string>;
    };
    expect(runtimePkg.dependencies['date-fns']).toBe('^3.0.0');
    expect(JSON.parse(readFileSync(ledgerPath, 'utf8'))).toEqual({
      'fs.example.tasks': { 'date-fns': '^3.0.0' },
    });
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('date-fns'));

    const installCall = spawnSyncMock.mock.calls.find(
      (call) => call[0] === 'pnpm' && (call[1] as string[]).includes('install'),
    );
    expect(installCall?.[1]).toEqual(['install', '--filter', 'runtime']);
  });

  it('skips a cloned plugin with no external deps (no ledger entry, no console output)', () => {
    mkdirSync(join(pluginsDir, 'fs.example.noop'), { recursive: true });
    writeFileSync(
      join(pluginsDir, 'fs.example.noop', 'package.json'),
      JSON.stringify({ dependencies: { next: 'catalog:', '@sovereignfs/sdk': 'workspace:*' } }),
    );

    hoistDepsForClonedPlugins(['fs.example.noop'], paths());

    expect(spawnSyncMock).not.toHaveBeenCalled();
    expect(logSpy).not.toHaveBeenCalled();
    expect(existsSync(ledgerPath)).toBe(false);
  });

  it('hoists deps for several cloned plugins independently in one pass', () => {
    mkdirSync(join(pluginsDir, 'fs.example.a'), { recursive: true });
    writeFileSync(
      join(pluginsDir, 'fs.example.a', 'package.json'),
      JSON.stringify({ dependencies: { 'date-fns': '^3.0.0' } }),
    );
    mkdirSync(join(pluginsDir, 'fs.example.b'), { recursive: true });
    writeFileSync(
      join(pluginsDir, 'fs.example.b', 'package.json'),
      JSON.stringify({ dependencies: { nanoid: '^5.0.9' } }),
    );

    hoistDepsForClonedPlugins(['fs.example.a', 'fs.example.b'], paths());

    expect(JSON.parse(readFileSync(ledgerPath, 'utf8'))).toEqual({
      'fs.example.a': { 'date-fns': '^3.0.0' },
      'fs.example.b': { nanoid: '^5.0.9' },
    });
    const runtimePkg = JSON.parse(readFileSync(runtimePkgPath, 'utf8')) as {
      dependencies: Record<string, string>;
    };
    expect(runtimePkg.dependencies['date-fns']).toBe('^3.0.0');
    expect(runtimePkg.dependencies['nanoid']).toBe('^5.0.9');
  });

  it('warns on a version conflict but keeps the newer range, mirroring sv plugin add', () => {
    mkdirSync(join(root, 'runtime', 'generated'), { recursive: true });
    writeFileSync(ledgerPath, JSON.stringify({ 'fs.example.a': { 'date-fns': '^2.0.0' } }));
    const runtimePkg = JSON.parse(readFileSync(runtimePkgPath, 'utf8')) as {
      dependencies: Record<string, string>;
    };
    runtimePkg.dependencies['date-fns'] = '^2.0.0';
    writeFileSync(runtimePkgPath, JSON.stringify(runtimePkg));

    mkdirSync(join(pluginsDir, 'fs.example.b'), { recursive: true });
    writeFileSync(
      join(pluginsDir, 'fs.example.b', 'package.json'),
      JSON.stringify({ dependencies: { 'date-fns': '^3.0.0' } }),
    );

    hoistDepsForClonedPlugins(['fs.example.b'], paths());

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('date-fns'));
    const finalRuntimePkg = JSON.parse(readFileSync(runtimePkgPath, 'utf8')) as {
      dependencies: Record<string, string>;
    };
    expect(finalRuntimePkg.dependencies['date-fns']).toBe('^3.0.0');
  });
});
