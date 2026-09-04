import { NextResponse } from 'next/server';
import { getBackupJob } from '@sovereignfs/db';
import { createBackupDownloadToken } from '@/src/backup-download';
import { getPlatformDb } from '@/src/db';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * Poll a `restore-fetch` job's status (workstream 0023 leg 4, epic 8.40).
 * Scoped strictly to the requester's own `restore-fetch` jobs — a job that
 * exists but belongs to someone else, is a different scope, or is a real
 * backup rather than a restore fetch, returns 404 rather than 403, mirroring
 * `GET /api/account/backup-jobs/[id]`'s identical reasoning. Once complete,
 * the download URL points at the *same* signed-download route a real backup
 * uses — a `restore-fetch` job is still just a `backup_jobs` row, and that
 * route only ever proves "this job's archive may be downloaded," never
 * anything about what kind of job it was.
 */
export async function GET(request: Request, { params }: RouteParams): Promise<Response> {
  const userId = request.headers.get('x-sovereign-user-id');
  if (!userId) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const { id } = await params;
  const pdb = await getPlatformDb();
  const job = await getBackupJob(pdb, id);

  if (
    !job ||
    job.scope !== 'user' ||
    job.kind !== 'restore-fetch' ||
    job.requestedByUserId !== userId
  ) {
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
  });
}
