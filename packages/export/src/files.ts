import { createReadStream } from 'node:fs';
import { rm } from 'node:fs/promises';
import path from 'node:path';
import type { ExportJobs, ExportKind } from './jobs.js';

/** Removes export files by name from the exports' folder, and nothing outside it: a name with a separator or a leading dot is skipped. */
export async function removeExportFiles(folder: string, names: readonly string[]): Promise<void> {
  for (const name of names) {
    if (name.includes('/') || name.includes('\\') || name.startsWith('.')) continue;
    await rm(path.join(folder, name), { force: true });
  }
}

const TYPES = {
  'tar.age': 'application/octet-stream',
  tar: 'application/x-tar',
  zip: 'application/zip',
} as const;

/** The name a download is saved under (`contracts/export.md` §1). */
export function downloadName(input: {
  host: string;
  app?: string;
  kind: string;
  at: number;
  archive: string;
}): string {
  const time = new Date(input.at)
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}Z$/, 'Z');
  const host = input.host.replace(/[^a-z0-9.-]/gi, '-').toLowerCase();
  return `sovereign-${host}${input.app ? `-${input.app}` : ''}-${time}-${input.kind}.${input.archive}`;
}

/**
 * Hands over a ready export once (core-app §4.7.3): to the session that asked, for its owner, within the hour, as an attachment that is
 * never cached, and removes the file once it has been sent. `undefined` for anything else, which the caller answers as not found. The
 * caller has already checked who is asking (the capability, the same origin); this checks that the export is theirs.
 */
export async function downloadExport(input: {
  jobs: ExportJobs;
  folder: string;
  id: string;
  kind: ExportKind;
  sub?: string;
  sessionId: string;
  host: string;
  app?: string;
}): Promise<Response | undefined> {
  const job = await input.jobs.take({
    id: input.id,
    kind: input.kind,
    ...(input.sub === undefined ? {} : { sub: input.sub }),
    sessionId: input.sessionId,
  });
  if (!job?.file) return undefined;
  const file = path.join(input.folder, path.basename(job.file));
  const stream = createReadStream(file);
  stream.on('close', () => void rm(file, { force: true }));
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      stream.on('data', (chunk) => controller.enqueue(new Uint8Array(chunk as Buffer)));
      stream.on('end', () => controller.close());
      stream.on('error', (error) => controller.error(error));
    },
    cancel() {
      stream.destroy();
    },
  });
  const kind = job.kind === 'person' ? 'person' : input.app ? 'app' : 'instance';
  return new Response(body, {
    headers: {
      'content-type': TYPES[job.archive],
      ...(job.size === null ? {} : { 'content-length': String(job.size) }),
      'content-disposition': `attachment; filename="${downloadName({ host: input.host, ...(input.app ? { app: input.app } : {}), kind, at: job.requestedAt, archive: job.archive })}"`,
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    },
  });
}
