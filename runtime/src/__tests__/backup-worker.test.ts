import type { BackupJobRow } from '@sovereignfs/db';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  backupWorkerEnabled,
  backupWorkerTickOnce,
  claimAndRunJob,
  startBackupWorker,
  stopBackupWorker,
  sweepExpiredJobs,
  type BackupWorkerDeps,
} from '../backup-worker';
import { notifyBackupCompletion } from '../backup-notification';

vi.mock('../backup-notification', () => ({
  notifyBackupCompletion: vi.fn(async () => undefined),
}));

function job(overrides: Partial<BackupJobRow> = {}): BackupJobRow {
  return {
    id: 'job-1',
    tenantId: 'default',
    scope: 'instance',
    requestedByUserId: null,
    status: 'running',
    optionsJson: null,
    archivePath: '/workspace/backups/sovereign-backup-job-1.tar.gz',
    sizeBytes: 0,
    errorMessage: null,
    createdAt: 1_000_000_000,
    startedAt: 1_000_000_000,
    completedAt: null,
    expiresAt: 1_000_200_000,
    ...overrides,
  };
}

function deps(overrides: Partial<BackupWorkerDeps> = {}): BackupWorkerDeps {
  return {
    now: () => 1_000_000_000,
    claimNextBackupJob: vi.fn(async () => undefined),
    completeBackupJobSuccess: vi.fn(async () => undefined),
    completeBackupJobFailure: vi.fn(async () => undefined),
    listExpiredBackupJobs: vi.fn(async () => []),
    reclaimStuckBackupJobs: vi.fn(async () => 0),
    runBackup: vi.fn(async () => ({ archivePath: '/workspace/backups/x.tar.gz', sizeBytes: 42 })),
    ...overrides,
  };
}

afterEach(() => {
  stopBackupWorker();
  vi.useRealTimers();
  delete process.env.SOVEREIGN_BACKUP_WORKER_ENABLED;
});

describe('claimAndRunJob', () => {
  it('does nothing when there is no queued job to claim', async () => {
    const d = deps({ claimNextBackupJob: vi.fn(async () => undefined) });
    await claimAndRunJob(d);
    expect(d.runBackup).not.toHaveBeenCalled();
    expect(d.completeBackupJobSuccess).not.toHaveBeenCalled();
    expect(d.completeBackupJobFailure).not.toHaveBeenCalled();
  });

  it('runs a claimed job and marks it complete on success', async () => {
    const claimed = job({ requestedByUserId: 'user-1' });
    const d = deps({
      claimNextBackupJob: vi.fn(async () => claimed),
      runBackup: vi.fn(async () => ({ archivePath: claimed.archivePath, sizeBytes: 999 })),
    });

    await claimAndRunJob(d);

    expect(d.runBackup).toHaveBeenCalledWith(claimed);
    expect(d.completeBackupJobSuccess).toHaveBeenCalledWith('job-1', {
      archivePath: claimed.archivePath,
      sizeBytes: 999,
    });
    expect(d.completeBackupJobFailure).not.toHaveBeenCalled();
    expect(notifyBackupCompletion).toHaveBeenCalledWith({
      jobId: 'job-1',
      scope: 'instance',
      status: 'complete',
      recipientUserId: claimed.requestedByUserId,
    });
  });

  it('marks a job failed when runBackup throws, recording the error message', async () => {
    const claimed = job({ requestedByUserId: 'user-1' });
    const d = deps({
      claimNextBackupJob: vi.fn(async () => claimed),
      runBackup: vi.fn(async () => {
        throw new Error('sv backup exited with code 1');
      }),
    });

    await claimAndRunJob(d);

    expect(d.completeBackupJobFailure).toHaveBeenCalledWith(
      'job-1',
      'sv backup exited with code 1',
    );
    expect(d.completeBackupJobSuccess).not.toHaveBeenCalled();
    expect(notifyBackupCompletion).toHaveBeenCalledWith({
      jobId: 'job-1',
      scope: 'instance',
      status: 'failed',
      errorMessage: 'sv backup exited with code 1',
      recipientUserId: claimed.requestedByUserId,
    });
  });

  it('marks a job failed with a stringified error when runBackup throws a non-Error', async () => {
    const claimed = job();
    const d = deps({
      claimNextBackupJob: vi.fn(async () => claimed),
      runBackup: vi.fn(async () => {
        throw 'raw string failure';
      }),
    });

    await claimAndRunJob(d);

    expect(d.completeBackupJobFailure).toHaveBeenCalledWith('job-1', 'raw string failure');
  });
});

describe('sweepExpiredJobs', () => {
  it('does nothing when nothing is expired', async () => {
    const d = deps({ listExpiredBackupJobs: vi.fn(async () => []) });
    await expect(sweepExpiredJobs(d, 1_000_000_000)).resolves.toBeUndefined();
  });

  it('skips (does not throw) an archive path that resolves outside backupsDir()', async () => {
    // A path containing '..' fails resolveBackupArchivePath's containment
    // check — sweepExpiredJobs must log and continue, never throw, so one
    // corrupt row can't abort the whole sweep.
    const expired = job({ id: 'evil', archivePath: '../../etc/passwd' });
    const d = deps({ listExpiredBackupJobs: vi.fn(async () => [expired]) });
    await expect(sweepExpiredJobs(d, 1_000_000_000)).resolves.toBeUndefined();
  });
});

describe('backupWorkerTickOnce', () => {
  it('sweeps expired jobs then claims and runs one queued job', async () => {
    const order: string[] = [];
    const claimed = job();
    const d = deps({
      listExpiredBackupJobs: vi.fn(async () => {
        order.push('sweep');
        return [];
      }),
      claimNextBackupJob: vi.fn(async () => {
        order.push('claim');
        return claimed;
      }),
    });

    await backupWorkerTickOnce(d);

    expect(order).toEqual(['sweep', 'claim']);
  });
});

describe('backupWorkerEnabled', () => {
  it('is false by default — opt-in, not opt-out', () => {
    delete process.env.SOVEREIGN_BACKUP_WORKER_ENABLED;
    expect(backupWorkerEnabled()).toBe(false);
  });

  it('is true for "1" or "true"', () => {
    process.env.SOVEREIGN_BACKUP_WORKER_ENABLED = '1';
    expect(backupWorkerEnabled()).toBe(true);
    process.env.SOVEREIGN_BACKUP_WORKER_ENABLED = 'true';
    expect(backupWorkerEnabled()).toBe(true);
  });
});

describe('startBackupWorker / stopBackupWorker', () => {
  it('does not start a tick loop or touch the DB by default (not enabled)', async () => {
    delete process.env.SOVEREIGN_BACKUP_WORKER_ENABLED;
    vi.useFakeTimers();
    const d = deps();
    startBackupWorker(d, 1000);
    await vi.advanceTimersByTimeAsync(5000);
    expect(d.claimNextBackupJob).not.toHaveBeenCalled();
    expect(d.reclaimStuckBackupJobs).not.toHaveBeenCalled();
  });

  it('reclaims stuck jobs once at startup when enabled', async () => {
    process.env.SOVEREIGN_BACKUP_WORKER_ENABLED = '1';
    const d = deps({ reclaimStuckBackupJobs: vi.fn(async () => 2) });
    startBackupWorker(d, 60_000);
    // reclaimStuckJobsOnBoot is fire-and-forget — flush microtasks.
    await Promise.resolve();
    await Promise.resolve();
    expect(d.reclaimStuckBackupJobs).toHaveBeenCalledTimes(1);
  });

  it('ticks on the configured interval and stops cleanly when enabled', async () => {
    process.env.SOVEREIGN_BACKUP_WORKER_ENABLED = '1';
    vi.useFakeTimers();
    const d = deps();
    startBackupWorker(d, 1000);
    await vi.advanceTimersByTimeAsync(1000);
    expect(d.claimNextBackupJob).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1000);
    expect(d.claimNextBackupJob).toHaveBeenCalledTimes(2);

    stopBackupWorker();
    await vi.advanceTimersByTimeAsync(5000);
    expect(d.claimNextBackupJob).toHaveBeenCalledTimes(2);
  });

  it('calling start twice does not double the tick loop', async () => {
    process.env.SOVEREIGN_BACKUP_WORKER_ENABLED = '1';
    vi.useFakeTimers();
    const d = deps();
    startBackupWorker(d, 1000);
    startBackupWorker(d, 1000);
    await vi.advanceTimersByTimeAsync(1000);
    expect(d.claimNextBackupJob).toHaveBeenCalledTimes(1);
  });
});
