import { createReadStream, createWriteStream, existsSync, statSync } from 'node:fs';
import { chmod, mkdir, open, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { Decrypter } from 'age-encryption';
import {
  ALL,
  MANIFEST_FILE,
  describeScope,
  holds,
  readManifest,
  scopeLabel,
  scopeOf,
  scopeWords,
  touchesCore,
  type BackupScope,
} from '../apply/scope.js';
import { parseArgs, positionals, type Parsed } from '../args.js';
import type { Context } from '../context.js';
import { Failed, Refused } from '../errors.js';
import { confirm } from '../io.js';
import { readOperatorKey, type OperatorKey } from '../secrets/keys.js';
import { targetOf } from '../server/remote.js';
import { MAX_ARCHIVE_BYTES } from '../server/tar.js';
import { WRAPPER_PATH } from '../server/wrapper.js';
import { SuiteFile } from '../suite/files.js';
import { prepareDeployment } from './deploy.js';
import { remoteFailure } from './server.js';

const AGE_HEADER = 'age-encryption.org/v1';
const TAR_BLOCK = 512;

/** Where backups are kept in the instance repository (operator-cli §10.2): git-ignored, encrypted, with plain copies in `unsafe/`. */
export const BACKUPS_DIR = '.backups';
export const UNSAFE_DIR = 'unsafe';

/** `--core` and `--app NAME …`, or `--all`, which is what neither gives. */
function scopeFrom(args: Parsed): BackupScope {
  const apps = args.lists.get('app') ?? [];
  if (args.switches.has('all') && (args.switches.has('core') || apps.length > 0))
    throw new Refused('--all is everything, so it goes with neither --core nor --app.');
  return scopeOf({ core: args.switches.has('core'), apps });
}

/** The operator's key, or the one `--key` names (a recovery key, say), refusing when there is none. */
async function keyFrom(ctx: Context, args: Parsed): Promise<OperatorKey> {
  const file = args.values.get('key')
    ? path.resolve(args.values.get('key') as string)
    : ctx.keyFile;
  const key = await readOperatorKey(file);
  if (!key) {
    throw new Refused(
      `There is no key at ${file}.`,
      'A backup is encrypted to your key, and only that key opens it. Pass another with --key.',
    );
  }
  return key;
}

/** Adds `.backups/` to the repository's .gitignore when it is not there, so that no backup is ever committed. */
export async function ensureGitignored(ctx: Context): Promise<void> {
  const file = path.join(ctx.root, '.gitignore');
  const text = existsSync(file) ? await readFile(file, 'utf8') : '';
  if (text.split(/\r?\n/).some((line) => /^\/?\.backups(\/(\*)?)?$/.test(line.trim()))) return;
  const gap = text === '' || text.endsWith('\n') ? '' : '\n';
  await writeFile(
    file,
    `${text}${gap}# Backups taken by sv backup, which are never committed\n${BACKUPS_DIR}/\n`,
  );
  ctx.io.err(`Added ${BACKUPS_DIR}/ to .gitignore, so that no backup is committed.`);
}

/** The bytes of a file, decrypted with the key when it is an age file, as they are when it is a plain tar. */
async function plainStream(
  file: string,
  key: () => Promise<OperatorKey>,
): Promise<{ stream: ReadableStream<Uint8Array>; encrypted: boolean }> {
  const head = await readHead(file, TAR_BLOCK);
  const raw = () => Readable.toWeb(createReadStream(file)) as ReadableStream<Uint8Array>;
  if (head.subarray(0, AGE_HEADER.length).toString('utf8') === AGE_HEADER) {
    const decrypter = new Decrypter();
    decrypter.addIdentity((await key()).identity);
    try {
      return { stream: await decrypter.decrypt(raw()), encrypted: true };
    } catch {
      throw new Refused('Your key cannot open this backup.', 'It was encrypted to other keys.');
    }
  }
  if (isTarHeader(head)) return { stream: raw(), encrypted: false };
  throw new Refused(
    `${file} is not a backup.`,
    'sv backup makes a .tar.age, or with --unencrypted a .tar.',
  );
}

async function readHead(file: string, length: number): Promise<Buffer> {
  const handle = await open(file, 'r');
  try {
    const buffer = Buffer.alloc(length);
    const { bytesRead } = await handle.read(buffer, 0, length, 0);
    return buffer.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
}

const isTarHeader = (block: Buffer) =>
  block.length >= TAR_BLOCK && block.subarray(257, 262).toString('latin1') === 'ustar';

/** The first file of a tar stream, read without the rest: `backup.json`, in a backup that has one. Cancels the stream. */
async function firstEntry(
  stream: ReadableStream<Uint8Array>,
): Promise<{ name: string; data: Buffer } | undefined> {
  const reader = stream.getReader();
  let buffered = Buffer.alloc(0);
  const fill = async (length: number) => {
    while (buffered.length < length) {
      const { done, value } = await reader.read();
      if (done) return false;
      buffered = Buffer.concat([buffered, Buffer.from(value)]);
    }
    return true;
  };
  try {
    if (!(await fill(TAR_BLOCK)) || !isTarHeader(buffered)) return undefined;
    const name = buffered
      .subarray(0, 100)
      .toString('utf8')
      .replace(/\0.*$/s, '')
      .replace(/^\.\//, '');
    const size = Number.parseInt(buffered.subarray(124, 136).toString('latin1').trim() || '0', 8);
    if (!Number.isSafeInteger(size) || size > 1024 * 1024) return { name, data: Buffer.alloc(0) };
    if (!(await fill(TAR_BLOCK + size))) return undefined;
    return { name, data: buffered.subarray(TAR_BLOCK, TAR_BLOCK + size) };
  } finally {
    await reader.cancel().catch(() => undefined);
  }
}

/** What an archive holds, from its `backup.json`; a backup from before it was written is the whole instance, with no people's files. */
async function heldBy(
  stream: ReadableStream<Uint8Array>,
): Promise<{ scope: BackupScope; files: string[] }> {
  const first = await firstEntry(stream);
  if (!first) throw new Refused('The backup is empty or damaged.');
  if (first.name !== MANIFEST_FILE) return { scope: ALL, files: [] };
  const manifest = readManifest(first.data.toString('utf8'));
  return { scope: manifest.scope, files: manifest.files ?? [] };
}

/** The lines `sv backup` says about people's files: what the archive holds of them, and what it does not (RFC 0004 §6). */
function describeFiles(manifest: {
  files?: string[];
  elsewhere?: Record<string, string>;
}): string[] {
  const lines: string[] = [];
  if (manifest.files && manifest.files.length > 0)
    lines.push(`It holds the files people uploaded to: ${manifest.files.join(', ')}.`);
  for (const [app, where] of Object.entries(manifest.elsewhere ?? {}))
    lines.push(`Not in it: ${app}’s files are kept in ${where}. Back those up there.`);
  return lines;
}

/**
 * `sv backup` (operator-cli §10.2): a backup of the instance, or of core or some apps, encrypted to your keys alone, in `.backups/`. With
 * `--unencrypted` it is decrypted here, with your key, into `.backups/unsafe/`: the server never writes or sends one in the clear.
 */
export async function backup(ctx: Context, argv: string[]): Promise<void> {
  const args = parseArgs(argv, {
    to: 'value',
    all: 'switch',
    core: 'switch',
    app: 'list',
    unencrypted: 'switch',
    key: 'value',
    yes: 'switch',
  });
  positionals(args, 0, 'sv backup [--all | --core | --app NAME …] [--unencrypted] [--to PATH]');
  const scope = scopeFrom(args);
  const unencrypted = args.switches.has('unencrypted');
  const key = await keyFrom(ctx, args);
  const suite = (await SuiteFile.load(ctx.root)).value;
  const target = targetOf(suite);
  if (unencrypted) {
    await confirm(
      ctx.io,
      `A backup without encryption holds every password and secret of ${describeScope(scope)}, and the data of the people on it, in the clear. Anyone who can read the file can read all of it. Go on?`,
      args.switches.has('yes'),
    );
  }

  const stamp = new Date(ctx.now()).toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const name = `sovereign-${target.host}-${stamp}-${scopeLabel(scope)}.tar${unencrypted ? '' : '.age'}`;
  const given = args.values.get('to');
  const store = path.join(ctx.root, BACKUPS_DIR);
  const firstBackup = given === undefined && !existsSync(store);
  let file: string;
  if (given === undefined) {
    const dir = unencrypted ? path.join(store, UNSAFE_DIR) : store;
    await mkdir(dir, { recursive: true, mode: 0o700 });
    await chmod(dir, 0o700);
    await ensureGitignored(ctx);
    file = path.join(dir, name);
    // Two backups in the same second are both kept.
    for (let n = 2; existsSync(file); n += 1)
      file = path.join(dir, name.replace(/\.tar(\.age)?$/, `-${n}.tar$1`));
  } else {
    file = path.resolve(given);
    if (existsSync(file) && statSync(file).isDirectory()) file = path.join(file, name);
  }
  if (existsSync(file))
    throw new Refused(`${file} already exists.`, 'Choose another name with --to.');

  ctx.io.err(
    `Backing up ${describeScope(scope)} on ${target.host}. This takes a copy of ${scope.all ? 'every database and the apps’ data' : 'its databases, data and secrets'}.`,
  );
  // What arrives is encrypted; a plain copy is made from it here, and what arrived is removed.
  const arrived = unencrypted ? `${file}.age.part` : file;
  const result = await ctx.remote(target, [WRAPPER_PATH, 'backup', ...scopeWords(scope)], {
    stdoutTo: arrived,
    onStderr: (chunk) => ctx.io.err(chunk.replace(/\n$/, '')),
  });
  const drop = () => Promise.all([rm(arrived, { force: true }), rm(file, { force: true })]);
  const header = await readHead(arrived, AGE_HEADER.length)
    .then((head) => head.toString('utf8'))
    .catch(() => '');
  if (result.code !== 0 || header !== AGE_HEADER) {
    await drop();
    if (result.code === 0)
      throw new Failed('What the server sent is not a backup.', 'Run sv doctor, then try again.');
    remoteFailure(result, 'The backup');
  }

  // A backup your key cannot open is no backup: the recipients the server used are those of the last deployment.
  const opened = async () => {
    const decrypter = new Decrypter();
    decrypter.addIdentity(key.identity);
    return decrypter.decrypt(
      Readable.toWeb(createReadStream(arrived)) as ReadableStream<Uint8Array>,
    );
  };
  const first = await opened()
    .then(firstEntry)
    .catch(() => undefined);
  if (!first) {
    await drop();
    throw new Refused(
      `The backup is encrypted to keys that do not include ${key.file}.`,
      'Your key is not among the recipients the server last deployed with. Add it with sv secret rekey, sv push and sv deploy, then back up again.',
    );
  }
  if (unencrypted) {
    try {
      await pipeline(
        Readable.fromWeb((await opened()) as never),
        createWriteStream(file, { mode: 0o600, flags: 'wx' }),
      );
    } catch (error) {
      await drop();
      throw error;
    }
    await rm(arrived, { force: true });
  }
  await chmod(file, 0o600);
  const size = `${(statSync(file).size / 1024 ** 2).toFixed(1)} MB`;
  ctx.io.err(
    unencrypted
      ? `Saved ${file} (${size}), in the clear. Delete it when you are done with it.`
      : `Saved ${file} (${size}), encrypted to your keys. The server cannot read it, so keep it where you would keep your key.`,
  );
  if (first.name === MANIFEST_FILE) {
    for (const line of describeFiles(readManifest(first.data.toString('utf8')))) ctx.io.err(line);
  }
  if (firstBackup)
    ctx.io.err(
      `Keep a copy of ${key.file} somewhere other than this machine, offline: without it no encrypted backup can be opened. sv key recovery makes a second key for that.`,
    );
}

/**
 * `sv restore PATH` (operator-cli §10.2): brings the instance to the pushed commit and puts a backup's data back, on this server or a new
 * one; with `--core` or `--app`, only that part, from a backup that holds it.
 */
export async function restore(ctx: Context, argv: string[]): Promise<void> {
  const args = parseArgs(argv, { yes: 'switch', core: 'switch', app: 'list', key: 'value' });
  const [source] = positionals(
    args,
    1,
    'sv restore PATH [--core | --app NAME …] [--key FILE] [--yes]',
  );
  const file = path.resolve(source as string);
  if (!existsSync(file)) throw new Refused(`There is no file ${file}.`);
  const asked = scopeOf({ core: args.switches.has('core'), apps: args.lists.get('app') ?? [] });
  const key = () => keyFrom(ctx, args);
  const { scope: held, files: heldFiles } = await heldBy((await plainStream(file, key)).stream);
  if (!asked.all && !holds(held, asked)) {
    throw new Refused(
      `The backup holds ${describeScope(held)}, not ${describeScope(asked)}.`,
      'Restore what it holds, or choose a backup that holds the rest.',
    );
  }
  const scope = asked.all ? held : asked;
  const suite = (await SuiteFile.load(ctx.root)).value;
  const target = targetOf(suite);
  const { commit, archive } = await prepareDeployment(ctx);
  if (archive.length > MAX_ARCHIVE_BYTES) throw new Refused('The deployment files are too large.');
  await confirm(
    ctx.io,
    scope.all
      ? `This replaces what ${target.host} holds with the backup: its databases, its apps’ data${heldFiles.length > 0 ? ', the files people uploaded' : ''} and its secrets, and everyone is signed out. What is there now is backed up on the server first. Go on?`
      : `This replaces ${describeScope(scope)} on ${target.host} with the backup’s: ${scope.core ? 'core’s database and secrets' : ''}${scope.core && scope.apps.length > 0 ? ', and ' : ''}${scope.apps.length > 0 ? 'the databases, data and secrets of the apps' : ''}${heldFiles.length > 0 ? ', and the files people uploaded to them' : ''}. ${scope.core ? 'Everyone is signed out, and secrets rotated since the backup go back to what they were in core.' : 'Core and the other apps are left as they are.'} What is there now is backed up on the server first. Go on?`,
    args.switches.has('yes'),
  );

  const { stream: plain } = await plainStream(file, key);
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

  ctx.io.err(`Restoring ${describeScope(scope)} on ${target.host}, at ${commit.slice(0, 12)}.`);
  const result = await ctx.remote(
    target,
    [WRAPPER_PATH, 'restore', commit, ...(asked.all ? [] : scopeWords(asked))],
    {
      inputStream: stream,
      onStdout: (chunk) => ctx.io.err(chunk.replace(/\n$/, '')),
      onStderr: (chunk) => ctx.io.err(chunk.replace(/\n$/, '')),
    },
  );
  if (result.code !== 0) remoteFailure(result, 'The restore');
  ctx.io.err(
    touchesCore(scope)
      ? 'Restored. People are signed out of core and of every app, and sign in again.'
      : `Restored ${describeScope(scope)}. Core and the other apps were not touched.`,
  );
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
