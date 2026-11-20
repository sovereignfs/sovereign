import { createReadStream, createWriteStream } from 'node:fs';
import { lstat, mkdir, readdir, rename, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { Database } from '@sovereignfs/database';
import { encryptTo, ExportWriter, type ExportHead } from '@sovereignfs/export';
import { CATALOG, isExported } from './catalog';
import type { ExportJob } from './jobs';
import { exportRows } from './records';

/** The folder under core's storage path where exports wait (core-app §4.7.3). It is no person's folder. */
export const EXPORTS_FOLDER = '.exports';

export type MakeContext = {
  database: Database;
  /** Core's storage path (`SV_STORAGE_PATH`). */
  storageRoot: string;
  instance: { id: string; url: string };
  coreVersion: string;
  /** The owner's export's recipients, read when it is made. */
  recipients: () => Promise<string[]>;
  /** Adds the apps' parts to a person's export (core-app §4.7.2). */
  appParts?: (writer: ExportWriter, sub: string) => Promise<void>;
  now?: () => number;
};

export class ExportFailure extends Error {
  override name = 'ExportFailure';
  constructor(readonly kind: string) {
    super(kind);
  }
}

export function exportsFolder(storageRoot: string): string {
  return path.join(storageRoot, EXPORTS_FOLDER);
}

/** Every regular file under `root`, as a path relative to it with `/`, skipping the exports' folder and partial uploads. */
export async function* filesUnder(
  root: string,
  relative = '',
): AsyncGenerator<{ path: string; size: number; file: string }> {
  let names: string[];
  try {
    names = (await readdir(path.join(root, relative))).sort();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
    throw error;
  }
  for (const name of names) {
    if (relative === '' && name === EXPORTS_FOLDER) continue;
    if (name.endsWith('.part')) continue;
    const inside = relative === '' ? name : `${relative}/${name}`;
    const file = path.join(root, inside);
    const info = await lstat(file);
    if (info.isDirectory()) yield* filesUnder(root, inside);
    else if (info.isFile()) yield { path: inside, size: info.size, file };
  }
}

/**
 * Makes one export into `<storage>/.exports/<id>.<archive>`: written as it is read, encrypted as it is written for the owner's, and
 * renamed into place only when whole. Returns the file's name and size.
 */
export async function makeExport(
  job: ExportJob,
  context: MakeContext,
): Promise<{ file: string; size: number }> {
  const folder = exportsFolder(context.storageRoot);
  await mkdir(folder, { recursive: true, mode: 0o700 });
  const name = `${job.id}.${job.archive}`;
  const partial = path.join(folder, `${name}.part`);
  const head: ExportHead = {
    format: 1,
    kind: job.kind,
    producer: { name: 'core', version: context.coreVersion },
    instance: context.instance,
    ...(job.kind === 'person' && job.sub ? { sub: job.sub } : {}),
    takenAt: new Date((context.now ?? Date.now)()).toISOString(),
  };
  const writer = new ExportWriter({
    head,
    archive: job.archive === 'zip' ? 'zip' : 'tar',
    spoolDirectory: folder,
  });
  let source: ReadableStream<Uint8Array> = writer.readable;
  if (job.kind === 'instance') {
    const recipients = await context.recipients();
    if (recipients.length === 0) {
      await writer.abort();
      throw new ExportFailure('no_recipients');
    }
    source = await encryptTo(recipients, writer.readable);
  }
  const written = pipeline(
    Readable.fromWeb(source as import('node:stream/web').ReadableStream<Uint8Array>),
    createWriteStream(partial, { mode: 0o600, flags: 'w' }),
  );
  try {
    await Promise.all([fill(writer, job, context), written]);
    await rename(partial, path.join(folder, name));
    return { file: name, size: (await stat(path.join(folder, name))).size };
  } catch (error) {
    await writer.abort(error);
    await written.catch(() => undefined);
    await rm(partial, { force: true });
    throw error;
  }
}

async function fill(writer: ExportWriter, job: ExportJob, context: MakeContext): Promise<void> {
  const sub = job.kind === 'person' ? (job.sub ?? undefined) : undefined;
  if (job.kind === 'person' && !sub) throw new ExportFailure('no_person');
  writer.addPart({ name: 'core', status: 'complete', version: context.coreVersion });
  for (const [table, decision] of Object.entries(CATALOG)) {
    if (!isExported(decision)) continue;
    if (sub !== undefined && !decision.person) continue;
    await writer.addRecords(
      `core/records/${table}.jsonl`,
      table,
      exportRows(context.database, table, decision, sub),
      {
        endToEnd: decision.endToEnd === true,
      },
    );
  }
  const root = sub === undefined ? context.storageRoot : path.join(context.storageRoot, sub);
  for await (const file of filesUnder(root)) {
    await writer.addFile(
      `core/files/${file.path}`,
      createReadStream(file.file) as AsyncIterable<Uint8Array>,
      file.size,
    );
  }
  if (sub !== undefined && context.appParts) await context.appParts(writer, sub);
  await writer.finish();
}

/** Removes export files by name, from the exports' folder only. */
export async function removeExportFiles(
  storageRoot: string,
  names: readonly string[],
): Promise<void> {
  const folder = exportsFolder(storageRoot);
  for (const name of names) {
    if (name.includes('/') || name.includes('\\') || name.startsWith('.')) continue;
    await rm(path.join(folder, name), { force: true });
  }
}
