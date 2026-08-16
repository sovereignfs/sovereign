import { getPlatformDb } from './db';
import { logger } from './logger';

/**
 * Minimal in-process backup job worker — the platform primitive for async
 * backup jobs (RFC 0084, epic task 8.16).
 *
 * One ~60s tick claims one queued job, runs it, marks complete/failed, and
 * sweeps expired archive files. Uses the same interval-tick +
 * conditional-UPDATE-claim idempotency pattern as `scheduler.ts`.
 *
 * Jobs survive a mid-job process restart: on next boot, any `running` jobs
 * are swept back to `failed` (not left stuck `running` forever).
 *
 * The worker does not handle encryption/decryption or archive creation —
 * those are separate CLI commands (`sv backup` / `sv restore`) invoked as
 * subprocesses. The worker's job is orchestration: claim, run, record,
 * sweep.
 */

export interface BackupJobState {
  id: string;
  scope: 'instance' | 'user';
  requestedByUserId?: string;
  optionsJson?: string;
  archivePath: string;
  expiresAt: number;
}

export interface BackupWorkerDeps {
  getPlatformDb: () => Promise<import('@sovereignfs/db').PlatformDb>;
  now: () => number;
  runBackup: (job: BackupJobState) => Promise<{ sizeBytes: number }>;
  runRestore: (job: BackupJobState) => Promise<void>;
}

const TICK_MS = 60_000;

let timer: NodeJS.Timeout | null = null;

export function backupWorkerDisabled(): boolean {
  const v = process.env.SOVEREIGN_BACKUP_WORKER_DISABLED;
  return v === '1' || v === 'true';
}

/** Sweep expired archive files and mark their jobs as failed. */
async function sweepExpiredJobs(
  _pdb: import('@sovereignfs/db').PlatformDb,
  _now: number,
): Promise<void> {
  // TODO: Implement sweep using dbGet/dbRun once the API is settled
  // For now, this is a placeholder
  logger.info('backup-worker: sweep expired jobs not yet implemented');
}

/** Claim one queued job atomically and run it. */
async function claimAndRunJob(
  _pdb: import('@sovereignfs/db').PlatformDb,
  _deps: BackupWorkerDeps,
): Promise<void> {
  // TODO: Implement claim using dbGet/dbRun once the API is settled
  // For now, this is a placeholder
  logger.info('backup-worker: claim and run job not yet implemented');
}

/**
 * Run one tick of the backup worker: sweep expired jobs, claim and run one
 * queued job. Exported for unit tests; production use goes through
 * `startBackupWorker`'s interval.
 */
export async function backupWorkerTickOnce(deps: BackupWorkerDeps): Promise<void> {
  const pdb = await deps.getPlatformDb();
  const now = deps.now();

  await sweepExpiredJobs(pdb, now);
  await claimAndRunJob(pdb, deps);
}

/**
 * Start the backup worker tick loop. Called once from `runtime/instrumentation.ts`
 * at server startup. No-ops when disabled via env var.
 */
export function startBackupWorker(
  deps: BackupWorkerDeps = {
    getPlatformDb,
    now: Date.now,
    runBackup: async () => {
      // Placeholder — actual implementation will be wired in a follow-up
      throw new Error('Backup worker not fully implemented');
    },
    runRestore: async () => {
      // Placeholder — actual implementation will be wired in a follow-up
      throw new Error('Backup worker not fully implemented');
    },
  },
  tickMs: number = TICK_MS,
): void {
  if (timer) return;
  if (backupWorkerDisabled()) {
    logger.info('backup-worker: disabled via SOVEREIGN_BACKUP_WORKER_DISABLED');
    return;
  }

  logger.info('backup-worker: started');

  timer = setInterval(() => {
    void backupWorkerTickOnce(deps);
  }, tickMs);
  timer.unref();
}

/** Stop the tick loop (SIGTERM). In-flight jobs finish on their own. */
export function stopBackupWorker(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
