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
      expect.arrayContaining(['databases.sql', 'state.json', 'secrets', 'secrets/SV_AUTH_SECRET']),
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
    docker.failOn = { text: 'pg_dumpall', message: 'the database is gone' };
    const error = await takeBackup(host, {
      stateDir: made.stateDir,
      recipients: made.suite.secrets.recipients,
      reason: 'x',
    }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(Failed);
    expect((error as Failed).message).toContain('Dumping the databases failed');
    expect(readdirSync(path.join(made.stateDir, 'backups'))).toEqual([]);
  });
});
