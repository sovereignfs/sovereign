import { NextResponse } from 'next/server';
import { getBackupJob } from '@sovereignfs/db';
import { createBackupDownloadToken } from '@/src/backup-download';
import { getPlatformDb } from '@/src/db';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * Poll a backup job's status (RFC 0084, epic task 8.18). Scoped strictly to
 * the requester's own jobs — a job that exists but belongs to someone else,
 * or is instance-scoped, returns 404 rather than 403, so this never confirms
 * or denies another job id's existence to a caller who doesn't own it.
 */
export async function GET(request: Request, { params }: RouteParams): Promise<Response> {
  const userId = request.headers.get('x-sovereign-user-id');
  if (!userId) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const { id } = await params;
  const pdb = await getPlatformDb();
  const job = await getBackupJob(pdb, id);

  if (!job || job.scope !== 'user' || job.requestedByUserId !== userId) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }

  const downloadUrl =
    job.status === 'complete'
      ? `/api/backup-jobs/${job.id}/download/${createBackupDownloadToken({ jobId: job.id })}`
      : null;

  return NextResponse.json({
    jobId: job.id,
    status: job.status,
    sizeBytes: job.sizeBytes,
    errorMessage: job.errorMessage,
    downloadUrl,
    // Deliberately separate from `status`/`errorMessage` (workstream 0023 leg
    // 3, epic 8.39): a failed push never turns a successful archive into a
    // failed job, and must never be silently indistinguishable from a
    // genuinely completed push either. `null` means no push was requested.
    pushStatus: job.pushStatus,
    pushError: job.pushError,
  });
}
