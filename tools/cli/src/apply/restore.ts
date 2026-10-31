import { chmod, copyFile, mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { Failed, Refused } from '../errors.js';
import { docker } from './docker.js';
import type { Host } from './host.js';
import { CONTAINER, DATABASE_ADMIN } from './names.js';

/** What a backup holds once it is unpacked (operator-cli §10.2). */
export const BACKUP = {
  databases: 'databases.sql',
  secrets: 'secrets',
  volumes: 'volumes',
} as const;
const VOLUME_FILE = /^(sovereign-app-[a-z0-9-]+)_(data-[0-9]+)\.tar$/;

const running = async (host: Host, name: string) =>
  (await host.docker(['inspect', '--format', '{{.State.Running}}', name])).stdout.trim() === 'true';

/**
 * The deletions core remembers, kept before a restore stops it, so that people deleted since the backup stay deleted (core-app §4.5).
 * Returns the file, or nothing when core cannot be reached: a server that is gone, restoring onto a new one.
 */
export async function saveDeletions(host: Host, stateDir: string): Promise<string | undefined> {
  if (!(await running(host, CONTAINER.core))) return undefined;
  const done = await host.docker([
    'exec',
    CONTAINER.core,
    'sovereign-admin',
    'instance',
    'deletions',
    'export',
  ]);
  if (done.code !== 0) return undefined;
  const file = path.join(stateDir, 'deletions.json');
  await writeFile(file, done.stdout, { mode: 0o600 });
  return file;
}

/** Stops core and the hosted apps. The database server is left running: the backup is loaded into it. */
export async function stopRunning(host: Host): Promise<void> {
  const listed = await host.docker(['ps', '--filter', 'name=^sv-', '--format', '{{.Names}}']);
  const names = listed.stdout
    .split('\n')
    .map((line) => line.trim())
    .filter((name) => name === CONTAINER.core || name.startsWith('sv-app-'));
  if (names.length > 0) await docker(host, 'Stopping core and the apps', ['stop', ...names]);
}

/** Puts the backup's generated secrets in place: the passwords in the dump are the ones these files hold. */
export async function restoreSecrets(from: string, to: string): Promise<number> {
  const source = path.join(from, BACKUP.secrets);
  if (!existsSync(source)) return 0;
  await mkdir(to, { recursive: true, mode: 0o700 });
  await chmod(to, 0o700);
  let count = 0;
  for (const name of await readdir(source)) {
    const target = path.join(to, name);
    const temporary = `${target}.restoring`;
    await copyFile(path.join(source, name), temporary);
    await chmod(temporary, 0o444);
    await rm(target, { force: true });
    await (await import('node:fs/promises')).rename(temporary, target);
    count += 1;
  }
  return count;
}

/**
 * Replaces what the database server holds with the dump. What is there is dropped first, so the dump meets an empty server, and the only
 * errors it may report are about the administrator, whose role it cannot drop or make again while connected as it.
 */
export async function loadDatabases(host: Host, dump: string): Promise<void> {
  const psql = (sql: string) =>
    docker(
      host,
      'Clearing the database server',
      [
        'exec',
        '-i',
        CONTAINER.database,
        'psql',
        '-U',
        DATABASE_ADMIN,
        '-d',
        'postgres',
        '-v',
        'ON_ERROR_STOP=1',
        '-q',
        '-t',
        '-A',
      ],
      { input: sql },
    );
  const databases = (
    await psql("SELECT datname FROM pg_database WHERE NOT datistemplate AND datname <> 'postgres';")
  ).stdout
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  for (const name of databases)
    await psql(`DROP DATABASE IF EXISTS "${name.replace(/"/g, '""')}" WITH (FORCE);`);
  const roles = (
    await psql(
      `SELECT rolname FROM pg_roles WHERE rolname NOT LIKE 'pg\\_%' AND rolname <> '${DATABASE_ADMIN}';`,
    )
  ).stdout
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  for (const name of roles) await psql(`DROP ROLE IF EXISTS "${name.replace(/"/g, '""')}";`);

  const loaded = await host.docker(
    [
      'exec',
      '-i',
      CONTAINER.database,
      'psql',
      '-U',
      DATABASE_ADMIN,
      '-d',
      'postgres',
      '-q',
      '-v',
      'ON_ERROR_STOP=0',
    ],
    { inputFrom: dump },
  );
  if (loaded.code !== 0) {
    throw new Failed(
      `Loading the databases failed: ${loaded.stderr.trim().split('\n').slice(-3).join(' ')}`,
    );
  }
  // The administrator is who the dump is loaded as, so the statements that drop and make its role fail, and that is all that may.
  const expected = new RegExp(
    `(current|session) user cannot be dropped|role "${DATABASE_ADMIN}" already exists`,
  );
  const unexpected = loaded.stderr
    .split('\n')
    .filter((line) => /ERROR:/.test(line) && !expected.test(line));
  if (unexpected.length > 0) {
    throw new Failed(
      `Loading the databases reported: ${unexpected.slice(0, 3).join(' | ')}`,
      'The backup may be damaged or from another version of the database server. Nothing else has been started.',
    );
  }
}

/** Puts each app's data back into a volume Compose will adopt, emptied first. Needs a container with `tar`: the toolkit’s image. */
export async function restoreVolumes(
  host: Host,
  from: string,
  image: string | undefined,
): Promise<number> {
  const folder = path.join(from, BACKUP.volumes);
  if (!existsSync(folder)) return 0;
  const files = (await readdir(folder)).filter((name) => VOLUME_FILE.test(name));
  if (files.length === 0) return 0;
  if (!image) {
    throw new Refused(
      'The backup holds app data, and there is no toolkit image to put it back with.',
      'sv restore gives one.',
    );
  }
  for (const file of files) {
    const [, project, volume] = VOLUME_FILE.exec(file) as RegExpExecArray;
    const name = `${project}_${volume}`;
    if ((await host.docker(['volume', 'inspect', name])).code !== 0) {
      await docker(host, `Making the volume ${name}`, [
        'volume',
        'create',
        '--label',
        `com.docker.compose.project=${project}`,
        '--label',
        `com.docker.compose.volume=${volume}`,
        name,
      ]);
    }
    await docker(host, `Restoring ${name}`, [
      'run',
      '--rm',
      '--entrypoint',
      'sh',
      '--volume',
      `${name}:/target`,
      '--volume',
      `${folder}:/source:ro`,
      image,
      '-c',
      'find /target -mindepth 1 -delete && tar -C /target -xf "/source/$0"',
      file,
    ]);
  }
  return files.length;
}

/**
 * Before core is started for people (core-app §4.4): records the restore, which ends the sessions and tokens the backup brought back,
 * and then carries across the deletions made since it was taken. Core is not running, so this runs in a container of its own.
 */
export async function markRestored(
  host: Host,
  coreCompose: string,
  deletions: string | undefined,
): Promise<void> {
  const run = (args: string[], inputFrom?: string) =>
    docker(
      host,
      'Recording the restore',
      [
        'compose',
        '--project-name',
        'sovereign-core',
        '-f',
        coreCompose,
        'run',
        '--rm',
        '--no-deps',
        '-T',
        'core',
        'sovereign-admin',
        ...args,
      ],
      inputFrom ? { inputFrom } : undefined,
    );
  await run(['instance', 'restored']);
  if (deletions) {
    await run(['instance', 'deletions', 'apply'], deletions);
    await rm(deletions, { force: true });
  }
}
