import { execFileSync, spawnSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { CreateError, createInstance, readRequest, type CreateIo, type Exec } from './create.js';
import { LAUNCHER } from './templates.js';

const folders: string[] = [];
const temp = () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'sv-create-'));
  folders.push(dir);
  return dir;
};
afterEach(() => {
  for (const dir of folders.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const git = {
  GIT_AUTHOR_NAME: 'T',
  GIT_AUTHOR_EMAIL: 't@example.test',
  GIT_COMMITTER_NAME: 'T',
  GIT_COMMITTER_EMAIL: 't@example.test',
};
Object.assign(process.env, git);

/** Real git, and an npm that does what the real one would leave behind, so no network is needed. */
function toolchain(options: { npmFails?: boolean } = {}) {
  const calls: string[] = [];
  const exec: Exec = async (command, args, { cwd }) => {
    calls.push(`${command} ${args.join(' ')}`);
    if (command === 'npm') {
      if (options.npmFails)
        return { code: 1, stdout: '', stderr: 'npm error code E404\nnpm error 404 Not Found\n' };
      if (args[0] === 'install')
        writeFileSync(path.join(cwd, 'package-lock.json'), '{"lockfileVersion":3}\n');
      if (args[0] === 'ci')
        mkdirSync(path.join(cwd, 'node_modules', '@sovereignfs', 'cli'), { recursive: true });
      return { code: 0, stdout: '', stderr: '' };
    }
    const done = spawnSync(command, [...args], { cwd, encoding: 'utf8' });
    return { code: done.status ?? 1, stdout: done.stdout, stderr: done.stderr };
  };
  const said: string[] = [];
  const io: CreateIo = {
    err: (line) => said.push(line),
    interactive: false,
    ask: () => Promise.reject(new Error('unexpected')),
  };
  return { exec, calls, said, io };
}

describe('what npm create was asked', () => {
  const read = (argv: string[], env: NodeJS.ProcessEnv = {}) => readRequest(argv, env);

  it('is a word and a folder, which needs no -- on any package manager', () => {
    expect(read(['instance', 'my-instance'])).toEqual({
      kind: 'instance',
      dir: 'my-instance',
      remote: undefined,
    });
    expect(read(['instance', 'x', '--remote', 'git@example.com:me/x.git']).remote).toBe(
      'git@example.com:me/x.git',
    );
    expect(read(['instance', 'x', '--remote=u']).remote).toBe('u');
    expect(read(['app', 'a']).kind).toBe('app');
  });

  it('may be the flag in place of the word, from the arguments or from what npm kept for itself', () => {
    expect(read(['--instance', 'x'])).toMatchObject({ kind: 'instance', dir: 'x' });
    expect(read(['--app', 'x']).kind).toBe('app');
    expect(read(['x'], { npm_config_instance: 'true' })).toMatchObject({
      kind: 'instance',
      dir: 'x',
    });
    expect(read(['x'], { npm_config_app: 'true' }).kind).toBe('app');
    expect(read(['x'], { npm_config_instance: 'false' }).kind).toBeUndefined();
  });

  it('is nothing to go on when there is no word, and says what is wrong with an odd option or too many words', () => {
    expect(read([])).toEqual({ kind: undefined, dir: undefined, remote: undefined });
    expect(() => read(['instance', 'a', 'b'])).toThrow('Too many arguments');
    expect(() => read(['instance', 'a', '--force'])).toThrow(CreateError);
  });
});

describe('making an instance repository', () => {
  const make = async (target: string, tools = toolchain(), remote?: string) => {
    const cwd = temp();
    await createInstance({ dir: target, remote, cliVersion: '0.1.0' }, tools.io, tools.exec, cwd);
    return { cwd, dir: path.join(cwd, target), ...tools };
  };

  it('writes the files, pins the toolkit exactly, installs from the lockfile, and makes the first commit without pushing', async () => {
    const made = await make('my-instance');
    const pkg = JSON.parse(readFileSync(path.join(made.dir, 'package.json'), 'utf8')) as {
      name: string;
      private: boolean;
      dependencies: Record<string, string>;
    };
    expect(pkg).toMatchObject({
      name: 'my-instance',
      private: true,
      dependencies: { '@sovereignfs/cli': '0.1.0' },
    });
    expect(readFileSync(path.join(made.dir, '.gitignore'), 'utf8')).toContain('age.key');
    expect(statSync(path.join(made.dir, 'sv')).mode & 0o111).not.toBe(0);
    expect(made.calls).toEqual([
      'git init --initial-branch=main',
      'npm install --package-lock-only --ignore-scripts --no-audit --no-fund',
      'npm ci --ignore-scripts --no-audit --no-fund',
      'git add -- package.json package-lock.json sv .gitignore README.md',
      'git commit -m Create the instance',
    ]);
    const files = execFileSync('git', ['ls-files'], { cwd: made.dir, encoding: 'utf8' })
      .trim()
      .split('\n')
      .sort();
    expect(files).toEqual(['.gitignore', 'README.md', 'package-lock.json', 'package.json', 'sv']);
    expect(execFileSync('git', ['remote'], { cwd: made.dir, encoding: 'utf8' })).toBe('');
    expect(made.said.join('\n')).toContain('./sv setup');
  });

  it('adds the remote as origin when given one, and still does not push', async () => {
    const made = await make('x', toolchain(), 'git@example.com:me/x.git');
    expect(
      execFileSync('git', ['remote', 'get-url', 'origin'], {
        cwd: made.dir,
        encoding: 'utf8',
      }).trim(),
    ).toBe('git@example.com:me/x.git');
    expect(made.calls.some((call) => call.startsWith('git push'))).toBe(false);
  });

  it('works in a folder that exists and is empty', async () => {
    const cwd = temp();
    mkdirSync(path.join(cwd, 'empty'));
    const tools = toolchain();
    await createInstance(
      { dir: 'empty', remote: undefined, cliVersion: '0.1.0' },
      tools.io,
      tools.exec,
      cwd,
    );
    expect(existsSync(path.join(cwd, 'empty', 'package.json'))).toBe(true);
  });

  it('refuses a folder with anything in it, and writes nothing', async () => {
    const cwd = temp();
    mkdirSync(path.join(cwd, 'taken'));
    writeFileSync(path.join(cwd, 'taken', 'mine.txt'), 'keep me');
    const tools = toolchain();
    const error = await createInstance(
      { dir: 'taken', remote: undefined, cliVersion: '0.1.0' },
      tools.io,
      tools.exec,
      cwd,
    ).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(CreateError);
    expect((error as CreateError).exitCode).toBe(2);
    expect(existsSync(path.join(cwd, 'taken', 'package.json'))).toBe(false);
    expect(tools.calls).toEqual([]);
  });

  it('fails, saying how to carry on by hand, when npm cannot resolve the toolkit', async () => {
    const cwd = temp();
    const tools = toolchain({ npmFails: true });
    const error = await createInstance(
      { dir: 'x', remote: undefined, cliVersion: '0.1.0' },
      tools.io,
      tools.exec,
      cwd,
    ).catch((e: unknown) => e);
    expect((error as CreateError).exitCode).toBe(1);
    expect((error as CreateError).message).toContain('Resolving the toolkit failed');
    expect((error as CreateError).hint).toContain('npm install --package-lock-only');
  });

  it('names the repository after the folder, in a name npm accepts', async () => {
    const made = await make('My Instance!');
    expect(
      (JSON.parse(readFileSync(path.join(made.dir, 'package.json'), 'utf8')) as { name: string })
        .name,
    ).toBe('my-instance-');
  });
});

describe('the launcher (operator-cli §3)', () => {
  /** A folder with the launcher in it, and a PATH holding stand-ins for node and npm. */
  function launcherWorld(options: { node?: string; withToolkit?: boolean } = {}) {
    const root = temp();
    const bin = temp();
    const log = path.join(root, 'log.txt');
    writeFileSync(path.join(root, 'sv'), LAUNCHER);
    chmodSync(path.join(root, 'sv'), 0o755);
    const tool = (name: string, body: string) => {
      writeFileSync(path.join(bin, name), `#!/bin/sh\n${body}\n`);
      chmodSync(path.join(bin, name), 0o755);
    };
    const realNode = process.execPath;
    tool(
      'node',
      options.node
        ? `case "$*" in *versions*) echo ${options.node};; *) echo "node $*" >> "${log}";; esac`
        : `exec "${realNode}" "$@"`,
    );
    tool(
      'npm',
      `echo "npm $*" >> "${log}"; mkdir -p node_modules/@sovereignfs/cli/dist; printf 'console.log(JSON.stringify({ root: process.env.SV_ROOT, args: process.argv.slice(2) }));' > node_modules/@sovereignfs/cli/dist/sv.mjs`,
    );
    tool('npx', `echo "npx $*" >> "${log}"; exit 99`);
    if (options.withToolkit) {
      mkdirSync(path.join(root, 'node_modules', '@sovereignfs', 'cli', 'dist'), {
        recursive: true,
      });
      writeFileSync(
        path.join(root, 'node_modules', '@sovereignfs', 'cli', 'dist', 'sv.mjs'),
        'console.log(JSON.stringify({ root: process.env.SV_ROOT, args: process.argv.slice(2) }));',
      );
    }
    const run = (args: string[], cwd = root) =>
      spawnSync(path.join(root, 'sv'), args, {
        cwd,
        encoding: 'utf8',
        env: { PATH: `${bin}:/usr/bin:/bin` },
      });
    return { root, run, log: () => (existsSync(log) ? readFileSync(log, 'utf8') : '') };
  }

  it('is valid POSIX shell', () => {
    const dir = temp();
    writeFileSync(path.join(dir, 'sv'), LAUNCHER);
    expect(spawnSync('sh', ['-n', path.join(dir, 'sv')]).status).toBe(0);
  });

  it('runs the toolkit that is installed, with the repository’s root and the arguments, from any folder inside it', () => {
    const world = launcherWorld({ withToolkit: true });
    mkdirSync(path.join(world.root, 'overrides', 'deep'), { recursive: true });
    const done = world.run(['app', 'list'], path.join(world.root, 'overrides', 'deep'));
    expect(done.status).toBe(0);
    expect(JSON.parse(done.stdout)).toEqual({
      root: execFileSync('sh', ['-c', `cd "${world.root}" && pwd -P`], { encoding: 'utf8' }).trim(),
      args: ['app', 'list'],
    });
    expect(world.log()).toBe('');
  });

  it('installs from the lockfile with npm ci, and nothing else that fetches, when the toolkit is missing', () => {
    const world = launcherWorld();
    const done = world.run(['--version']);
    expect(done.status).toBe(0);
    expect(world.log()).toBe('npm ci --ignore-scripts --no-audit --no-fund\n');
    expect(world.log()).not.toContain('npx');
    expect(JSON.parse(done.stdout).args).toEqual(['--version']);
  });

  it('stops, saying so, when Node is older than the toolkit supports', () => {
    const world = launcherWorld({ node: '22' });
    const done = world.run(['setup']);
    expect(done.status).toBe(2);
    expect(done.stderr).toContain('needs Node 24 or newer');
    expect(world.log()).not.toContain('npm');
  });

  it('stops, saying so, when there is no Node', () => {
    const world = launcherWorld();
    const done = spawnSync(path.join(world.root, 'sv'), [], {
      encoding: 'utf8',
      env: { PATH: '/nonexistent' },
    });
    expect(done.status).toBe(2);
    expect(done.stderr).toContain('node was not found');
  });
});
