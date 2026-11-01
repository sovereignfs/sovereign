import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { Failed, Locked, Refused } from '../errors.js';
import { fakeHost } from '../testing/fake-host.js';
import { makeSource, type Source } from '../testing/source.js';
import { receive, type ReceiveOptions, type ReceiverHost } from './receive.js';
import { joinRestore, makeArchive } from './tar.js';

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
    for (const line of [
      'status',
      'doctor',
      'logs core',
      'app notes --secret',
      'rotate notes',
      'seed',
      'seed --json',
    ]) {
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

describe('a restore', () => {
  const backupOf = (names: string[]) =>
    makeArchive(Object.fromEntries(names.map((name) => [name, `content of ${name}`])));
  const sent = (deployment: Buffer, backup: Buffer) => joinRestore(deployment, backup);
  const idle = (args: string[]) =>
    args[0] === 'inspect' ? { stdout: 'false\n' } : args[0] === 'wait' ? { stdout: '0\n' } : {};

  it('unpacks the backup beside the deployment’s files, and starts sv apply with the backup as its data to restore', async () => {
    const { archive } = await archiveOf();
    const dir = stateDir();
    const { host, calls } = receiver(idle);
    const body = sent(
      archive,
      backupOf([
        './databases.sql',
        './secrets/role-core-password',
        './volumes/sovereign-app-notes_data-0.tar',
      ]),
    );
    const { options: o, out } = options(dir, `restore ${commit}`, { stdin: async () => body });
    expect(await receive(host, o)).toBe(0);
    expect(readFileSync(path.join(dir, 'incoming', 'restore', 'databases.sql'), 'utf8')).toBe(
      'content of ./databases.sql',
    );
    expect(existsSync(path.join(dir, 'incoming', 'restore', 'secrets', 'role-core-password'))).toBe(
      true,
    );
    expect(existsSync(path.join(dir, 'incoming', commit, 'suite.lock'))).toBe(true);
    const run = calls.find((c) => c[0] === 'run') as string[];
    expect(run).toContain('--restore-from');
    expect(run[run.indexOf('--restore-from') + 1]).toBe(path.join(dir, 'incoming', 'restore'));
    expect(out.join('')).toContain('and a backup of 3 files');
  });

  it('takes the backup as the server makes one, which holds state.json, and does not unpack it', async () => {
    const { archive } = await archiveOf();
    const dir = stateDir();
    const { host, calls } = receiver(idle);
    const body = sent(
      archive,
      backupOf(['./databases.sql', './state.json', './secrets/role-core-password']),
    );
    const { options: o } = options(dir, `restore ${commit}`, { stdin: async () => body });
    expect(await receive(host, o)).toBe(0);
    expect(calls.some((c) => c[0] === 'run')).toBe(true);
    expect(existsSync(path.join(dir, 'incoming', 'restore', 'state.json'))).toBe(false);
    expect(existsSync(path.join(dir, 'incoming', 'restore', 'databases.sql'))).toBe(true);
  });

  it('refuses a backup that holds no databases, and a file a backup does not hold, starting nothing', async () => {
    const { archive } = await archiveOf();
    const { host, calls } = receiver(idle);
    for (const names of [
      ['./secrets/x'],
      ['./databases.sql', './evil.sh'],
      ['./databases.sql', './secrets/../x'],
      ['./databases.sql', './volumes/other.tar'],
    ]) {
      const { options: o } = options(stateDir(), `restore ${commit}`, {
        stdin: async () => sent(archive, backupOf(names)),
      });
      await expect(receive(host, o), names.join()).rejects.toBeInstanceOf(Refused);
    }
    expect(calls.some((c) => c[0] === 'run')).toBe(false);
  });

  it('is refused for a connection with the deployment key, and while a deployment runs', async () => {
    const { host } = receiver((args) => (args[0] === 'inspect' ? { stdout: 'true\n' } : {}));
    const a = options(stateDir(), `restore ${commit}`, { deployOnly: true });
    await expect(receive(host, a.options)).rejects.toThrow(/deploy and do nothing else/);
    const b = options(stateDir(), `restore ${commit}`);
    await expect(receive(host, b.options)).rejects.toBeInstanceOf(Locked);
  });
});

describe('a rollback', () => {
  /** A server whose `current` is `b…` and whose previous release was `a…`, with the files each was deployed from. */
  async function deployed(
    options_: { previousCore?: string; currentCore?: string; keep?: boolean } = {},
  ) {
    const dir = stateDir();
    const previous = await makeSource({
      suite: { core: { version: options_.previousCore ?? '0.71.0' } },
    });
    sources.push(previous);
    if (options_.keep !== false) {
      const release = path.join(dir, 'releases', 'a'.repeat(40));
      mkdirSync(path.join(release, 'overrides'), { recursive: true });
      for (const name of ['suite.yml', 'suite.lock'])
        writeFileSync(path.join(release, name), readFileSync(path.join(previous.dir, name)));
      writeFileSync(path.join(release, 'overrides', 'note.txt'), 'kept');
    }
    writeFileSync(
      path.join(dir, 'state.json'),
      JSON.stringify({
        schema: 1,
        commit: 'b'.repeat(40),
        previous: 'a'.repeat(40),
        core: { version: options_.currentCore ?? '0.71.0', healthy: true },
        apps: {},
      }),
    );
    return dir;
  }
  const idle = (args: string[]) =>
    args[0] === 'inspect' ? { stdout: 'false\n' } : args[0] === 'wait' ? { stdout: '0\n' } : {};

  it('applies the previous release’s files again, from a copy of them, as the commit it was', async () => {
    const dir = await deployed();
    const { host, calls } = receiver(idle);
    const { options: o, out } = options(dir, 'rollback');
    expect(await receive(host, o)).toBe(0);
    const run = calls.find((c) => c[0] === 'run') as string[];
    expect(run.slice(-4)).toEqual([
      '--from',
      path.join(dir, 'incoming', 'a'.repeat(40)),
      '--commit',
      'a'.repeat(40),
    ]);
    expect(
      readFileSync(path.join(dir, 'incoming', 'a'.repeat(40), 'overrides', 'note.txt'), 'utf8'),
    ).toBe('kept');
    expect(out.join('')).toContain('Going back to aaaaaaaaaaaa');
  });

  it('refuses when core would go backward, pointing to sv restore, and starts nothing', async () => {
    const dir = await deployed({ previousCore: '0.70.0', currentCore: '0.71.0' });
    const { host, calls } = receiver(idle);
    const failure = await receive(host, options(dir, 'rollback').options).catch((e: unknown) => e);
    expect(failure).toBeInstanceOf(Refused);
    expect((failure as Refused).message).toContain('only go forward');
    expect((failure as Refused).hint).toContain('sv restore');
    expect(calls.some((c) => c[0] === 'run')).toBe(false);
  });

  it('refuses when there is nothing earlier, or the earlier release has been cleared away', async () => {
    const { host } = receiver(idle);
    const none = stateDir();
    writeFileSync(
      path.join(none, 'state.json'),
      JSON.stringify({ schema: 1, commit: 'b'.repeat(40), core: { version: '0.71.0' }, apps: {} }),
    );
    await expect(receive(host, options(none, 'rollback').options)).rejects.toThrow(
      /no earlier release/,
    );
    const gone = await deployed({ keep: false });
    await expect(receive(host, options(gone, 'rollback').options)).rejects.toThrow(
      /no longer on the server/,
    );
  });
});

describe('a backup', () => {
  it('is taken to the operator’s keys alone, sent as it is, and not kept on the server', async () => {
    const made = await makeSource();
    sources.push(made);
    const dir = stateDir();
    const release = path.join(dir, 'releases', commit);
    mkdirSync(release, { recursive: true });
    writeFileSync(path.join(release, 'suite.yml'), readFileSync(path.join(made.dir, 'suite.yml')));
    symlinkSync(release, path.join(dir, 'current'));
    let sentFile = '';
    let head = '';
    const { host } = receiver((args) => (args[0] === 'inspect' ? { stdout: 'false\n' } : {}));
    const { options: o } = options(dir, 'backup', {
      sendFile: async (file) => {
        sentFile = file;
        head = readFileSync(file).subarray(0, 21).toString();
      },
    });
    expect(await receive(host, o)).toBe(0);
    expect(head).toBe('age-encryption.org/v1');
    expect(path.dirname(sentFile)).toBe(path.join(dir, 'backups'));
    expect(existsSync(sentFile)).toBe(false);
  });

  it('is refused before anything is deployed, and when the connection cannot carry it', async () => {
    const { host } = receiver();
    await expect(
      receive(host, options(stateDir(), 'backup', { sendFile: async () => undefined }).options),
    ).rejects.toThrow(/nothing to back up/);
    await expect(receive(host, options(stateDir(), 'backup').options)).rejects.toThrow(
      /cannot carry/,
    );
  });
});

describe('seeding, which core decides', () => {
  const ask = (line: string, handle: Parameters<typeof receiver>[0]) => {
    const { host, calls } = receiver(handle);
    const { options: o, out } = options(stateDir(), line);
    return { run: () => receive(host, o), calls, out };
  };

  it('runs sovereign-admin seed in core’s container and hands on what it printed, with --json when asked', async () => {
    const plain = ask('seed', () => ({
      stdout: 'owner@sovereign.local\tplatform:owner\tpassword: x',
    }));
    expect(await plain.run()).toBe(0);
    expect(plain.calls).toEqual([['exec', 'sv-core', 'sovereign-admin', 'seed']]);
    expect(plain.out.join('')).toBe('owner@sovereign.local\tplatform:owner\tpassword: x\n');
    const json = ask('seed --json', () => ({ stdout: '{"ok":true}\n' }));
    await json.run();
    expect(json.calls).toEqual([['exec', 'sv-core', 'sovereign-admin', 'seed', '--json']]);
    expect(json.out.join('')).toBe('{"ok":true}\n');
  });

  it('refuses, in core’s words, when core refuses (exit 3), and leaves it at that', async () => {
    const refused = ask('seed', () => ({
      code: 3,
      stderr:
        'sovereign-admin: This instance has 1 account that no seed made, so it is not seeded.\n',
    }));
    await expect(refused.run()).rejects.toThrow(Refused);
    await expect(refused.run()).rejects.toThrow('This instance has 1 account that no seed made');
    expect(refused.out).toEqual([]);
  });

  it('says core is not running when it is not', async () => {
    const down = ask('seed', () => ({
      code: 1,
      stderr: 'Error response from daemon: No such container: sv-core',
    }));
    await expect(down.run()).rejects.toThrow('Core is not running');
  });

  it('says an older core has no seed, and what moves it on', async () => {
    const older = ask('seed', () => ({
      code: 2,
      stderr:
        'sovereign-admin: the groups are apps and instance\nUsage:\n  sovereign-admin apps ...',
    }));
    await expect(older.run()).rejects.toThrow('came before the seed did');
  });

  it('fails, not refuses, when it stops partway, and says it can be run again', async () => {
    const partway = ask('seed', () => ({
      code: 1,
      stderr: 'sovereign-admin: redirect: must be https\n',
    }));
    await expect(partway.run()).rejects.toThrow(Failed);
    await expect(partway.run()).rejects.toThrow('redirect: must be https');
  });
});

describe('the connections the server reports', () => {
  const REPORT = {
    max: 100,
    reserved: 3,
    total: 4,
    roles: [
      { role: 'app_notes', used: 2, limit: 12 },
      { role: 'core', used: 1, limit: 12 },
    ],
  };
  const answering = (psql: { code?: number; stdout?: string }) =>
    receiver((args) =>
      args.includes('psql')
        ? psql
        : args[0] === 'inspect'
          ? { stdout: 'false\n' }
          : args[0] === 'ps'
            ? { stdout: '' }
            : {},
    );

  it.each(['status', 'doctor'])('is in the answer to %s', async (line) => {
    const { host, calls } = answering({ stdout: JSON.stringify(REPORT) });
    const { options: o, out } = options(stateDir(), line);
    expect(await receive(host, o)).toBe(0);
    expect(JSON.parse(out.join('')).connections).toEqual(REPORT);
    // Asked of the database container as the administrator, with no password in an argument.
    const asked = calls.find((c) => c.includes('psql')) as string[];
    expect(asked.slice(0, 7)).toEqual([
      'exec',
      '-i',
      'sv-database',
      'psql',
      '-U',
      'sovereign',
      '-d',
    ]);
    expect(asked.join(' ')).not.toMatch(/password|PGPASSWORD/i);
  });

  it.each(['status', 'doctor'])(
    'is null in the answer to %s when the database server cannot be asked, and the answer is still made',
    async (line) => {
      const down = answering({ code: 1 });
      const a = options(stateDir(), line);
      expect(await receive(down.host, a.options)).toBe(0);
      expect(JSON.parse(a.out.join('')).connections).toBeNull();
      const odd = answering({ stdout: 'not json' });
      const b = options(stateDir(), line);
      expect(await receive(odd.host, b.options)).toBe(0);
      expect(JSON.parse(b.out.join('')).connections).toBeNull();
    },
  );
});
