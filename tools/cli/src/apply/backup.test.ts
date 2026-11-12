import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Decrypter } from 'age-encryption';
import { afterEach, describe, expect, it } from 'vitest';
import { Failed, Refused } from '../errors.js';
import { fakeHost } from '../testing/fake-host.js';
import { makeSource, type Source } from '../testing/source.js';
import { takeBackup } from './backup.js';

const folders: string[] = [];
const sources: Source[] = [];
afterEach(() => {
  for (const dir of folders.splice(0)) rmSync(dir, { recursive: true, force: true });
  for (const source of sources.splice(0))
    rmSync(path.dirname(source.dir), { recursive: true, force: true });
});

/** A server with a database container, a state file and some secrets, as a deployment leaves it. */
async function server() {
  const made = await makeSource({ serverKey: true });
  sources.push(made);
  mkdirSync(path.join(made.stateDir, 'secrets'), { recursive: true });
  writeFileSync(path.join(made.stateDir, 'secrets', 'SV_AUTH_SECRET'), 'the-auth-secret');
  writeFileSync(path.join(made.stateDir, 'state.json'), '{"schema":1}\n');
  const { host, docker } = fakeHost();
  await docker.run([
    'compose',
    '--project-name',
    'sovereign-database',
    '-f',
    path.join(made.dir, 'suite.yml'),
    'up',
  ]);
  return { made, host, docker };
}

async function open(file: string, identity: string): Promise<string[]> {
  const decrypter = new Decrypter();
  decrypter.addIdentity(identity);
  const plain = await decrypter.decrypt(readFileSync(file));
  const dir = mkdtempSync(path.join(os.tmpdir(), 'sv-backup-open-'));
  folders.push(dir);
  writeFileSync(path.join(dir, 'backup.tar'), plain);
  expect(spawnSync('tar', ['-xf', path.join(dir, 'backup.tar'), '-C', dir]).status).toBe(0);
  return readdirSync(dir, { recursive: true })
    .map(String)
    .filter((f) => f !== 'backup.tar')
    .sort();
}

describe('a backup', () => {
  it('holds every database, the state and the generated secrets, and the operator can open it', async () => {
    const { made, host } = await server();
    const file = await takeBackup(host, {
      stateDir: made.stateDir,
      recipients: made.suite.secrets.recipients,
      reason: 'before-change',
    });
    expect(file).toMatch(/backups\/.*-before-change\.tar\.age$/);
    expect(statSync(file).mode & 0o777).toBe(0o600);
    const entries = await open(file, made.operator.identity);
    expect(entries).toEqual(
      expect.arrayContaining([
        'backup.json',
        'databases/globals.sql',
        'databases/core.sql',
        'state.json',
        'secrets/SV_AUTH_SECRET',
      ]),
    );
  });

  it('cannot be opened with the key the server holds, so a server that is lost or taken gives away no backup', async () => {
    const { made, host } = await server();
    const file = await takeBackup(host, {
      stateDir: made.stateDir,
      recipients: made.suite.secrets.recipients,
      reason: 'x',
    });
    await expect(open(file, made.server.identity)).rejects.toThrow();
    // Nor does it hold anything in the open.
    expect(readFileSync(file).includes(Buffer.from('the-auth-secret'))).toBe(false);
  });

  it('leaves no working copy of the secrets behind', async () => {
    const { made, host } = await server();
    await takeBackup(host, {
      stateDir: made.stateDir,
      recipients: made.suite.secrets.recipients,
      reason: 'x',
    });
    expect(
      readdirSync(path.join(made.stateDir, 'backups')).filter((name) => name.startsWith('.work-')),
    ).toEqual([]);
  });

  it('refuses when the only recipient is the server’s own, and writes nothing', async () => {
    const { made, host } = await server();
    const error = await takeBackup(host, {
      stateDir: made.stateDir,
      recipients: [made.server.recipient],
      reason: 'x',
    }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(Refused);
    expect(existsSync(path.join(made.stateDir, 'backups'))).toBe(false);
  });

  it('is not left half-written when the dump fails, or the working copy', async () => {
    const { made, host, docker } = await server();
    docker.failOn = { text: 'pg_dump ', message: 'the database is gone' };
    const error = await takeBackup(host, {
      stateDir: made.stateDir,
      recipients: made.suite.secrets.recipients,
      reason: 'x',
    }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(Failed);
    expect((error as Failed).message).toContain('Dumping the database core failed');
    expect(readdirSync(path.join(made.stateDir, 'backups'))).toEqual([]);
  });
});

/** The names in an archive, in the order tar wrote them. */
async function listed(file: string, identity: string): Promise<string[]> {
  const decrypter = new Decrypter();
  decrypter.addIdentity(identity);
  const plain = Buffer.from(await decrypter.decrypt(readFileSync(file)));
  const dir = mkdtempSync(path.join(os.tmpdir(), 'sv-backup-list-'));
  folders.push(dir);
  writeFileSync(path.join(dir, 'backup.tar'), plain);
  return spawnSync('tar', ['-tf', path.join(dir, 'backup.tar')], { encoding: 'utf8' })
    .stdout.split('\n')
    .filter(Boolean);
}

describe('a backup by scope', () => {
  async function withApps() {
    const found = await server();
    const { made, docker } = found;
    for (const [name, value] of Object.entries({
      'role-core-password': 'core-pw',
      'postgres-admin-password': 'admin-pw',
      'role-app-notes-password': 'notes-pw',
      'app-notes-client-secret': 'notes-client',
      'app-notes-SIGNING_KEY': 'notes-key',
      'role-app-tasks-password': 'tasks-pw',
    }))
      writeFileSync(path.join(made.stateDir, 'secrets', name), value);
    writeFileSync(
      path.join(made.stateDir, 'state.json'),
      JSON.stringify({
        schema: 1,
        core: { version: '0.90.0' },
        apps: {
          notes: { kind: 'hosted', database: 'app_notes', role: 'app_notes', version: '1.2.0' },
          tasks: { kind: 'hosted', database: 'app_tasks', role: 'app_tasks', version: '2.0.0' },
          site: { kind: 'external' },
        },
      }),
    );
    docker.databases = ['app_notes', 'app_tasks', 'core'];
    return found;
  }

  it('starts with backup.json, which says what it holds and the versions it was taken at', async () => {
    const { made, host } = await withApps();
    const file = await takeBackup(host, {
      stateDir: made.stateDir,
      recipients: made.suite.secrets.recipients,
      reason: 'manual',
    });
    const names = await listed(file, made.operator.identity);
    expect(names[0]).toBe('backup.json');
    await open(file, made.operator.identity);
    const dir = folders.at(-1) as string;
    const manifest = JSON.parse(readFileSync(path.join(dir, 'backup.json'), 'utf8'));
    expect(manifest).toMatchObject({
      format: 1,
      scope: { all: true },
      core: '0.90.0',
      apps: { notes: '1.2.0', tasks: '2.0.0' },
    });
    expect(names).toEqual(
      expect.arrayContaining([
        'databases/globals.sql',
        'databases/app_notes.sql',
        'databases/app_tasks.sql',
        'databases/core.sql',
      ]),
    );
  });

  it('of core holds core’s database and secrets, and nothing of the apps or the server', async () => {
    const { made, host, docker } = await withApps();
    const file = await takeBackup(host, {
      stateDir: made.stateDir,
      recipients: made.suite.secrets.recipients,
      reason: 'manual',
      scope: { all: false, core: true, apps: [] },
    });
    expect(file).toMatch(/-manual-core\.tar\.age$/);
    const entries = await open(file, made.operator.identity);
    expect(entries).toContain('databases/core.sql');
    expect(entries).toContain('secrets/role-core-password');
    expect(entries).toContain('secrets/SV_AUTH_SECRET');
    expect(entries.filter((e) => /notes|tasks|globals|postgres-admin/.test(e))).toEqual([]);
    expect(docker.calls.some((c) => c.args.includes('pg_dumpall'))).toBe(false);
  });

  it('of one app holds its database, its secrets and its volumes alone', async () => {
    const { made, host, docker } = await withApps();
    docker.volumes['sovereign-app-notes'] = ['sovereign-app-notes_data-0'];
    docker.volumes['sovereign-app-tasks'] = ['sovereign-app-tasks_data-0'];
    const file = await takeBackup(host, {
      stateDir: made.stateDir,
      recipients: made.suite.secrets.recipients,
      reason: 'manual',
      image: 'sv-cli:test',
      scope: { all: false, core: false, apps: ['notes'] },
    });
    expect(file).toMatch(/-manual-app-notes\.tar\.age$/);
    const entries = await open(file, made.operator.identity);
    expect(entries).toEqual(
      expect.arrayContaining([
        'databases/app_notes.sql',
        'secrets/role-app-notes-password',
        'secrets/app-notes-client-secret',
        'secrets/app-notes-SIGNING_KEY',
      ]),
    );
    expect(entries.filter((e) => /core|tasks|SV_AUTH/.test(e))).toEqual([]);
    const copied = docker.calls.filter((c) => c.args.join(' ').includes(':/source:ro'));
    expect(copied.map((c) => c.args.join(' '))).toEqual([
      expect.stringContaining('sovereign-app-notes_data-0'),
    ]);
  });

  it('refuses an app the server does not run, or one that runs elsewhere, and writes nothing', async () => {
    const { made, host } = await withApps();
    for (const name of ['wiki', 'site']) {
      const error = await takeBackup(host, {
        stateDir: made.stateDir,
        recipients: made.suite.secrets.recipients,
        reason: 'manual',
        scope: { all: false, core: false, apps: [name] },
      }).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(Refused);
      expect((error as Refused).message).toContain(name);
    }
    expect(existsSync(path.join(made.stateDir, 'backups'))).toBe(false);
  });
});
