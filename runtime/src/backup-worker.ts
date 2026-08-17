import { existsSync, rmSync } from 'node:fs';
import {
  claimNextBackupJob as dbClaimNextBackupJob,
  completeBackupJobFailure as dbCompleteBackupJobFailure,
  completeBackupJobSuccess as dbCompleteBackupJobSuccess,
  listExpiredBackupJobs as dbListExpiredBackupJobs,
  reclaimStuckBackupJobs as dbReclaimStuckBackupJobs,
  type BackupJobRow,
} from '@sovereignfs/db';
import { resolveBackupArchivePath } from './backup-download';
import { notifyBackupCompletion } from './backup-notification';
import { runInstanceBackup } from './backup-run';
import { getPlatformDb } from './db';
import { logger } from './logger';

/**
 * Minimal in-process backup job worker — the platform primitive for async
 * backup jobs (RFC 0084, epic task 8.16).
 *
 * One ~60s tick sweeps expired archive files, then claims and runs one
 * queued job. Uses the same interval-tick + conditional-UPDATE-claim
 * idempotency pattern as `scheduler.ts`/`jobs.ts`.
 *
 * Unlike `plugin_jobs` (which deliberately never auto-reclaims a `running`
 * job — see `jobs.ts`), a `running` backup job found at startup is always
 * reclaimed back to `failed`: this worker runs at most one job at a time to
 * completion within a single tick, so a `running` row at boot can only be
 * orphaned by a prior process's crash/restart mid-job.
 *
 * All persistence (and archive creation, `runBackup`) is behind
 * `BackupWorkerDeps` — DI, not module mocking, same convention as
 * `SchedulerDeps`/`JobWorkerDeps` in the sibling workers.
 *
 * **Off by default** (`SOVEREIGN_BACKUP_WORKER_ENABLED`, opt-in — same
 * pattern as `SOVEREIGN_DEV_MODE_ENABLED`), unlike the scheduler/job worker
 * it mirrors: there is no enqueue path yet (epic tasks 8.17/8.18 haven't
 * shipped, so nothing can ever create a `backup_jobs` row), and instance-scope
 * jobs cannot succeed in the documented production Docker deployment yet
 * (`backup-run.ts`'s doc comment). Ticking every 60s in that state — a DB
 * round trip that will only ever find zero rows — is pure overhead on every
 * existing self-hosted instance for a feature no one can reach. Flip it on
 * only once 8.17/8.18 provide a real enqueue path.
 */

export interface BackupWorkerDeps {
  /** Epoch seconds (matches `backup_jobs`' columns — NOT milliseconds). */
  now: () => number;
  claimNextBackupJob: (now: number) => Promise<BackupJobRow | undefined>;
  completeBackupJobSuccess: (
    jobId: string,
    result: { archivePath: string; sizeBytes: number },
  ) => Promise<void>;
  completeBackupJobFailure: (jobId: string, errorMessage: string) => Promise<void>;
  listExpiredBackupJobs: (now: number) => Promise<BackupJobRow[]>;
  reclaimStuckBackupJobs: (errorMessage: string) => Promise<number>;
  runBackup: (job: BackupJobRow) => Promise<{ archivePath: string; sizeBytes: number }>;
}

const TICK_MS = 60_000;

let timer: NodeJS.Timeout | null = null;

/** Opt-in — the feature does not run at all unless explicitly enabled. */
export function backupWorkerEnabled(): boolean {
  const v = process.env.SOVEREIGN_BACKUP_WORKER_ENABLED;
  return v === '1' || v === 'true';
}

function errorMessageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Delete the archive file for every `complete`/`failed` job past its
 * `expiresAt`. Deliberately doesn't track "already swept" separately —
 * `rmSync(..., { force: true })` on an already-deleted file is a no-op, so
 * re-selecting the same old rows on a later tick is harmless, just a wasted
 * `existsSync` check.
 */
export async function sweepExpiredJobs(deps: BackupWorkerDeps, now: number): Promise<void> {
  const expired = await deps.listExpiredBackupJobs(now);
  for (const job of expired) {
    const resolved = resolveBackupArchivePath(job.archivePath);
    if (!resolved) {
      logger.error('backup-worker: refusing to sweep an archive path outside backupsDir()', {
        jobId: job.id,
        archivePath: job.archivePath,
      });
      continue;
    }
    if (existsSync(resolved)) {
      rmSync(resolved, { force: true });
      logger.info('backup-worker: swept expired archive', { jobId: job.id });
    }
  }
}

/** Claim one queued job atomically and run it to completion. */
export async function claimAndRunJob(deps: BackupWorkerDeps): Promise<void> {
  const job = await deps.claimNextBackupJob(deps.now());
  if (!job) return;

  try {
    const result = await deps.runBackup(job);
    await deps.completeBackupJobSuccess(job.id, result);
    await notifyBackupCompletion({ jobId: job.id, scope: job.scope, status: 'complete' });
  } catch (err) {
    const message = errorMessageOf(err);
    logger.error('backup-worker: job failed', { jobId: job.id, scope: job.scope, err: message });
    await deps.completeBackupJobFailure(job.id, message);
    await notifyBackupCompletion({
      jobId: job.id,
      scope: job.scope,
      status: 'failed',
      errorMessage: message,
    });
  }
}

/**
 * Run one tick of the backup worker: sweep expired jobs, then claim and run
 * one queued job. Exported for unit tests; production use goes through
 * `startBackupWorker`'s interval.
 */
export async function backupWorkerTickOnce(deps: BackupWorkerDeps): Promise<void> {
  const now = deps.now();
  await sweepExpiredJobs(deps, now);
  await claimAndRunJob(deps);
}

/** One-time startup sweep — reclaims any job left `running` by a prior process. */
async function reclaimStuckJobsOnBoot(deps: BackupWorkerDeps): Promise<void> {
  try {
    const count = await deps.reclaimStuckBackupJobs(
      'Backup worker restarted while this job was running.',
    );
    if (count > 0) {
      logger.warn(
        `backup-worker: reclaimed ${String(count)} job(s) stuck "running" from a prior process`,
      );
    }
  } catch (err) {
    logger.error('backup-worker: failed to reclaim stuck jobs on boot', {
      err: errorMessageOf(err),
    });
  }
}

function productionDeps(): BackupWorkerDeps {
  return {
    now: () => Math.floor(Date.now() / 1000),
    claimNextBackupJob: async (now) => dbClaimNextBackupJob(await getPlatformDb(), now),
    completeBackupJobSuccess: async (jobId, result) =>
      dbCompleteBackupJobSuccess(await getPlatformDb(), jobId, result),
    completeBackupJobFailure: async (jobId, errorMessage) =>
      dbCompleteBackupJobFailure(await getPlatformDb(), jobId, errorMessage),
    listExpiredBackupJobs: async (now) => dbListExpiredBackupJobs(await getPlatformDb(), now),
    reclaimStuckBackupJobs: async (errorMessage) =>
      dbReclaimStuckBackupJobs(await getPlatformDb(), errorMessage),
    runBackup: runInstanceBackup,
  };
}

/**
 * Start the backup worker tick loop. Called once from `runtime/instrumentation.ts`
 * at server startup. No-ops (no timer, no DB call at all) unless
 * `SOVEREIGN_BACKUP_WORKER_ENABLED` is explicitly set — see this file's doc
 * comment for why the default is off.
 */
export function startBackupWorker(
  deps: BackupWorkerDeps = productionDeps(),
  tickMs: number = TICK_MS,
): void {
  if (timer) return;
  if (!backupWorkerEnabled()) {
    logger.info('backup-worker: not started — set SOVEREIGN_BACKUP_WORKER_ENABLED=1 to enable');
    return;
  }

  logger.info('backup-worker: started');

  void reclaimStuckJobsOnBoot(deps);

  timer = setInterval(() => {
    void backupWorkerTickOnce(deps);
  }, tickMs);
  timer.unref();
}

/** Stop the tick loop (SIGTERM). An in-flight job finishes on its own. */
export function stopBackupWorker(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
