import { createReadStream, createWriteStream, existsSync } from 'node:fs';
import { mkdir, open, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { decryptWith, ExportError, readExport } from '@sovereignfs/export';
import { parseArgs, positionals } from '../args.js';
import type { Context } from '../context.js';
import { Refused } from '../errors.js';
import { readOperatorKey } from '../secrets/keys.js';

const AGE_HEADER = 'age-encryption.org/v1\n';
const USAGE = 'sv export open FILE [--key FILE] [--out DIR]';

/**
 * `sv export open FILE [--key FILE] [--out DIR]` (operator-cli §9.6): opens an export the Console gave, here. An owner's export is
 * decrypted with the operator's key (or `--key`, a recovery key), as a stream; any export is checked as `contracts/export.md` §5 says
 * while it is unpacked into a folder beside it, and the folder is kept only when the whole export passed.
 */
export async function exportCommand(ctx: Context, argv: string[]): Promise<void> {
  const [what, ...rest] = argv;
  if (what !== 'open') throw new Refused(`Usage: ${USAGE}`);
  const args = parseArgs(rest, { key: 'value', out: 'value' });
  const [given] = positionals(args, 1, USAGE);
  const file = path.resolve(given as string);
  if (!existsSync(file)) throw new Refused(`${file} does not exist.`);

  const head = await readHead(file, 512);
  let source: ReadableStream<Uint8Array> = Readable.toWeb(
    createReadStream(file),
  ) as ReadableStream<Uint8Array>;
  if (head.subarray(0, AGE_HEADER.length).toString('utf8') === AGE_HEADER) {
    const keyPath = args.values.get('key')
      ? path.resolve(args.values.get('key') as string)
      : ctx.keyFile;
    const key = await readOperatorKey(keyPath);
    if (!key) {
      throw new Refused(
        `There is no key at ${keyPath}.`,
        'An export opens only with a key it was encrypted to. Pass one with --key.',
      );
    }
    try {
      source = await decryptWith([key.identity], source);
    } catch {
      throw new Refused(
        'Your key cannot open this export.',
        'It was encrypted to other keys. Pass one with --key.',
      );
    }
  } else if (head.subarray(0, 4).toString('latin1') === 'PK\u0003\u0004') {
    throw new Refused(
      `${file} is a person's export, a zip.`,
      'Open it with any tool that opens zip files; it is not encrypted.',
    );
  } else if (head.subarray(257, 262).toString('latin1') !== 'ustar') {
    throw new Refused(
      `${file} is not an export.`,
      'The Console gives an owner a .tar.age, and a person a .zip or a .tar.',
    );
  }

  const out = path.resolve(args.values.get('out') ?? file.replace(/(\.tar)?(\.age)?$/, ''));
  if (out === file) throw new Refused('--out names the export itself.');
  if (existsSync(out))
    throw new Refused(`${out} already exists.`, 'Name another folder with --out.');
  const partial = `${out}.partial-${process.pid}`;
  await mkdir(partial, { recursive: false, mode: 0o700 });
  try {
    const read = await readExport(source, {
      onFile: async ({ path: inside, body }) => {
        const target = path.join(partial, ...inside.split('/'));
        if (!target.startsWith(partial + path.sep))
          throw new Refused(`The export names a file outside itself: ${inside}.`);
        await mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
        await pipeline(
          Readable.from(body),
          createWriteStream(target, { mode: 0o600, flags: 'wx' }),
        );
      },
    });
    await writeFile(path.join(partial, 'export.json'), JSON.stringify(read.head, null, 2) + '\n', {
      mode: 0o600,
    });
    await writeFile(
      path.join(partial, 'contents.json'),
      JSON.stringify(read.contents, null, 2) + '\n',
      { mode: 0o600 },
    );
    await rename(partial, out);
    const missing = read.contents.parts.filter((part) => part.status === 'missing');
    ctx.io.err(
      `Opened the ${read.head.kind === 'instance' ? 'instance' : read.head.kind === 'app' ? `${read.head.app ?? 'app'}` : 'person'}'s export taken at ${read.head.takenAt}: ${read.contents.files.length} file${read.contents.files.length === 1 ? '' : 's'}, every one as listed, in ${out}.`,
    );
    for (const part of missing)
      ctx.io.err(`It does not hold ${part.name}'s part (${part.reason ?? 'missing'}).`);
    ctx.io.err('It is a copy to keep, not a backup: sv restore does not take it.');
  } catch (error) {
    await rm(partial, { recursive: true, force: true });
    if (error instanceof ExportError) {
      if (error.code === 'not_open')
        throw new Refused(
          'Your key cannot open this export.',
          'It was encrypted to other keys. Pass one with --key.',
        );
      throw new Refused(
        `This export is not as it should be, and nothing of it was kept: ${error.message}`,
      );
    }
    if (error instanceof Error && /decrypt|header|stanza|tag|chunk/i.test(error.message)) {
      throw new Refused(
        'Your key cannot open this export, or the file was changed.',
        'Pass the key it was encrypted to with --key.',
      );
    }
    throw error;
  }
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
