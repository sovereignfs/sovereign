import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { Locked, Refused } from '../errors.js';
import { fakeHost } from '../testing/fake-host.js';
import { makeSource, type Source } from '../testing/source.js';
import { receive, type ReceiveOptions, type ReceiverHost } from './receive.js';
import { makeArchive } from './tar.js';

const sources: Source[] = [];
afterEach(() => {
  for (const made of sources.splice(0))
    rmSync(path.dirname(made.dir), { recursive: true, force: true });
});
const commit = 'a'.repeat(40);

/** The files of a commit as an archive, the way `sv deploy` sends them. */
async function archiveOf(extra: Record<string, string> = {}) {
  const made = await makeSource();
  sources.push(made);
  const files: Record<string, string> = {
    'suite.yml': readFileSync(path.join(made.dir, 'suite.yml'), 'utf8'),
    'suite.lock': readFileSync(path.join(made.dir, 'suite.lock'), 'utf8'),
    ...extra,
  };
  return { made, archive: makeArchive(files) };
}

type Call = string[];
function receiver(
  handle: (
    args: string[],
    calls: Call[],
  ) => { code?: number; stdout?: string; stderr?: string } = () => ({}),
) {
  const { host } = fakeHost();
  const calls: Call[] = [];
  const followed: string[][] = [];
  const base: ReceiverHost = {
    ...host,
    docker: async (args) => {
      calls.push([...args]);
      const answer = handle([...args], calls);
      return { code: answer.code ?? 0, stdout: answer.stdout ?? '', stderr: answer.stderr ?? '' };
    },
    follow: async (args, write) => {
      followed.push([...args]);
      write('Applied.\n');
      return 0;
    },
  };
  return { host: base, calls, followed };
}
const stateDir = () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'sv-recv-'));
  sources.push({ dir: path.join(dir, 'x'), stateDir: dir } as Source);
  return dir;
};
const options = (dir: string, line: string, extra: Partial<ReceiveOptions> = {}) => {
  const out: string[] = [];
  return {
    out,
    options: {
      line,
      deployOnly: false,
      stateDir: dir,
      stdin: async () => Buffer.alloc(0),
      out: (text: string) => out.push(text),
      ...extra,
    } satisfies ReceiveOptions,
  };
};

describe('a deployment', () => {
  it('extracts the files, starts sv apply from the image the lock names, detached, and follows it', async () => {
    const { archive } = await archiveOf();
    const dir = stateDir();
    const { host, calls, followed } = receiver((args) =>
      args[0] === 'wait' ? { stdout: '0\n' } : args[0] === 'inspect' ? { stdout: 'false\n' } : {},
    );
    const { options: o, out } = options(dir, `deploy ${commit}`, { stdin: async () => archive });
    expect(await receive(host, o)).toBe(0);
    expect(existsSync(path.join(dir, 'incoming', commit, 'suite.lock'))).toBe(true);
    const run = calls.find((c) => c[0] === 'run') as string[];
    expect(run).toContain('--detach');
    expect(run).toContain('--name');
    expect(run[run.indexOf('--name') + 1]).toBe('sv-apply');
    expect(run.slice(-5)).toEqual([
      'apply',
      '--from',
      path.join(dir, 'incoming', commit),
      '--commit',
      commit,
    ]);
    expect(
      run.some((word) => /^ghcr\.io\/sovereignfs\/cli:.*@sha256:[0-9a-f]{64}$/.test(word)),
    ).toBe(true);
    expect(followed).toEqual([['logs', '--follow', 'sv-apply']]);
    expect(out.join('')).toContain('Applied.');
  });

  it('ends with the code sv apply ended with, and treats anything else as a failure', async () => {
    const { archive } = await archiveOf();
    for (const [waited, expected] of [
      ['3\n', 3],
      ['2\n', 2],
      ['137\n', 1],
      ['', 1],
    ] as const) {
      const { host } = receiver((args) =>
        args[0] === 'wait'
          ? { stdout: waited }
          : args[0] === 'inspect'
            ? { stdout: 'false\n' }
            : {},
      );
      const { options: o } = options(stateDir(), `deploy ${commit}`, {
        stdin: async () => archive,
      });
      expect(await receive(host, o)).toBe(expected);
    }
  });

  it('refuses while another deployment is running, before reading the archive', async () => {
    const { host, calls } = receiver((args) => (args[0] === 'inspect' ? { stdout: 'true\n' } : {}));
    let read = false;
    const { options: o } = options(stateDir(), `deploy ${commit}`, {
      stdin: async () => {
        read = true;
        return Buffer.alloc(0);
      },
    });
    await expect(receive(host, o)).rejects.toBeInstanceOf(Locked);
    expect(read).toBe(false);
    expect(calls.some((c) => c[0] === 'run')).toBe(false);
  });

  it('refuses an archive with a file that is not an instance file, and an archive without a lock, starting nothing', async () => {
    const { host, calls } = receiver((args) =>
      args[0] === 'inspect' ? { stdout: 'false\n' } : {},
    );
    for (const archive of [
      makeArchive({ 'suite.yml': 'x', 'suite.lock': 'x', 'evil.sh': 'x' }),
      makeArchive({ 'suite.yml': 'x' }),
    ]) {
      const { options: o } = options(stateDir(), `deploy ${commit}`, {
        stdin: async () => archive,
      });
      await expect(receive(host, o)).rejects.toBeInstanceOf(Refused);
    }
    expect(calls.some((c) => c[0] === 'run')).toBe(false);
  });

  it('uses an image already on the machine, and pulls one that is not', async () => {
    const { archive } = await archiveOf();
    for (const [have, pulls] of [
      [true, false],
      [false, true],
    ] as const) {
      const { host, calls } = receiver((args) =>
        args[0] === 'image'
          ? { code: have ? 0 : 1 }
          : args[0] === 'inspect'
            ? { stdout: 'false\n' }
            : args[0] === 'wait'
              ? { stdout: '0' }
              : {},
      );
      const { options: o } = options(stateDir(), `deploy ${commit}`, {
        stdin: async () => archive,
      });
      await receive(host, o);
      expect(calls.some((c) => c[0] === 'pull')).toBe(pulls);
    }
  });
});

describe('the key that only deploys', () => {
  it('may deploy and ask the version, and nothing else', async () => {
    const { host } = receiver();
    for (const line of ['status', 'doctor', 'logs core', 'app notes --secret', 'rotate notes']) {
      const { options: o } = options(stateDir(), line, { deployOnly: true });
      await expect(receive(host, o), line).rejects.toThrow(/deploy and do nothing else/);
    }
    const { options: o, out } = options(stateDir(), 'version', { deployOnly: true });
    expect(await receive(host, o)).toBe(0);
    expect(out.join('')).toBe('1\n');
  });
});

describe('the other requests', () => {
  it('reports what is running and what the server recorded', async () => {
    const dir = stateDir();
    writeFileSync(path.join(dir, 'state.json'), JSON.stringify({ schema: 1, commit, apps: {} }));
    const { host } = receiver((args) =>
      args[0] === 'ps'
        ? {
            stdout:
              '{"Names":"sv-core","State":"running","Status":"Up 2 hours (healthy)","Image":"x"}\n',
          }
        : args[0] === 'inspect'
          ? { stdout: 'false\n' }
          : {},
    );
    const { options: o, out } = options(dir, 'status');
    expect(await receive(host, o)).toBe(0);
    expect(JSON.parse(out.join(''))).toMatchObject({
      state: { commit },
      containers: [{ name: 'sv-core', state: 'running' }],
      deploying: false,
    });
  });

  it('shows the logs of what is asked for, and refuses what is not there', async () => {
    const { host, calls } = receiver((args) =>
      args.includes('sv-app-notes')
        ? { stdout: 'hello\n', stderr: 'warn\n' }
        : args[0] === 'logs'
          ? { code: 1 }
          : {},
    );
    const a = options(stateDir(), 'logs notes 20');
    expect(await receive(host, a.options)).toBe(0);
    expect(a.out.join('')).toBe('hello\nwarn\n');
    expect(calls.find((c) => c[0] === 'logs')).toEqual(['logs', '--tail', '20', 'sv-app-notes']);
    await expect(receive(host, options(stateDir(), 'logs ghost').options)).rejects.toBeInstanceOf(
      Refused,
    );
  });

  it('gives an app’s record, and its secret only when asked', async () => {
    const dir = stateDir();
    mkdirSync(path.join(dir, 'secrets'), { recursive: true });
    writeFileSync(path.join(dir, 'secrets', 'app-notes-client-secret'), 's3cret');
    writeFileSync(
      path.join(dir, 'state.json'),
      JSON.stringify({ apps: { notes: { kind: 'hosted', clientId: 'c1' } } }),
    );
    const { host } = receiver();
    const plain = options(dir, 'app notes');
    await receive(host, plain.options);
    expect(plain.out.join('')).not.toContain('s3cret');
    expect(JSON.parse(plain.out.join(''))).toMatchObject({ name: 'notes', clientId: 'c1' });
    const secret = options(dir, 'app notes --secret');
    await receive(host, secret.options);
    expect(secret.out.join('')).toBe('s3cret\n');
    await expect(receive(host, options(dir, 'app ghost').options)).rejects.toBeInstanceOf(Refused);
  });

  it('rotates a hosted app’s secret into its file and restarts it, and an external one only has the file changed', async () => {
    const dir = stateDir();
    mkdirSync(path.join(dir, 'secrets'), { recursive: true });
    writeFileSync(
      path.join(dir, 'state.json'),
      JSON.stringify({ apps: { notes: { kind: 'hosted' }, wiki: { kind: 'external' } } }),
    );
    const { host, calls } = receiver((args) =>
      args[0] === 'inspect'
        ? { stdout: 'false\n' }
        : args[0] === 'exec'
          ? { stdout: '{"secret":"new-one"}\n' }
          : {},
    );
    await receive(host, options(dir, 'rotate notes').options);
    expect(readFileSync(path.join(dir, 'secrets', 'app-notes-client-secret'), 'utf8')).toBe(
      'new-one',
    );
    expect(calls.some((c) => c[0] === 'restart' && c[1] === 'sv-app-notes')).toBe(true);
    calls.length = 0;
    await receive(host, options(dir, 'rotate wiki').options);
    expect(calls.some((c) => c[0] === 'restart')).toBe(false);
    expect(readFileSync(path.join(dir, 'secrets', 'app-wiki-client-secret'), 'utf8')).toBe(
      'new-one',
    );
  });
});

describe('what the archive may hold and what the lock may name', () => {
  it('refuses a file that is an instance file of the repository but not of a deployment', async () => {
    const { host } = receiver((args) => (args[0] === 'inspect' ? { stdout: 'false\n' } : {}));
    const { options: o } = options(stateDir(), `deploy ${commit}`, {
      stdin: async () => makeArchive({ 'suite.yml': 'x', 'suite.lock': 'x', 'package.json': '{}' }),
    });
    await expect(receive(host, o)).rejects.toThrow(/not an instance file/);
  });

  it('refuses a toolkit image in the lock that is not an image by digest, before running anything', async () => {
    const { made } = await archiveOf();
    const lock = readFileSync(path.join(made.dir, 'suite.lock'), 'utf8').replace(
      /(cli:\n\s+ref: )\S+/,
      '$1--privileged',
    );
    const { host, calls } = receiver((args) =>
      args[0] === 'inspect' ? { stdout: 'false\n' } : {},
    );
    const { options: o } = options(stateDir(), `deploy ${commit}`, {
      stdin: async () =>
        makeArchive({
          'suite.yml': readFileSync(path.join(made.dir, 'suite.yml'), 'utf8'),
          'suite.lock': lock,
        }),
    });
    await expect(receive(host, o)).rejects.toThrow(/not an image by digest/);
    expect(calls.some((c) => c[0] === 'run')).toBe(false);
  });
});
