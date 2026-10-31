import { createReadStream, existsSync, statSync } from 'node:fs';
import { open, rm } from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { Decrypter } from 'age-encryption';
import { parseArgs, positionals } from '../args.js';
import type { Context } from '../context.js';
import { Failed, Refused } from '../errors.js';
import { confirm } from '../io.js';
import { readOperatorKey } from '../secrets/keys.js';
import { targetOf } from '../server/remote.js';
import { MAX_ARCHIVE_BYTES } from '../server/tar.js';
import { WRAPPER_PATH } from '../server/wrapper.js';
import { SuiteFile } from '../suite/files.js';
import { prepareDeployment } from './deploy.js';
import { remoteFailure } from './server.js';

const AGE_HEADER = 'age-encryption.org/v1';

/** `sv backup [--to PATH]` (operator-cli §10.2): a backup of the instance, encrypted to your key alone, on this machine. */
export async function backup(ctx: Context, argv: string[]): Promise<void> {
  const args = parseArgs(argv, { to: 'value' });
  positionals(args, 0, 'sv backup [--to PATH]');
  const suite = (await SuiteFile.load(ctx.root)).value;
  const target = targetOf(suite);
  const stamp = new Date(ctx.now()).toISOString().replace(/[:.]/g, '-').slice(0, 19);
  let file = path.resolve(args.values.get('to') ?? ctx.root);
  if (args.values.get('to') === undefined || (existsSync(file) && statSync(file).isDirectory())) {
    file = path.join(file, `sovereign-${target.host}-${stamp}.tar.age`);
  }
  if (existsSync(file))
    throw new Refused(`${file} already exists.`, 'Choose another name with --to.');

  ctx.io.err(`Backing up ${target.host}. This takes a copy of every database and the apps’ data.`);
  const result = await ctx.remote(target, [WRAPPER_PATH, 'backup'], {
    stdoutTo: file,
    onStderr: (chunk) => ctx.io.err(chunk.replace(/\n$/, '')),
  });
  const header = await open(file, 'r')
    .then(async (handle) => {
      try {
        const buffer = Buffer.alloc(AGE_HEADER.length);
        await handle.read(buffer, 0, buffer.length, 0);
        return buffer.toString('utf8');
      } finally {
        await handle.close();
      }
    })
    .catch(() => '');
  if (result.code !== 0 || header !== AGE_HEADER) {
    await rm(file, { force: true });
    if (result.code === 0)
      throw new Failed('What the server sent is not a backup.', 'Run sv doctor, then try again.');
    remoteFailure(result, 'The backup');
  }
  ctx.io.err(
    `Saved ${file} (${(statSync(file).size / 1024 ** 2).toFixed(1)} MB), encrypted to your keys. The server cannot read it, so keep it where you would keep your key.`,
  );
}

/** `sv restore PATH` (operator-cli §10.2): brings the instance to the pushed commit and puts a backup's data back, on this server or a new one. */
export async function restore(ctx: Context, argv: string[]): Promise<void> {
  const args = parseArgs(argv, { yes: 'switch' });
  const [source] = positionals(args, 1, 'sv restore PATH [--yes]');
  const file = path.resolve(source as string);
  if (!existsSync(file)) throw new Refused(`There is no file ${file}.`);
  const key = await readOperatorKey(ctx.keyFile);
  if (!key) {
    throw new Refused(
      `There is no key at ${ctx.keyFile}.`,
      'A backup is encrypted to your key, and only that key opens it.',
    );
  }
  const suite = (await SuiteFile.load(ctx.root)).value;
  const target = targetOf(suite);
  const { commit, archive } = await prepareDeployment(ctx);
  if (archive.length > MAX_ARCHIVE_BYTES) throw new Refused('The deployment files are too large.');
  await confirm(
    ctx.io,
    `This replaces what ${target.host} holds with the backup: its databases, its apps’ data and its secrets, and everyone is signed out. What is there now is backed up on the server first. Go on?`,
    args.switches.has('yes'),
  );

  const decrypter = new Decrypter();
  decrypter.addIdentity(key.identity);
  let plain: ReadableStream<Uint8Array>;
  try {
    plain = await decrypter.decrypt(
      Readable.toWeb(createReadStream(file)) as ReadableStream<Uint8Array>,
    );
  } catch {
    throw new Refused('Your key cannot open this backup.', 'It was encrypted to other keys.');
  }
  const length = Buffer.alloc(8);
  length.writeBigUInt64BE(BigInt(archive.length));
  const stream = Readable.from(
    (async function* () {
      yield length;
      yield archive;
      const reader = plain.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) return;
        yield Buffer.from(value);
      }
    })(),
  );

  ctx.io.err(`Restoring ${target.host} to ${commit.slice(0, 12)} and the backup.`);
  const result = await ctx.remote(target, [WRAPPER_PATH, 'restore', commit], {
    inputStream: stream,
    onStdout: (chunk) => ctx.io.err(chunk.replace(/\n$/, '')),
    onStderr: (chunk) => ctx.io.err(chunk.replace(/\n$/, '')),
  });
  if (result.code !== 0) remoteFailure(result, 'The restore');
  ctx.io.err('Restored. People are signed out of core and of every app, and sign in again.');
}

/** `sv rollback` (operator-cli §10.3): applies the previous release's files again. */
export async function rollback(ctx: Context, argv: string[]): Promise<void> {
  const args = parseArgs(argv, { yes: 'switch' });
  positionals(args, 0, 'sv rollback [--yes]');
  const suite = (await SuiteFile.load(ctx.root)).value;
  const target = targetOf(suite);
  await confirm(
    ctx.io,
    'This runs the previous release again. Rolling an app back does not undo its migrations: if the newer version changed its data, the older one may not read it. Core’s data is not touched, and a core that would go backward is refused. Go on?',
    args.switches.has('yes'),
  );
  const result = await ctx.remote(target, [WRAPPER_PATH, 'rollback'], {
    onStdout: (chunk) => ctx.io.err(chunk.replace(/\n$/, '')),
    onStderr: (chunk) => ctx.io.err(chunk.replace(/\n$/, '')),
  });
  if (result.code !== 0) remoteFailure(result, 'The rollback');
  ctx.io.err(
    'Rolled back. Edit suite.yml to match, or sv push and sv deploy when you want to move forward again.',
  );
}
