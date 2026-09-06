import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `/api/admin/backup-jobs` — Console's instance backup page. The worker is
 * opt-in and the SQLite path is unimplemented, so GET must say whether a
 * trigger can do anything and POST must refuse (rather than enqueue a job
 * that sits `queued` forever) when it can't, and refuse a duplicate while
 * one is still in flight.
 */

const enqueueBackupJob = vi.fn();
const listBackupJobs = vi.fn();
const resolveDialect = vi.fn();
const backupWorkerEnabled = vi.fn();
const storeBackupPassphrase = vi.fn();

vi.mock('@sovereignfs/db', () => ({
  DEFAULT_TENANT_ID: 'default',
  enqueueBackupJob: (...args: unknown[]) => enqueueBackupJob(...args),
  listBackupJobs: (...args: unknown[]) => listBackupJobs(...args),
  resolveDialect: () => resolveDialect(),
}));
vi.mock('@sovereignfs/manifest', () => ({ manifestDatabaseIsolation: () => 'shared' }));
vi.mock('../admin-guard', () => ({ checkAdminKey: () => null }));
vi.mock('../backup-download', () => ({
  backupArchivePathForJob: (id: string) => `/backups/${id}.tar`,
  backupJobDownloadUrl: () => null,
}));
vi.mock('../backup-passphrase-store', () => ({
  storeBackupPassphrase: (...args: unknown[]) => storeBackupPassphrase(...args),
}));
vi.mock('../backup-run', () => ({ resolveInstanceGitPushConfig: () => null }));
vi.mock('../backup-worker', () => ({ backupWorkerEnabled: () => backupWorkerEnabled() }));
vi.mock('../db', () => ({ getPlatformDb: () => Promise.resolve({}) }));
vi.mock('../registry', () => ({ getInstalledPlugins: () => [] }));

const { GET, POST } = await import('../../app/api/admin/backup-jobs/route');

function post(body: Record<string, unknown>) {
  return POST(
    new Request('http://localhost/api/admin/backup-jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  resolveDialect.mockReturnValue({ dialect: 'postgres', url: 'postgres://x' });
  backupWorkerEnabled.mockReturnValue(true);
  listBackupJobs.mockResolvedValue([]);
  enqueueBackupJob.mockResolvedValue(undefined);
});

describe('GET /api/admin/backup-jobs', () => {
  it('reports the worker and dialect flags alongside the job list', async () => {
    const res = await GET(new Request('http://localhost/api/admin/backup-jobs'));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      jobs: [],
      workerEnabled: true,
      dialectSupported: true,
    });
  });

  it('flags an unsupported dialect and a disabled worker', async () => {
    resolveDialect.mockReturnValue({ dialect: 'sqlite' });
    backupWorkerEnabled.mockReturnValue(false);
    const res = await GET(new Request('http://localhost/api/admin/backup-jobs'));
    expect(await res.json()).toMatchObject({ workerEnabled: false, dialectSupported: false });
  });

  it('treats a dialect that cannot be resolved as unsupported instead of throwing', async () => {
    resolveDialect.mockImplementation(() => {
      throw new Error('DB_DIALECT is required');
    });
    const res = await GET(new Request('http://localhost/api/admin/backup-jobs'));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ dialectSupported: false });
  });
});

describe('POST /api/admin/backup-jobs', () => {
  it('enqueues one instance job and stores the passphrase when everything is available', async () => {
    const res = await post({ passphrase: 'correct horse battery' });
    expect(res.status).toBe(202);
    expect(enqueueBackupJob).toHaveBeenCalledTimes(1);
    expect(storeBackupPassphrase).toHaveBeenCalledTimes(1);
  });

  it('refuses with 409 while an instance job is still queued or running', async () => {
    listBackupJobs.mockResolvedValue([{ id: 'job-0', status: 'running' }]);
    const res = await post({ passphrase: 'correct horse battery' });
    expect(res.status).toBe(409);
    expect(enqueueBackupJob).not.toHaveBeenCalled();
    expect(storeBackupPassphrase).not.toHaveBeenCalled();
  });

  it('refuses with 503 when the backup worker is not enabled', async () => {
    backupWorkerEnabled.mockReturnValue(false);
    const res = await post({ passphrase: 'correct horse battery' });
    expect(res.status).toBe(503);
    expect(enqueueBackupJob).not.toHaveBeenCalled();
  });

  it('refuses with 400 on a SQLite instance', async () => {
    resolveDialect.mockReturnValue({ dialect: 'sqlite' });
    const res = await post({ passphrase: 'correct horse battery' });
    expect(res.status).toBe(400);
    expect(enqueueBackupJob).not.toHaveBeenCalled();
  });

  it('still requires a passphrase first', async () => {
    const res = await post({});
    expect(res.status).toBe(400);
    expect(listBackupJobs).not.toHaveBeenCalled();
  });
});
