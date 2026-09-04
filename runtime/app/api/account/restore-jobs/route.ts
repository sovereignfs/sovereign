import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { DEFAULT_TENANT_ID, enqueueBackupJob, getPluginConnection } from '@sovereignfs/db';
import { restoreFetchArchivePathForJob } from '@/src/backup-download';
import { getPlatformDb } from '@/src/db';

// Matches plugins/account/app/_lib/backup-destinations.ts's PROVIDER_KIND
// owner — backup destinations are always created under the account plugin's
// own id, regardless of which route later reads them back.
const BACKUP_DESTINATION_PLUGIN_ID = 'fs.sovereign.account';

/**
 * Enqueue a `restore-fetch` job (workstream 0023 leg 4, epic 8.40) — the
 * async half of in-app git restore. Returns immediately with a job id; the
 * ciphertext is actually pulled down by `runtime/src/backup-worker.ts`'s
 * next tick, same infrastructure as a real backup job. Requires
 * `SOVEREIGN_BACKUP_WORKER_ENABLED`, same caveat as `POST /api/account/backup-jobs`.
 */
export async function POST(request: Request): Promise<Response> {
  const userId = request.headers.get('x-sovereign-user-id');
  if (!userId) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const body = (await request.json().catch(() => null)) as {
    destinationId?: unknown;
    tag?: unknown;
  } | null;

  const destinationId = typeof body?.destinationId === 'string' ? body.destinationId : '';
  const tag = typeof body?.tag === 'string' ? body.tag : '';
  if (!destinationId || !tag) {
    return NextResponse.json({ error: 'destinationId and tag are required.' }, { status: 400 });
  }

  const pdb = await getPlatformDb();

  // Fail fast with a clear 400 for an unknown/foreign destination, rather
  // than letting the job queue and only discover this much later on the
  // worker's own tick — `runRestoreFetch` re-checks this independently
  // regardless, since that's the actual authorization boundary, not this
  // convenience check (mirrors `POST /api/account/backup-jobs`'s identical
  // pushDestinationId check).
  const connection = await getPluginConnection(pdb, destinationId, {
    tenantId: DEFAULT_TENANT_ID,
    pluginId: BACKUP_DESTINATION_PLUGIN_ID,
    userId,
  });
  if (!connection || connection.status === 'disconnected') {
    return NextResponse.json({ error: 'Backup destination not found.' }, { status: 400 });
  }

  const jobId = randomUUID();
  const job = await enqueueBackupJob(pdb, {
    id: jobId,
    tenantId: DEFAULT_TENANT_ID,
    scope: 'user',
    requestedByUserId: userId,
    archivePath: restoreFetchArchivePathForJob(jobId),
    optionsJson: JSON.stringify({ destinationId, tag }),
    kind: 'restore-fetch',
  });

  return NextResponse.json({ jobId: job.id }, { status: 202 });
}
