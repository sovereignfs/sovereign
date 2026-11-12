import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { Failed } from '../errors.js';
import { FakeDocker, fakeHost } from '../testing/fake-host.js';
import { makeSource, type Source } from '../testing/source.js';
import { apply, type ApplyOptions } from './apply.js';

const cleanup: string[] = [];
afterEach(() => {
  for (const dir of cleanup.splice(0)) rmSync(dir, { recursive: true, force: true });
});

/** A backup as it is unpacked on the server: the dump, the generated secrets and an app's data. */
function unpacked(
  extra: { volumes?: string[]; secrets?: Record<string, string>; files?: string[] } = {},
) {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'sv-backup-'));
  cleanup.push(dir);
  writeFileSync(path.join(dir, 'databases.sql'), 'CREATE ROLE core;\n');
  mkdirSync(path.join(dir, 'secrets'));
  for (const [name, value] of Object.entries({
    'postgres-admin-password': 'old-admin',
    'role-core-password': 'old-core',
    ...extra.secrets,
  }))
    writeFileSync(path.join(dir, 'secrets', name), value);
  if (extra.files) {
    mkdirSync(path.join(dir, 'files'));
    for (const name of extra.files) writeFileSync(path.join(dir, 'files', `${name}.tar`), 'tar');
  }
  if (extra.volumes) {
    mkdirSync(path.join(dir, 'volumes'));
    for (const name of extra.volumes) writeFileSync(path.join(dir, 'volumes', name), 'tar');
  }
  return dir;
}
const options = (
  made: Source,
  restoreFrom: string,
  extra: Partial<ApplyOptions> = {},
): ApplyOptions => ({
  from: made.dir,
  commit: 'a'.repeat(40),
  stateDir: made.stateDir,
  publishPorts: true,
  skipDns: true,
  restore: false,
  restoreFrom,
  toolkitImage: 'sv-cli:test',
  ...extra,
});
const source = async () => {
  const made = await makeSource();
  cleanup.push(path.dirname(made.dir));
  return made;
};
/** Where in the calls each needle first appears, or -1. */
const order = (docker: FakeDocker, ...needles: string[]): number[] =>
  needles.map((needle) => docker.calls.findIndex((c) => c.args.join(' ').includes(needle)));

describe('a restore on a new machine', () => {
  it('puts the backup’s secrets in first, loads the databases into the new server, and records the restore before core starts', async () => {
    const made = await source();
    const { host, docker, logs } = fakeHost();
    const backup = unpacked({ volumes: ['sovereign-app-notes_data-0.tar'] });
    const result = await apply(host, options(made, backup));
    expect(result.changed).toBe(true);
    // The server was made with the backup’s passwords, not new ones.
    expect(
      readFileSync(path.join(made.stateDir, 'secrets', 'postgres-admin-password'), 'utf8'),
    ).toBe('old-admin');
    expect(readFileSync(path.join(made.stateDir, 'secrets', 'role-core-password'), 'utf8')).toBe(
      'old-core',
    );
    const [databaseUp = -1, load = -1, volume = -1, restored = -1, coreUp = -1] = order(
      docker,
      'sovereign-database',
      'ON_ERROR_STOP=0',
      'volume create',
      'instance restored',
      'sovereign-core',
    );
    expect(databaseUp).toBeLessThan(load);
    expect(load).toBeLessThan(restored);
    expect(volume).toBeGreaterThan(-1);
    expect(restored).toBeLessThan(
      docker.calls.findIndex((c) => c.args.includes('sovereign-core') && c.args.includes('up')),
    );
    expect(coreUp).toBeGreaterThan(-1);
    expect(docker.calls[load]?.inputFrom).toBe(path.join(backup, 'databases.sql'));
    expect(docker.composeRuns).toEqual([
      expect.arrayContaining([
        '--rm',
        '--no-deps',
        'core',
        'sovereign-admin',
        'instance',
        'restored',
      ]),
    ]);
    expect(logs.join('\n')).toContain('people deleted since the backup was taken will reappear');
    expect(logs.join('\n')).toContain('Recorded the restore');
  });

  it('puts an app’s data in a volume compose will adopt, with the toolkit image, and refuses to when there is none', async () => {
    const made = await source();
    const { host, docker } = fakeHost();
    await apply(host, options(made, unpacked({ volumes: ['sovereign-app-notes_data-0.tar'] })));
    const create = docker.calls.find((c) => c.args[0] === 'volume' && c.args[1] === 'create');
    expect(create?.args).toContain('com.docker.compose.project=sovereign-app-notes');
    expect(create?.args).toContain('com.docker.compose.volume=data-0');
    expect(create?.args.at(-1)).toBe('sovereign-app-notes_data-0');
    const run = docker.calls.find((c) => c.args[0] === 'run' && c.args.includes('sv-cli:test'));
    expect(run?.args).toContain('sovereign-app-notes_data-0:/target');
    const second = await source();
    const failure = await apply(
      fakeHost().host,
      options(second, unpacked({ volumes: ['sovereign-app-notes_data-0.tar'] }), {
        toolkitImage: undefined as never,
      }),
    ).catch((e: unknown) => e);
    expect((failure as Error).message).toContain('no toolkit image');
  });
});

describe('a restore on the server that was running', () => {
  async function running() {
    const made = await source();
    const docker = new FakeDocker();
    const { host, logs } = fakeHost({ docker });
    await apply(host, {
      ...options(made, '' as never),
      restoreFrom: undefined,
      toolkitImage: undefined,
    });
    return { made, docker, host, logs };
  }

  it('backs up what is there, keeps the deletions made since, stops core, and carries them across afterwards', async () => {
    const { made, docker, host, logs } = await running();
    docker.deletionsExport = '{"deleted":["sub-1"]}';
    const result = await apply(host, options(made, unpacked(), { commit: 'b'.repeat(40) }));
    expect(result.changed).toBe(true);
    expect(
      readdirSync(path.join(made.stateDir, 'backups')).some((f) =>
        f.endsWith('-before-restore.tar.age'),
      ),
    ).toBe(true);
    const [exported = -1, stopped = -1, loaded = -1, restored = -1, applied = -1] = order(
      docker,
      'deletions export',
      'stop sv-core',
      'ON_ERROR_STOP=0',
      'instance restored',
      'instance deletions apply',
    );
    expect(exported).toBeLessThan(stopped);
    expect(stopped).toBeLessThan(loaded);
    expect(loaded).toBeLessThan(restored);
    expect(restored).toBeLessThan(applied);
    expect(docker.calls[applied]?.inputFrom).toBe(path.join(made.stateDir, 'deletions.json'));
    // The file holds only the subs, and is gone once applied.
    expect(() => readFileSync(path.join(made.stateDir, 'deletions.json'))).toThrow();
    expect(logs.join('\n')).not.toContain('will reappear');
  });

  it('may take core’s version backward, which a deployment may not', async () => {
    const { made, host } = await running();
    const older = await makeSource({ suite: { core: { version: '0.70.0' } } });
    cleanup.push(path.dirname(older.dir));
    const withoutRestore = await apply(host, {
      ...options(older, '' as never),
      restoreFrom: undefined,
      stateDir: made.stateDir,
      commit: 'c'.repeat(40),
    }).catch((e: unknown) => e);
    expect((withoutRestore as Error).message).toContain('sv restore');
    const done = await apply(
      host,
      options(older, unpacked(), { stateDir: made.stateDir, commit: 'd'.repeat(40) }),
    );
    expect(done.changed).toBe(true);
  });

  it('stops with what is wrong when the dump meets something it should not, before anything is started', async () => {
    const made = await source();
    const docker = new FakeDocker();
    docker.failOn = undefined;
    const { host } = fakeHost({ docker });
    const original = docker.run.bind(docker);
    docker.run = async (args, callOptions) =>
      args.join(' ').includes('ON_ERROR_STOP=0')
        ? {
            code: 0,
            stdout: '',
            stderr: 'psql:databases.sql:3: ERROR:  syntax error at or near "BOGUS"',
          }
        : original(args, callOptions);
    const failure = await apply(host, options(made, unpacked())).catch((e: unknown) => e);
    expect(failure).toBeInstanceOf(Failed);
    expect((failure as Failed).message).toContain('syntax error');
    expect(docker.containers.has('sv-core')).toBe(false);
    expect(docker.composeRuns).toEqual([]);
  });

  it('lets the dump complain about the administrator’s role, which it cannot drop while connected as it', async () => {
    const made = await source();
    const docker = new FakeDocker();
    const { host } = fakeHost({ docker });
    const original = docker.run.bind(docker);
    docker.run = async (args, callOptions) =>
      args.join(' ').includes('ON_ERROR_STOP=0')
        ? {
            code: 0,
            stdout: '',
            stderr:
              'psql:databases.sql:5: ERROR:  current user cannot be dropped\nERROR:  role "sovereign" already exists',
          }
        : original(args, callOptions);
    const done = await apply(host, options(made, unpacked())).catch((e: unknown) => e);
    expect(done).not.toBeInstanceOf(Error);
  });
});

/** A backup in the form `backup.json` came with: a dump for each database, and the roles only for the whole instance. */
function unpackedByDatabase(input: {
  databases: string[];
  globals?: boolean;
  secrets: Record<string, string>;
}) {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'sv-backup-'));
  cleanup.push(dir);
  mkdirSync(path.join(dir, 'databases'));
  if (input.globals)
    writeFileSync(path.join(dir, 'databases', 'globals.sql'), 'CREATE ROLE core;\n');
  for (const name of input.databases)
    writeFileSync(path.join(dir, 'databases', `${name}.sql`), `-- dump of ${name}\n`);
  mkdirSync(path.join(dir, 'secrets'));
  for (const [name, value] of Object.entries(input.secrets))
    writeFileSync(path.join(dir, 'secrets', name), value);
  return dir;
}

describe('a restore by scope', () => {
  async function running() {
    const made = await source();
    const docker = new FakeDocker();
    const { host, logs } = fakeHost({ docker });
    await apply(host, { ...options(made, '' as never), restoreFrom: undefined });
    return { made, docker, host, logs };
  }
  const secret = (made: Source, name: string) =>
    readFileSync(path.join(made.stateDir, 'secrets', name), 'utf8');

  it('of the whole instance loads the roles, then each database on its own, where no error is let through', async () => {
    const { made, docker, host } = await running();
    const backup = unpackedByDatabase({
      databases: ['app_notes', 'core'],
      globals: true,
      secrets: { 'role-core-password': 'old-core' },
    });
    await apply(host, options(made, backup, { commit: 'b'.repeat(40) }));
    const loads = docker.calls.filter((c) => c.inputFrom?.includes(backup));
    expect(loads.map((c) => path.basename(c.inputFrom as string))).toEqual([
      'globals.sql',
      'app_notes.sql',
      'core.sql',
    ]);
    expect(loads[0]?.args).toContain('ON_ERROR_STOP=0');
    expect(loads[1]?.args).toContain('ON_ERROR_STOP=1');
  });

  it('of core replaces core’s database and secrets, stops no app, records the restore, and leaves the server’s own secrets', async () => {
    const { made, docker, host } = await running();
    const admin = secret(made, 'postgres-admin-password');
    docker.calls = [];
    const backup = unpackedByDatabase({
      databases: ['core'],
      secrets: { 'role-core-password': 'old-core', SV_AUTH_SECRET: 'old-auth' },
    });
    await apply(
      host,
      options(made, backup, {
        commit: 'b'.repeat(40),
        restoreScope: { all: false, core: true, apps: [] },
      }),
    );
    expect(secret(made, 'role-core-password')).toBe('old-core');
    expect(secret(made, 'SV_AUTH_SECRET')).toBe('old-auth');
    expect(secret(made, 'postgres-admin-password')).toBe(admin);
    expect(
      docker.psql.some((sql) => sql.includes('DROP DATABASE IF EXISTS "core" WITH (FORCE)')),
    ).toBe(true);
    expect(docker.psql.some((sql) => sql.includes('DROP ROLE'))).toBe(false);
    const [exported = -1, stopped = -1, loaded = -1, restored = -1] = order(
      docker,
      'deletions export',
      'stop sv-core',
      'ON_ERROR_STOP=1 ',
      'instance restored',
    );
    expect(exported).toBeGreaterThan(-1);
    expect(exported).toBeLessThan(stopped);
    expect(restored).toBeGreaterThan(loaded);
    expect(readdirSync(path.join(made.stateDir, 'backups'))).toEqual([
      expect.stringMatching(/-before-restore-core\.tar\.age$/),
    ]);
  });

  it('of an app touches neither core nor its client secret, and makes its role on a server that has none', async () => {
    const { made, docker, host } = await running();
    writeFileSync(path.join(made.stateDir, 'secrets', 'app-notes-client-secret'), 'current');
    docker.calls = [];
    docker.composeRuns = [];
    const backup = unpackedByDatabase({
      databases: ['app_notes'],
      secrets: {
        'role-app-notes-password': 'notes-pw',
        'app-notes-client-secret': 'stale',
        'app-notes-SIGNING_KEY': 'old-key',
        SV_AUTH_SECRET: 'not-for-an-app',
      },
    });
    await apply(
      host,
      options(made, backup, {
        commit: 'b'.repeat(40),
        restoreScope: { all: false, core: false, apps: ['notes'] },
      }),
    );
    expect(secret(made, 'app-notes-client-secret')).toBe('current');
    expect(secret(made, 'app-notes-SIGNING_KEY')).toBe('old-key');
    expect(secret(made, 'SV_AUTH_SECRET')).not.toBe('not-for-an-app');
    const joined = docker.calls.map((c) => c.args.join(' '));
    expect(joined.some((c) => c.includes('stop sv-core'))).toBe(false);
    expect(joined.some((c) => c.includes('deletions export'))).toBe(false);
    expect(docker.composeRuns.flat().join(' ')).not.toContain('instance restored');
    expect(
      docker.psql.some(
        (sql) =>
          sql.includes('DROP DATABASE IF EXISTS "app_notes" WITH (FORCE)') &&
          sql.includes(`CREATE ROLE "app_notes" LOGIN PASSWORD 'notes-pw'`),
      ),
    ).toBe(true);
    // Nothing of notes ran here before, so there was nothing to keep.
    expect(readdirSync(path.join(made.stateDir, 'backups'))).toEqual([]);
  });
});

describe('a restore that carries people’s files', () => {
  async function running() {
    const made = await source();
    const docker = new FakeDocker();
    const { host } = fakeHost({ docker });
    await apply(host, { ...options(made, '' as never), restoreFrom: undefined });
    return { made, docker, host };
  }
  const tars = (docker: FakeDocker) =>
    docker.calls.filter((c) => c.args.join(' ').includes('tar -C'));

  it('puts each folder back from its tar, before core starts, and empties what was there', async () => {
    const { made, docker, host } = await running();
    docker.calls = [];
    await apply(
      host,
      options(made, unpacked({ files: ['core', 'notes'] }), { commit: 'b'.repeat(40) }),
    );
    expect(docker.restoredFiles).toEqual(['core', 'notes']);
    const [restored = -1, coreUp = -1] = order(docker, 'tar -C', 'sovereign-core');
    expect(restored).toBeGreaterThan(-1);
    expect(restored).toBeLessThan(coreUp);
    const script = tars(docker)[0]?.args.join(' ') ?? '';
    expect(script).toContain('find "$d" -mindepth 1 -delete');
    expect(script).toContain('-name .usage.json -delete');
    expect(script).toContain('--volume sovereign-data:/v');
    expect(script).toContain(':/src:ro');
  });

  it('hands every file of a restored folder to the user the app runs as, and only the restored ones', async () => {
    const { made, docker, host } = await running();
    docker.calls = [];
    await apply(host, options(made, unpacked({ files: ['core'] }), { commit: 'b'.repeat(40) }));
    const owned = docker.calls
      .map((c) => c.args.join(' '))
      .filter((c) => c.includes('mkdir -p "/v/$1"'));
    expect(owned.some((c) => c.includes('chown -R'))).toBe(true);
    // Without a restore the same step hands over the folder alone, which is cheap when it holds a great deal.
    docker.calls = [];
    await apply(host, {
      ...options(made, '' as never),
      restoreFrom: undefined,
      commit: 'c'.repeat(40),
    });
    expect(docker.calls.map((c) => c.args.join(' ')).some((c) => c.includes('chown -R'))).toBe(
      false,
    );
  });

  it('puts back only the folders of the scope: core’s with core, an app’s with that app', async () => {
    const { made, docker, host } = await running();
    await apply(
      host,
      options(made, unpacked({ files: ['core', 'notes', 'tasks'] }), {
        commit: 'b'.repeat(40),
        restoreScope: { all: false, core: false, apps: ['notes'] },
      }),
    );
    expect(docker.restoredFiles).toEqual(['notes']);
  });

  it('puts back nothing of the kind when the backup holds no files, as a backup from before did', async () => {
    const { made, docker, host } = await running();
    await apply(host, options(made, unpacked(), { commit: 'b'.repeat(40) }));
    expect(docker.restoredFiles).toEqual([]);
  });

  it('makes core’s folder of files before the restore is recorded, which runs core mounting it, on a machine with none', async () => {
    const made = await source();
    const docker = new FakeDocker();
    const { host } = fakeHost({ docker });
    await apply(host, options(made, unpacked()));
    const [folder = -1, recorded = -1] = order(docker, 'mkdir -p "/v/$1"', 'instance restored');
    expect(folder).toBeGreaterThan(-1);
    expect(folder).toBeLessThan(recorded);
  });

  it('refuses, rather than skip them, when it has no image to put them back with', async () => {
    const { made, host } = await running();
    const failure = await apply(
      host,
      options(made, unpacked({ files: ['core'] }), {
        commit: 'b'.repeat(40),
        toolkitImage: undefined,
      }),
    ).catch((e: unknown) => e);
    expect((failure as Error).message).toContain('no toolkit image');
  });
});
