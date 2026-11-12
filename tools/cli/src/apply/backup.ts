import { spawn } from 'node:child_process';
import { createWriteStream, existsSync } from 'node:fs';
import { cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { Encrypter, identityToRecipient } from 'age-encryption';
import { Failed, Refused } from '../errors.js';
import { docker, psql } from './docker.js';
import type { Host } from './host.js';
import { filesFolders } from './files.js';
import { CONTAINER, DATABASE_ADMIN, DATA_VOLUME, filesFolder } from './names.js';
import { BACKUP } from './restore.js';
import {
  ALL,
  MANIFEST_FILE,
  databasesOf,
  filesInScope,
  scopeLabel,
  secretInScope,
  volumeInScope,
  type BackupManifest,
  type BackupScope,
} from './scope.js';
import { layout, readState, type State } from './state.js';

/**
 * Takes a backup (operator-cli §10.2): the databases, the server’s state and its generated secrets, in one archive encrypted to the
 * operator’s key alone. The server’s own key is left out of the recipients, so that the server cannot read a backup it has made, and a
 * server that is lost, or taken over, gives away no backup. The archive is kept in `backups/`, which only root can open.
 *
 * Its first file is `backup.json`, which says what it holds. Each database is dumped on its own, beside the roles the server holds
 * (`databases/globals.sql`, for the whole instance only), so that core or one app can be put back out of any backup.
 *
 * Returns the path of the archive.
 */
export async function takeBackup(
  host: Host,
  input: {
    stateDir: string;
    recipients: readonly string[];
    reason: string;
    /** The toolkit’s image, which has `tar`, for copying an app’s data volumes out. Without it only the databases and secrets are kept. */
    image?: string;
    /** What to take; the whole instance when it is not given. */
    scope?: BackupScope;
    /** Apps whose files are kept in a store of their own, which the archive does not hold, and where each is (RFC 0004 §6). */
    elsewhere?: Record<string, string>;
  },
): Promise<string> {
  const scope = input.scope ?? ALL;
  const paths = layout(input.stateDir);
  const serverRecipient = existsSync(paths.ageKey)
    ? await identityToRecipient(
        (await readFile(paths.ageKey, 'utf8')).match(/AGE-SECRET-KEY-1\w+/)?.[0] ?? '',
      ).catch(() => undefined)
    : undefined;
  const operators = input.recipients.filter((recipient) => recipient !== serverRecipient);
  if (operators.length === 0) {
    throw new Refused(
      'There is no operator key to encrypt a backup to.',
      'suite.yml’s secrets.recipients holds only the server’s key. Add your own with sv setup, then deploy again.',
    );
  }
  const state = await readState(input.stateDir);
  const databases = await databasesToTake(host, scope, state);

  await mkdir(paths.backups, { recursive: true, mode: 0o700 });
  const work = await mkdtemp(path.join(paths.backups, '.work-'));
  const stamp = new Date(host.now()).toISOString().replace(/[:.]/g, '-');
  const file = path.join(
    paths.backups,
    `${stamp}-${input.reason}${scope.all ? '' : `-${scopeLabel(scope)}`}.tar.age`,
  );
  try {
    const folders = input.image ? filesInScope(scope, await filesFolders(host, input.image)) : [];
    const manifest: BackupManifest = {
      format: 2,
      scope,
      takenAt: new Date(host.now()).toISOString(),
      ...(state?.core?.version ? { core: state.core.version } : {}),
      files: folders,
      ...(input.elsewhere && Object.keys(input.elsewhere).length > 0
        ? { elsewhere: input.elsewhere }
        : {}),
      apps: Object.fromEntries(
        Object.entries(state?.apps ?? {}).flatMap(([name, app]) =>
          app.version && (scope.all || scope.apps.includes(name)) ? [[name, app.version]] : [],
        ),
      ),
    };
    await writeFile(path.join(work, MANIFEST_FILE), `${JSON.stringify(manifest, null, 2)}\n`, {
      mode: 0o600,
    });
    await mkdir(path.join(work, BACKUP.databases), { mode: 0o700 });
    if (scope.all) {
      // The roles, with their passwords, which a database’s own dump does not hold.
      await docker(
        host,
        'Dumping the roles',
        ['exec', CONTAINER.database, 'pg_dumpall', '-U', DATABASE_ADMIN, '--globals-only'],
        { stdoutTo: path.join(work, BACKUP.databases, BACKUP.globals) },
      );
    }
    for (const database of databases) {
      // `--create` makes the dump bring its database back on its own, owner and grants and all, as plain SQL that psql reads back.
      await docker(
        host,
        `Dumping the database ${database}`,
        ['exec', CONTAINER.database, 'pg_dump', '-U', DATABASE_ADMIN, '--create', '-d', database],
        { stdoutTo: path.join(work, BACKUP.databases, `${database}.sql`) },
      );
    }
    if (existsSync(paths.state)) await cp(paths.state, path.join(work, 'state.json'));
    if (input.image) await copyVolumes(host, input.image, work, scope);
    if (input.image) await copyFiles(host, input.image, work, folders);
    if (existsSync(paths.secrets)) {
      await mkdir(path.join(work, BACKUP.secrets), { mode: 0o700 });
      for (const name of await readdir(paths.secrets)) {
        if (secretInScope(scope, name))
          await cp(path.join(paths.secrets, name), path.join(work, BACKUP.secrets, name));
      }
    }

    const encrypter = new Encrypter();
    for (const recipient of operators) encrypter.addRecipient(recipient);
    // backup.json goes first, so that what an archive holds can be read without unpacking the rest.
    const entries = [
      MANIFEST_FILE,
      ...(await readdir(work)).filter((name) => name !== MANIFEST_FILE).sort(),
    ];
    // COPYFILE_DISABLE keeps a macOS tar from adding `._` files for extended attributes, which a backup does not hold; Linux ignores it.
    const tar = spawn('tar', ['-C', work, '-cf', '-', ...entries], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, COPYFILE_DISABLE: '1' },
    });
    let tarError = '';
    tar.stderr.on('data', (chunk: Buffer) => (tarError += chunk.toString('utf8')));
    const exited = new Promise<number>((resolve) => tar.on('close', (code) => resolve(code ?? 1)));
    const encrypted = await encrypter.encrypt(
      Readable.toWeb(tar.stdout) as ReadableStream<Uint8Array>,
    );
    await pipeline(Readable.fromWeb(encrypted as never), createWriteStream(file, { mode: 0o600 }));
    if ((await exited) !== 0) throw new Failed(`Archiving the backup failed: ${tarError.trim()}`);
  } catch (error) {
    await rm(file, { force: true });
    throw error;
  } finally {
    // The working copy holds the secrets in the open.
    await rm(work, { recursive: true, force: true });
  }
  return file;
}

/**
 * The databases a backup dumps: every one on the server for the whole instance, or those of core and the apps it names. An app the server
 * does not run is refused, and one that keeps nothing in a database has none to dump.
 */
async function databasesToTake(
  host: Host,
  scope: BackupScope,
  state: State | undefined,
): Promise<string[]> {
  if (scope.all) {
    const listed = await psql(
      host,
      'Listing the databases',
      "SELECT datname FROM pg_database WHERE NOT datistemplate AND datname <> 'postgres' ORDER BY datname;",
    );
    return listed
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
  }
  const unknown = scope.apps.filter((name) => state?.apps[name]?.kind !== 'hosted');
  if (unknown.length > 0) {
    throw new Refused(
      `${unknown.join(', ')} ${unknown.length === 1 ? 'is not an app' : 'are not apps'} this server runs.`,
      'sv status lists them. An external app keeps its data where it runs, not here.',
    );
  }
  return databasesOf({
    core: scope.core,
    apps: scope.apps.filter((name) => state?.apps[name]?.database !== undefined),
  }).map((entry) => entry.database);
}

/** The data volumes of hosted apps: Compose names them `<project>_<volume>`, under a project of ours. */
export async function appVolumes(host: Host): Promise<string[]> {
  const listed = await host.docker(['volume', 'ls', '--quiet', '--filter', 'name=^sovereign-app-']);
  return listed.stdout
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => /^sovereign-app-[a-z0-9-]+_data-[0-9]+$/.test(line));
}

/** Copies each app data volume to `<work>/volumes/<name>.tar`, through a container that has `tar` and mounts it read only. */
async function copyVolumes(
  host: Host,
  image: string,
  work: string,
  scope: BackupScope,
): Promise<void> {
  const volumes = (await appVolumes(host)).filter((volume) => volumeInScope(scope, volume));
  if (volumes.length === 0) return;
  await mkdir(path.join(work, 'volumes'), { recursive: true, mode: 0o700 });
  for (const volume of volumes) {
    await docker(host, `Copying ${volume}`, [
      'run',
      '--rm',
      '--entrypoint',
      'tar',
      '--volume',
      `${volume}:/source:ro`,
      '--volume',
      `${path.join(work, 'volumes')}:/target`,
      image,
      '-C',
      '/source',
      '-cf',
      `/target/${volume}.tar`,
      '.',
    ]);
  }
}

/**
 * Copies each folder of people's files to `<work>/files/<name>.tar`, through a container of the toolkit's image that mounts the shared
 * volume read only (RFC 0004 §6). Like an app's data volume it is copied while the apps run, as consistent as a crash would leave it,
 * and the tar keeps who owns what, so a restore on the same machine puts it back as it was.
 */
async function copyFiles(
  host: Host,
  image: string,
  work: string,
  folders: string[],
): Promise<void> {
  if (folders.length === 0) return;
  await mkdir(path.join(work, BACKUP.files), { recursive: true, mode: 0o700 });
  for (const name of folders) {
    await docker(host, `Copying ${name}’s files`, [
      'run',
      '--rm',
      '--user',
      '0',
      '--entrypoint',
      'tar',
      '--volume',
      `${DATA_VOLUME}:/source:ro`,
      '--volume',
      `${path.join(work, BACKUP.files)}:/target`,
      image,
      '-C',
      `/source/${filesFolder(name)}`,
      '-cf',
      `/target/${name}.tar`,
      '.',
    ]);
  }
}
