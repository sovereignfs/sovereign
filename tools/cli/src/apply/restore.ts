import { chmod, copyFile, mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { Failed, Refused } from '../errors.js';
import { docker, psql as runSql } from './docker.js';
import type { Host } from './host.js';
import { CONTAINER, CORE_DATABASE, DATABASE_ADMIN, DATA_VOLUME } from './names.js';
import { ensureDataVolume } from './files.js';
import {
  ALL,
  MANIFEST_FILE,
  databasesOf,
  filesInScope,
  readManifest,
  secretInScope,
  touchesCore,
  volumeInScope,
  type BackupScope,
} from './scope.js';

/** What a backup holds once it is unpacked (operator-cli §10.2). */
export const BACKUP = {
  /** One dump of every database, as a backup taken before `backup.json` held it; it can only be restored whole. */
  allDatabases: 'databases.sql',
  /** A folder of dumps: `globals.sql` (the roles, in a backup of the whole instance) and one `<database>.sql` each. */
  databases: 'databases',
  globals: 'globals.sql',
  secrets: 'secrets',
  volumes: 'volumes',
  /** `files/<name>.tar`: one tar of each folder of people's files (core and apps), RFC 0004 §6. */
  files: 'files',
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

/** Stops what a restore replaces: core and the hosted apps, or those the scope names. The database server is left running: the backup is loaded into it. */
export async function stopRunning(host: Host, scope: BackupScope = ALL): Promise<void> {
  const listed = await host.docker(['ps', '--filter', 'name=^sv-', '--format', '{{.Names}}']);
  const names = listed.stdout
    .split('\n')
    .map((line) => line.trim())
    .filter((name) =>
      name === CONTAINER.core
        ? touchesCore(scope)
        : name.startsWith('sv-app-') &&
          (scope.all || scope.apps.some((app) => name === CONTAINER.app(app))),
    );
  if (names.length > 0) await docker(host, 'Stopping what is restored', ['stop', ...names]);
}

/** Puts the backup's generated secrets in place: the passwords in the dump are the ones these files hold. */
export async function restoreSecrets(
  from: string,
  to: string,
  scope: BackupScope = ALL,
): Promise<number> {
  const source = path.join(from, BACKUP.secrets);
  if (!existsSync(source)) return 0;
  await mkdir(to, { recursive: true, mode: 0o700 });
  await chmod(to, 0o700);
  let count = 0;
  for (const name of await readdir(source)) {
    if (!secretInScope(scope, name, true)) continue;
    const target = path.join(to, name);
    const temporary = `${target}.restoring`;
    await copyFile(path.join(source, name), temporary);
    await chmod(temporary, 0o444);
    await rm(target, { force: true });
    await rename(temporary, target);
    count += 1;
  }
  return count;
}

/**
 * Replaces what the database server holds with the backup's. What is there is dropped first, so the dumps meet an empty server, and the
 * only errors the roles may report are about the administrator, whose role it cannot drop or make again while connected as it. Then
 * each database is loaded from its own dump, where no error is accepted. A backup from before each database had its own dump holds one
 * dump of them all, loaded as the roles are.
 */
export async function loadDatabases(host: Host, from: string): Promise<void> {
  const whole = path.join(from, BACKUP.allDatabases);
  const folder = path.join(from, BACKUP.databases);
  const dump = existsSync(whole) ? whole : path.join(folder, BACKUP.globals);
  if (!existsSync(dump)) throw new Failed('The backup holds no roles to restore.');
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
  if (dump === whole) return;
  for (const file of (await readdir(folder)).filter(isDatabaseDump).sort())
    await loadDump(host, path.join(folder, file));
}

const isDatabaseDump = (file: string) => file !== BACKUP.globals && /^[a-z0-9_]+\.sql$/.test(file);

/** Loads one database's dump, made with `--create`, which must go in without an error. */
async function loadDump(host: Host, file: string): Promise<void> {
  const name = path.basename(file, '.sql');
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
      'ON_ERROR_STOP=1',
    ],
    { inputFrom: file },
  );
  if (loaded.code !== 0) {
    throw new Failed(
      `Loading the database ${name} failed: ${loaded.stderr.trim().split('\n').slice(-3).join(' ')}`,
      'The backup may be damaged or from another version of the database server.',
    );
  }
}

/**
 * Replaces the databases of core or of the apps a scope names, and leaves every other one as it is. Each is dropped, its role is made
 * when the server has none (a new server) with the password the restored secrets hold, and its dump is loaded. A database the backup
 * does not hold is one the app never had.
 */
export async function loadScopedDatabases(
  host: Host,
  from: string,
  scope: { core: boolean; apps: readonly string[] },
  secretsDir: string,
): Promise<number> {
  let count = 0;
  for (const { database, role, passwordSecret } of databasesOf(scope)) {
    const dump = path.join(from, BACKUP.databases, `${database}.sql`);
    if (!existsSync(dump)) {
      if (database === CORE_DATABASE) throw new Failed('The backup holds no database for core.');
      continue;
    }
    const secret = path.join(secretsDir, passwordSecret);
    if (!existsSync(secret)) {
      throw new Failed(
        `There is no password for the role ${role}.`,
        'The backup holds none and the server has none: restore the whole instance instead.',
      );
    }
    const password = (await readFile(secret, 'utf8')).replace(/\r?\n$/, '').replace(/'/g, "''");
    await runSql(
      host,
      `Clearing the database ${database}`,
      `DROP DATABASE IF EXISTS "${database}" WITH (FORCE);
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '${role}') THEN
    CREATE ROLE "${role}" LOGIN PASSWORD '${password}';
  END IF;
END $$;
`,
    );
    await loadDump(host, dump);
    count += 1;
  }
  return count;
}

/** Puts each app's data back into a volume Compose will adopt, emptied first. Needs a container with `tar`: the toolkit’s image. */
export async function restoreVolumes(
  host: Host,
  from: string,
  image: string | undefined,
  scope: BackupScope = ALL,
): Promise<number> {
  const folder = path.join(from, BACKUP.volumes);
  if (!existsSync(folder)) return 0;
  const files = (await readdir(folder)).filter(
    (name) => VOLUME_FILE.test(name) && volumeInScope(scope, name.replace(/\.tar$/, '')),
  );
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

const FILES_TAR = /^([a-z0-9-]{1,63})\.tar$/;

/**
 * Puts back each folder of people's files the backup holds and the scope names (RFC 0004 §6): the folder is emptied and filled from its
 * tar, and every person's usage record is removed so the store counts again on first use. It is run as root in the toolkit's image,
 * which has `tar`. The owners are the ones of the machine the backup was taken on, so the app's own start hands them over (`ensureFilesFolder`
 * with `recursive`). Returns the names it put back.
 */
export async function restoreFiles(
  host: Host,
  from: string,
  image: string | undefined,
  scope: BackupScope = ALL,
): Promise<string[]> {
  const folder = path.join(from, BACKUP.files);
  if (!existsSync(folder)) return [];
  const names = filesInScope(
    scope,
    (await readdir(folder)).flatMap((file) => FILES_TAR.exec(file)?.[1] ?? []),
  );
  if (names.length === 0) return [];
  if (!image) {
    throw new Refused(
      'The backup holds people’s files, and there is no toolkit image to put them back with.',
      'sv restore gives one.',
    );
  }
  await ensureDataVolume(host);
  for (const name of names) {
    await docker(host, `Restoring ${name}’s files`, [
      'run',
      '--rm',
      '--user',
      '0',
      '--entrypoint',
      'sh',
      '--volume',
      `${DATA_VOLUME}:/v`,
      '--volume',
      `${folder}:/src:ro`,
      image,
      '-c',
      'set -e; d="/v/s3/$1"; mkdir -p "$d"; find "$d" -mindepth 1 -delete; tar -C "$d" -xf "/src/$1.tar"; find "$d" -mindepth 2 -maxdepth 2 -name .usage.json -delete; chmod 0700 "$d"',
      'sh',
      name,
    ]);
  }
  return names;
}

/** How long core remembers that an account was deleted (core-app §4.5): a backup older than this cannot be made whole. */
export const DELETIONS_REMEMBERED_MS = 90 * 24 * 60 * 60 * 1000;

/**
 * After apps alone are restored (core-app §4.5, "After a restore of one app"): core was not restored, so it still knows who was deleted
 * since their backup and the apps do not. Each restored app that signs people in through core is told again of every account deleted
 * after the backup was taken, so it deletes them again. Says when the backup is older than core remembers, since people deleted before
 * then will have come back and nothing can tell the app. Core is running, and sends the notices within the minute.
 */
export async function resendDeletionsToApps(
  host: Host,
  from: string,
  apps: readonly string[],
  say: (line: string) => void,
  now: number = Date.now(),
): Promise<void> {
  if (apps.length === 0) return;
  let takenAt: string | undefined;
  try {
    takenAt = readManifest(await readFile(path.join(from, MANIFEST_FILE), 'utf8')).takenAt;
  } catch {
    takenAt = undefined;
  }
  const since = takenAt === undefined ? Number.NaN : Date.parse(takenAt);
  if (!Number.isFinite(since)) {
    throw new Failed(
      'The backup does not say when it was taken, so the people deleted since cannot be told to the apps.',
      'Take a backup with sv backup, which does, and restore that.',
    );
  }
  if (now - since > DELETIONS_REMEMBERED_MS) {
    say(
      `This backup is more than 90 days old, and core remembers a deletion for 90 days: people deleted before ${new Date(now - DELETIONS_REMEMBERED_MS).toISOString().slice(0, 10)} may be back in what was restored, and nothing can tell the apps.`,
    );
  }
  for (const name of apps) {
    const done = await host.docker([
      'exec',
      CONTAINER.core,
      'sovereign-admin',
      'instance',
      'deletions',
      'resend',
      '--app',
      name,
      '--since',
      new Date(since).toISOString(),
    ]);
    if (done.code !== 0) {
      throw new Failed(
        `Telling ${name} about the people deleted since the backup failed: ${(done.stderr || done.stdout).trim().split('\n').slice(-2).join(' ')}`,
        'The restore is done, but they are back in that app. Run sv restore again; it is safe, and it replaces the app with the backup once more.',
      );
    }
    const counted = /"notices":(\d+)/.exec(done.stdout)?.[1];
    say(
      `${name} is told again of the people deleted since the backup${counted ? ` (${counted} notices)` : ''}.`,
    );
  }
}
