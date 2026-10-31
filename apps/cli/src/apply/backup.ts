import { spawn } from 'node:child_process';
import { createWriteStream, existsSync } from 'node:fs';
import { cp, mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { Encrypter, identityToRecipient } from 'age-encryption';
import { Failed, Refused } from '../errors.js';
import { docker } from './docker.js';
import type { Host } from './host.js';
import { CONTAINER, DATABASE_ADMIN } from './names.js';
import { layout } from './state.js';

/**
 * Takes a backup (operator-cli §10.2): every database, the server’s state and its generated secrets, in one archive encrypted to the
 * operator’s key alone. The server’s own key is left out of the recipients, so that the server cannot read a backup it has made, and a
 * server that is lost, or taken over, gives away no backup. The archive is kept in `backups/`, which only root can open.
 *
 * Returns the path of the archive.
 */
export async function takeBackup(
  host: Host,
  input: { stateDir: string; recipients: readonly string[]; reason: string },
): Promise<string> {
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

  await mkdir(paths.backups, { recursive: true, mode: 0o700 });
  const work = await mkdtemp(path.join(paths.backups, '.work-'));
  const stamp = new Date(host.now()).toISOString().replace(/[:.]/g, '-');
  const file = path.join(paths.backups, `${stamp}-${input.reason}.tar.age`);
  try {
    // Every database on the server, roles and all, as plain SQL that psql reads back.
    await docker(
      host,
      'Dumping the databases',
      ['exec', CONTAINER.database, 'pg_dumpall', '-U', DATABASE_ADMIN, '--clean', '--if-exists'],
      {
        stdoutTo: path.join(work, 'databases.sql'),
      },
    );
    if (existsSync(paths.state)) await cp(paths.state, path.join(work, 'state.json'));
    if (existsSync(paths.secrets))
      await cp(paths.secrets, path.join(work, 'secrets'), { recursive: true });

    const encrypter = new Encrypter();
    for (const recipient of operators) encrypter.addRecipient(recipient);
    const tar = spawn('tar', ['-C', work, '-cf', '-', '.'], { stdio: ['ignore', 'pipe', 'pipe'] });
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
