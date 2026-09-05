import { NextResponse } from 'next/server';
import { getBackupJob } from '@sovereignfs/db';
import { checkAdminKey } from '@/src/admin-guard';
import { backupJobDownloadUrl } from '@/src/backup-download';
import { getPlatformDb } from '@/src/db';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/admin/backup-jobs/[id] — poll one instance-scope backup job's
 * status (epic task 8.17). Same response shape as
 * `runtime/app/api/account/backup-jobs/[id]/route.ts`'s user-scope
 * equivalent — `downloadUrl` embeds a signed, single-job token
 * (`createBackupDownloadToken`) once `status === 'complete'`, reusing the
 * scope-agnostic `/api/backup-jobs/[jobId]/download/[token]` route
 * unmodified. Scoped to `scope === 'instance'` so this can never be used to
 * poll another user's backup job by guessing an id.
 */
export async function GET(request: Request, { params }: RouteParams): Promise<Response> {
  const denied = checkAdminKey(request);
  if (denied) return denied;

  const { id } = await params;
  const pdb = await getPlatformDb();
  const job = await getBackupJob(pdb, id);

  if (!job || job.scope !== 'instance') {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  }

  return NextResponse.json({
    jobId: job.id,
    status: job.status,
    sizeBytes: job.sizeBytes,
    errorMessage: job.errorMessage,
    downloadUrl: backupJobDownloadUrl(job),
    pushStatus: job.pushStatus,
    pushError: job.pushError,
  });
}
