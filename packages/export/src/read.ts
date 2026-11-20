import { createHash } from 'node:crypto';
import { concat } from './bytes.js';
import { ExportError } from './errors.js';
import { checkContentsShape, checkHead } from './head.js';
import { isDataPath, partFolder, pathProblem } from './paths.js';
import { readTar } from './tar.js';
import type { ByteSource, ExportContents, ExportHead, FileEntry } from './types.js';

const MAX_HEAD = 64 * 1024;
const MAX_CONTENTS = 64 * 1024 * 1024;

export interface ReadExportOptions {
  /**
   * Called for each data file, in order, with its bytes, which it should read (what it leaves is read for it). Nothing it is given is
   * known to be good until `readExport` resolves: a consumer keeps what it wrote only then, and removes it when `readExport` throws.
   */
  onFile?: (file: { path: string; size: number; body: AsyncIterable<Uint8Array> }) => Promise<void>;
  /** The most bytes of data the export may hold; more is refused as `too_large`. */
  maxBytes?: number;
}

export interface ReadExport {
  head: ExportHead;
  contents: ExportContents;
}

async function whole(
  body: AsyncIterable<Uint8Array>,
  max: number,
  what: string,
): Promise<Uint8Array> {
  const parts: Uint8Array[] = [];
  let size = 0;
  for await (const chunk of body) {
    size += chunk.byteLength;
    if (size > max) throw new ExportError('too_large', `${what} is too large.`);
    parts.push(chunk);
  }
  return concat(parts);
}

function parse(
  bytes: Uint8Array,
  what: string,
  code: 'invalid_head' | 'invalid_contents',
): unknown {
  try {
    return JSON.parse(Buffer.from(bytes).toString('utf8')) as unknown;
  } catch {
    throw new ExportError(code, `${what} is not JSON.`);
  }
}

/**
 * Reads an export (a tar; decrypt one that is encrypted first) and checks it as `contracts/export.md` §5 says, throwing an
 * `ExportError` at the first thing wrong. Each data file is handed to `onFile` as it is read.
 */
export async function readExport(
  source: ByteSource,
  options: ReadExportOptions = {},
): Promise<ReadExport> {
  const maxBytes = options.maxBytes ?? Number.MAX_SAFE_INTEGER;
  let head: ExportHead | undefined;
  let contents: ExportContents | undefined;
  const seen: FileEntry[] = [];
  const paths = new Set<string>();
  let total = 0;
  for await (const entry of readTar(source)) {
    if (contents) throw new ExportError('invalid_archive', 'contents.json is not the last entry.');
    const problem = pathProblem(entry.path);
    if (problem)
      throw new ExportError('invalid_path', `The path ${JSON.stringify(entry.path)} ${problem}.`);
    if (!head) {
      if (entry.path !== 'export.json')
        throw new ExportError('invalid_archive', 'The first entry is not export.json.');
      head = checkHead(
        parse(await whole(entry.body, MAX_HEAD, 'export.json'), 'export.json', 'invalid_head'),
      );
      continue;
    }
    if (entry.path === 'contents.json') {
      contents = checkContentsShape(
        parse(
          await whole(entry.body, MAX_CONTENTS, 'contents.json'),
          'contents.json',
          'invalid_contents',
        ),
      );
      continue;
    }
    if (!isDataPath(entry.path))
      throw new ExportError('invalid_path', `${entry.path} is not under core/ or apps/<prefix>/.`);
    if (paths.has(entry.path))
      throw new ExportError('invalid_archive', `${entry.path} appears twice.`);
    paths.add(entry.path);
    total += entry.size;
    if (total > maxBytes) throw new ExportError('too_large', 'The export holds more than it may.');
    const hash = createHash('sha256');
    let size = 0;
    const body = (async function* () {
      for await (const chunk of entry.body) {
        hash.update(chunk);
        size += chunk.byteLength;
        yield chunk;
      }
    })();
    if (options.onFile) await options.onFile({ path: entry.path, size: entry.size, body });
    for await (const _chunk of body) {
      // read what the consumer left
    }
    seen.push({ path: entry.path, bytes: size, sha256: hash.digest('hex') });
  }
  if (!head) throw new ExportError('invalid_archive', 'The archive is empty.');
  if (!contents) throw new ExportError('invalid_archive', 'The last entry is not contents.json.');
  if (contents.files.length !== seen.length) {
    throw new ExportError(
      'mismatch',
      `contents.json lists ${contents.files.length} files and the archive holds ${seen.length}.`,
    );
  }
  contents.files.forEach((listed, index) => {
    const actual = seen[index];
    if (!actual || listed.path !== actual.path)
      throw new ExportError(
        'mismatch',
        `contents.json lists ${listed.path} where the archive holds ${actual?.path}.`,
      );
    if (listed.bytes !== actual.bytes || listed.sha256 !== actual.sha256) {
      throw new ExportError('mismatch', `${listed.path} is not what contents.json says it is.`);
    }
  });
  const recordPaths = new Set<string>();
  for (const records of contents.records) {
    if (!paths.has(records.path))
      throw new ExportError(
        'invalid_contents',
        `The records ${records.path} are not in the archive.`,
      );
    if (recordPaths.has(records.path))
      throw new ExportError('invalid_contents', `The records ${records.path} are listed twice.`);
    recordPaths.add(records.path);
  }
  for (const part of contents.parts) {
    if (part.status !== 'missing') continue;
    const folder = partFolder(part.name);
    if ([...paths].some((path) => path.startsWith(folder))) {
      throw new ExportError('invalid_contents', `The missing part ${part.name} has files.`);
    }
  }
  return { head, contents };
}
