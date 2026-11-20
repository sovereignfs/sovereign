import { createReadStream } from 'node:fs';
import { rm } from 'node:fs/promises';
import path from 'node:path';
import {
  authorizationResponse,
  requireCapability,
  requireSameOrigin,
} from '../../../../src/auth/authorize';
import { getDatabase } from '../../../../src/database';
import { coreFilesRoot } from '../../../../src/files';
import { ExportJobs } from '../../../../src/exports/jobs';
import { exportsFolder } from '../../../../src/exports/make';

export const dynamic = 'force-dynamic';

const TYPES = {
  'tar.age': 'application/octet-stream',
  tar: 'application/x-tar',
  zip: 'application/zip',
} as const;

function fileName(host: string, kind: string, requestedAt: number, archive: string): string {
  const time = new Date(requestedAt)
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}Z$/, 'Z');
  return `sovereign-${host.replace(/[^a-z0-9.-]/gi, '-').toLowerCase()}-${time}-${kind}.${archive}`;
}

/**
 * Hands over an export once (core-app §4.7.3): a `POST` from core's own page, by the session that asked for it, within the hour. The
 * owner's needs `instance:export`; a person's, `profile:manage` and their own. Anything else, or a second time, is not there. The file is
 * removed once it has been sent.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    requireSameOrigin(request);
    const { id } = await params;
    const kind =
      new URL(request.url).searchParams.get('kind') === 'instance' ? 'instance' : 'person';
    const session = await requireCapability(
      kind === 'instance' ? 'instance:export' : 'profile:manage',
    );
    const jobs = new ExportJobs(await getDatabase());
    const job = await jobs.take({
      id,
      kind,
      ...(kind === 'person' ? { sub: session.user.id } : {}),
      sessionId: session.session.id,
    });
    if (!job?.file)
      return new Response('Not found', { status: 404, headers: { 'cache-control': 'no-store' } });
    const file = path.join(exportsFolder(coreFilesRoot()), job.file);
    const stream = createReadStream(file);
    const done = () => void rm(file, { force: true });
    stream.on('close', done);
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
    return new Response(body, {
      headers: {
        'content-type': TYPES[job.archive],
        'content-length': String(job.size ?? ''),
        'content-disposition': `attachment; filename="${fileName(new URL(request.url).hostname, job.kind, job.requestedAt, job.archive)}"`,
        'cache-control': 'no-store',
        'x-content-type-options': 'nosniff',
      },
    });
  } catch (error) {
    return authorizationResponse(error) ?? Promise.reject(error);
  }
}
