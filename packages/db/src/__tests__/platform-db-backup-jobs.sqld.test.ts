import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type PlatformDb, createClient } from '../client';
import {
  bootstrapPlatformDb,
  claimNextBackupJob,
  completeBackupJobFailure,
  completeBackupJobSuccess,
  enqueueBackupJob,
  getBackupJob,
  listExpiredBackupJobs,
  reclaimStuckBackupJobs,
} from '../platform-db';
import { dropSqldNamespace, provisionSqldNamespace } from '../sqld';

/**
 * Live-sqld coverage for the backup_jobs claim/complete/sweep primitives
 * (RFC 0084, epic task 8.16) — the SQLite-dialect analogue of a `.pg.test.ts`
 * file (see `sqld.sqld.test.ts`'s identical reasoning). Skipped unless
 * TEST_SQLD_URL/TEST_SQLD_ADMIN_URL point at a live sqld instance:
 *
 *   TEST_SQLD_URL=http://localhost:28080 \
 *   TEST_SQLD_ADMIN_URL=http://localhost:28081 \
 *   pnpm test
 *
 * Runs against a dedicated, disposable sqld namespace (not the default one)
 * so a full bootstrapPlatformDb() here never collides with a developer's own
 * dev data. Every test cleans up whatever rows it created (drains any
 * `queued`/`running` job it left behind) rather than relying on the
 * namespace being empty of other tests' leftovers — `claimNextBackupJob`
 * picks up the *oldest* queued job across the whole namespace, so a leaked
 * row from one test would silently steal a claim meant for another.
 */
const SQLD_URL = process.env.TEST_SQLD_URL;
const SQLD_ADMIN_URL = process.env.TEST_SQLD_ADMIN_URL;
const LIVE = Boolean(SQLD_URL && SQLD_ADMIN_URL);

function withSqldEnv<T>(fn: () => T): T {
  const originalDialect = process.env.DB_DIALECT;
  const originalUrl = process.env.SQLD_URL;
  const originalAdminUrl = process.env.SQLD_ADMIN_URL;
  process.env.DB_DIALECT = 'sqlite';
  process.env.SQLD_URL = SQLD_URL;
  process.env.SQLD_ADMIN_URL = SQLD_ADMIN_URL;
  try {
    return fn();
  } finally {
    if (originalDialect === undefined) delete process.env.DB_DIALECT;
    else process.env.DB_DIALECT = originalDialect;
    if (originalUrl === undefined) delete process.env.SQLD_URL;
    else process.env.SQLD_URL = originalUrl;
    if (originalAdminUrl === undefined) delete process.env.SQLD_ADMIN_URL;
    else process.env.SQLD_ADMIN_URL = originalAdminUrl;
  }
}

describe.skipIf(!LIVE)('backup_jobs claim/complete/sweep (RFC 0084, epic task 8.16)', () => {
  const namespace = `test_backup_jobs_${randomUUID().replace(/-/g, '_')}`;
  let pdb: PlatformDb;

  beforeAll(async () => {
    await provisionSqldNamespace(SQLD_ADMIN_URL as string, namespace);
    pdb = withSqldEnv(() => createClient({ dialect: 'sqlite', namespace }));
    await bootstrapPlatformDb(pdb);
  });

  afterAll(async () => {
    await dropSqldNamespace(SQLD_ADMIN_URL as string, namespace);
  });

  function newJobId(): string {
    return `job_${randomUUID().replace(/-/g, '')}`;
  }

  async function enqueue(
    id: string,
    overrides: Partial<Parameters<typeof enqueueBackupJob>[1]> = {},
  ) {
    return enqueueBackupJob(pdb, {
      id,
      tenantId: 'default',
      scope: 'instance',
      archivePath: `/backups/${id}.tar.gz`,
      ...overrides,
    });
  }

  /** Claim+fail whatever is still queued/running for `id`, if anything — idempotent cleanup. */
  async function drain(id: string): Promise<void> {
    const row = await getBackupJob(pdb, id);
    if (!row || row.status === 'complete' || row.status === 'failed') return;
    if (row.status === 'queued') await claimNextBackupJob(pdb, Math.floor(Date.now() / 1000));
    await completeBackupJobFailure(pdb, id, 'test cleanup');
  }

  it('enqueues a job queued, then reads it back', async () => {
    const id = newJobId();
    const enqueued = await enqueue(id);
    expect(enqueued.status).toBe('queued');
    expect(enqueued.sizeBytes).toBe(0);
    expect(enqueued.startedAt).toBeNull();

    const fetched = await getBackupJob(pdb, id);
    expect(fetched).toMatchObject({ id, status: 'queued', scope: 'instance' });

    await drain(id);
  });

  it('claimNextBackupJob claims a queued job and marks it running', async () => {
    const id = newJobId();
    await enqueue(id);

    const claimed = await claimNextBackupJob(pdb, Math.floor(Date.now() / 1000));
    expect(claimed?.id).toBe(id);
    expect(claimed?.status).toBe('running');
    expect(claimed?.startedAt).not.toBeNull();

    await completeBackupJobFailure(pdb, id, 'test cleanup');
  });

  it('never returns the same job twice while it is running', async () => {
    const id = newJobId();
    await enqueue(id);

    const first = await claimNextBackupJob(pdb, Math.floor(Date.now() / 1000));
    expect(first?.id).toBe(id);

    const second = await claimNextBackupJob(pdb, Math.floor(Date.now() / 1000));
    expect(second?.id).not.toBe(id);

    await completeBackupJobFailure(pdb, id, 'test cleanup');
    if (second) await drain(second.id);
  });

  it('completeBackupJobSuccess transitions running -> complete and records the result', async () => {
    const id = newJobId();
    await enqueue(id, { archivePath: `/backups/${id}-placeholder.tar.gz` });
    const claimed = await claimNextBackupJob(pdb, Math.floor(Date.now() / 1000));
    expect(claimed?.id).toBe(id);

    await completeBackupJobSuccess(pdb, id, {
      archivePath: `/backups/${id}.tar.gz`,
      sizeBytes: 12345,
    });

    const done = await getBackupJob(pdb, id);
    expect(done).toMatchObject({
      status: 'complete',
      archivePath: `/backups/${id}.tar.gz`,
      sizeBytes: 12345,
    });
    expect(done?.completedAt).not.toBeNull();
  });

  it('completeBackupJobFailure transitions running -> failed and records the error', async () => {
    const id = newJobId();
    await enqueue(id);
    await claimNextBackupJob(pdb, Math.floor(Date.now() / 1000));

    await completeBackupJobFailure(pdb, id, 'sv backup exited with code 1');

    const done = await getBackupJob(pdb, id);
    expect(done).toMatchObject({ status: 'failed', errorMessage: 'sv backup exited with code 1' });
    expect(done?.completedAt).not.toBeNull();
  });

  it('completeBackupJobSuccess is a no-op for a job that is not running', async () => {
    const id = newJobId();
    await enqueue(id);
    // Still queued — never claimed.
    await completeBackupJobSuccess(pdb, id, {
      archivePath: '/should/not/apply.tar.gz',
      sizeBytes: 1,
    });

    const untouched = await getBackupJob(pdb, id);
    expect(untouched?.status).toBe('queued');

    await drain(id);
  });

  it('listExpiredBackupJobs returns only complete/failed jobs past expiresAt', async () => {
    const now = Math.floor(Date.now() / 1000);

    const expiredComplete = newJobId();
    await enqueue(expiredComplete, { expiresInSeconds: -10 });
    await claimNextBackupJob(pdb, now);
    await completeBackupJobSuccess(pdb, expiredComplete, {
      archivePath: `/backups/${expiredComplete}.tar.gz`,
      sizeBytes: 1,
    });

    const notYetExpired = newJobId();
    await enqueue(notYetExpired, { expiresInSeconds: 10_000 });
    await claimNextBackupJob(pdb, now);
    await completeBackupJobSuccess(pdb, notYetExpired, {
      archivePath: `/backups/${notYetExpired}.tar.gz`,
      sizeBytes: 1,
    });

    const stillQueuedButExpired = newJobId();
    await enqueue(stillQueuedButExpired, { expiresInSeconds: -10 });

    const expired = await listExpiredBackupJobs(pdb, now);
    const expiredIds = expired.map((j) => j.id);
    expect(expiredIds).toContain(expiredComplete);
    expect(expiredIds).not.toContain(notYetExpired);
    expect(expiredIds).not.toContain(stillQueuedButExpired);

    await drain(stillQueuedButExpired);
  });

  it('reclaimStuckBackupJobs fails every running job and leaves others untouched', async () => {
    const stuck = newJobId();
    await enqueue(stuck);
    await claimNextBackupJob(pdb, Math.floor(Date.now() / 1000)); // claim, leave "running" — simulates a crash mid-job

    const stillQueued = newJobId();
    await enqueue(stillQueued);

    const count = await reclaimStuckBackupJobs(
      pdb,
      'Backup worker restarted while this job was running.',
    );
    expect(count).toBeGreaterThanOrEqual(1);

    const reclaimed = await getBackupJob(pdb, stuck);
    expect(reclaimed).toMatchObject({
      status: 'failed',
      errorMessage: 'Backup worker restarted while this job was running.',
    });

    const untouched = await getBackupJob(pdb, stillQueued);
    expect(untouched?.status).toBe('queued');

    await drain(stillQueued);
  });
});
