import { NextResponse } from 'next/server';
import { getBackupJob } from '@sovereignfs/db';
import { getPlatformDb } from '@/src/db';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { resolveBackupArchivePath, verifyBackupDownloadToken } from '@/src/backup-download';

interface RouteParams {
  params: Promise<{ jobId: string; token: string }>;
}

/** RFC 6266 quoted-string / attr-char sanitizing for a filename derived from server-controlled data. */
function contentDisposition(filename: string): string {
  const safeAscii = filename.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  const encoded = encodeURIComponent(filename);
  return `attachment; filename="${safeAscii}"; filename*=UTF-8''${encoded}`;
}

/**
 * Serve a backup archive via a signed token (RFC 0084, epic task 8.16).
 * The token is HMAC-signed, embeds the job ID, has a configurable TTL
 * (default 48h), and cannot be extended or widened by editing it. Lives at
 * `[jobId]/download/[token]`, mirroring `runtime/app/api/storage/[token]/route.ts`'s
 * construction — the token itself is the authorization proof. Not part of the
 * session-gated middleware surface by design: signed URLs must work for
 * direct downloads without forwarding cookies.
 *
 * The archive file is streamed from disk (`createReadStream`) rather than
 * buffered — the route never loads the whole archive into memory.
 */
export async function GET(_request: Request, { params }: RouteParams): Promise<Response> {
  const { jobId, token } = await params;

  let payload: { jobId: string; expiresAt: number };
  try {
    payload = verifyBackupDownloadToken(token);
  } catch {
    return new NextResponse('Not Found', { status: 404 });
  }

  if (payload.jobId !== jobId) {
    return new NextResponse('Not Found', { status: 404 });
  }

  const pdb = await getPlatformDb();
  const job = await getBackupJob(pdb, jobId);

  if (!job) return new NextResponse('Not Found', { status: 404 });
  if (job.status !== 'complete') return new NextResponse('Not Found', { status: 404 });

  const archivePath = resolveBackupArchivePath(job.archivePath);
  if (!archivePath || !existsSync(archivePath)) {
    return new NextResponse('Not Found', { status: 404 });
  }

  const stats = statSync(archivePath);
  const stream = createReadStream(archivePath);
  const filename = job.archivePath.split(/[/\\]/).pop() || 'backup.tar.gz';

  return new NextResponse(stream as unknown as BodyInit, {
    headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Length': String(stats.size),
      'Content-Disposition': contentDisposition(filename),
      'Cache-Control': 'private, no-store',
    },
  });
}
