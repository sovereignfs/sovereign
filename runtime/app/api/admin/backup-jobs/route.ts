import { NextResponse } from 'next/server';
import { DEFAULT_TENANT_ID, enqueueBackupJob, listBackupJobs } from '@sovereignfs/db';
import { checkAdminKey } from '@/src/admin-guard';
import { backupArchivePathForJob, backupJobDownloadUrl } from '@/src/backup-download';
import { storeBackupPassphrase } from '@/src/backup-passphrase-store';
import { resolveInstanceGitPushConfig } from '@/src/backup-run';
import { getPlatformDb } from '@/src/db';
import { getInstalledPlugins } from '@/src/registry';
import { manifestDatabaseIsolation } from '@sovereignfs/manifest';

/**
 * GET /api/admin/backup-jobs — Console's instance backup page (epic task
 * 8.17). Returns the recent job list plus everything the trigger form needs
 * to render itself, computed server-side so Console (a plugin, even though a
 * first-party one) never needs `@sovereignfs/db`/`@sovereignfs/manifest`
 * imports of its own — those are blocked by the SDK boundary ESLint rule
 * even for Console; see `docs/architecture-rules.md`.
 *
 * `excludablePlugins` is pre-filtered to schema-isolated plugins only — the
 * four built-in `type:"platform"` plugins share the `public` schema and
 * excluding one from a full instance backup was never a real use case (see
 * `bin/backup-restore.ts`'s own `--exclude-plugin` doc comment).
 */
export async function GET(request: Request): Promise<Response> {
  const denied = checkAdminKey(request);
  if (denied) return denied;

  const pdb = await getPlatformDb();
  const rows = await listBackupJobs(pdb, { scope: 'instance', tenantId: DEFAULT_TENANT_ID });
  const jobs = rows.map((job) => ({
    id: job.id,
    status: job.status,
    sizeBytes: job.sizeBytes,
    errorMessage: job.errorMessage,
    downloadUrl: backupJobDownloadUrl(job),
    pushStatus: job.pushStatus,
    pushError: job.pushError,
    createdAt: job.createdAt,
  }));

  const excludablePlugins = getInstalledPlugins()
    .filter((p) => manifestDatabaseIsolation(p.type) === 'isolated')
    .map((p) => ({ id: p.id, name: p.name }));

  return NextResponse.json({
    jobs,
    excludablePlugins,
    gitPushAvailable: resolveInstanceGitPushConfig() !== null,
  });
}

interface TriggerBody {
  passphrase?: string;
  excludePlugins?: string[];
  pushToGit?: boolean;
}

/**
 * POST /api/admin/backup-jobs — enqueue a new instance-scope backup job. The
 * passphrase is never persisted to the job row (RFC 0084: "always applied —
 * no opt-out... never persisted") — it's handed to the same in-memory,
 * single-use store `runUserBackup` already relies on for its own scope.
 */
export async function POST(request: Request): Promise<Response> {
  const denied = checkAdminKey(request);
  if (denied) return denied;

  const body = (await request.json().catch(() => null)) as TriggerBody | null;
  const passphrase = body?.passphrase?.trim();
  if (!passphrase) {
    return NextResponse.json({ error: 'A passphrase is required.' }, { status: 400 });
  }

  const excludePlugins = Array.isArray(body?.excludePlugins)
    ? body.excludePlugins.filter((id): id is string => typeof id === 'string' && id.length > 0)
    : undefined;
  const pushToGit = body?.pushToGit === true;

  const id = crypto.randomUUID();
  const archivePath = backupArchivePathForJob(id, 'instance');
  const pdb = await getPlatformDb();

  await enqueueBackupJob(pdb, {
    id,
    tenantId: DEFAULT_TENANT_ID,
    scope: 'instance',
    archivePath,
    optionsJson: JSON.stringify({ excludePlugins, pushToGit }),
  });
  storeBackupPassphrase(id, passphrase);

  return NextResponse.json({ jobId: id }, { status: 202 });
}
