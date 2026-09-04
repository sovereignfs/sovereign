import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('node:crypto', () => ({ randomUUID: vi.fn(() => 'job-1') }));
vi.mock('@sovereignfs/db', () => ({
  DEFAULT_TENANT_ID: 'default',
  enqueueBackupJob: vi.fn(),
  getPluginConnection: vi.fn(),
}));
vi.mock('@/src/backup-download', () => ({
  restoreFetchArchivePathForJob: vi.fn((jobId: string) => `/backups/restore-${jobId}.age`),
}));
vi.mock('@/src/db', () => ({ getPlatformDb: vi.fn(async () => ({})) }));

import { enqueueBackupJob, getPluginConnection } from '@sovereignfs/db';
import { POST } from '../../app/api/account/restore-jobs/route';

function request(
  body: Record<string, unknown> | null,
  headers: Record<string, string> = { 'x-sovereign-user-id': 'user-1' },
): Request {
  return new Request('http://localhost/api/account/restore-jobs', {
    method: 'POST',
    headers: { ...headers, 'content-type': 'application/json' },
    body: body === null ? undefined : JSON.stringify(body),
  });
}

afterEach(() => {
  vi.clearAllMocks();
});

describe('POST /api/account/restore-jobs', () => {
  it('rejects an unauthenticated request without enqueueing anything', async () => {
    const res = await POST(request({ destinationId: 'dest-1', tag: 'sv-backup/x/v1' }, {}));
    expect(res.status).toBe(401);
    expect(enqueueBackupJob).not.toHaveBeenCalled();
  });

  it('rejects a missing destinationId or tag', async () => {
    const res1 = await POST(request({ tag: 'sv-backup/x/v1' }));
    expect(res1.status).toBe(400);
    const res2 = await POST(request({ destinationId: 'dest-1' }));
    expect(res2.status).toBe(400);
    expect(enqueueBackupJob).not.toHaveBeenCalled();
  });

  it('rejects a non-JSON body cleanly rather than throwing', async () => {
    const req = new Request('http://localhost/api/account/restore-jobs', {
      method: 'POST',
      headers: { 'x-sovereign-user-id': 'user-1' },
      body: 'not json',
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    expect(enqueueBackupJob).not.toHaveBeenCalled();
  });

  it('rejects an unknown/foreign destination with 400 before ever enqueueing', async () => {
    vi.mocked(getPluginConnection).mockResolvedValue(undefined);
    const res = await POST(request({ destinationId: 'dest-1', tag: 'sv-backup/x/v1' }));
    expect(res.status).toBe(400);
    expect(enqueueBackupJob).not.toHaveBeenCalled();
    expect(getPluginConnection).toHaveBeenCalledWith(
      {},
      'dest-1',
      expect.objectContaining({ pluginId: 'fs.sovereign.account', userId: 'user-1' }),
    );
  });

  it('rejects an already-disconnected destination with 400', async () => {
    vi.mocked(getPluginConnection).mockResolvedValue({
      id: 'dest-1',
      status: 'disconnected',
    } as never);
    const res = await POST(request({ destinationId: 'dest-1', tag: 'sv-backup/x/v1' }));
    expect(res.status).toBe(400);
    expect(enqueueBackupJob).not.toHaveBeenCalled();
  });

  it('enqueues a restore-fetch job and returns its id', async () => {
    vi.mocked(getPluginConnection).mockResolvedValue({
      id: 'dest-1',
      status: 'connected',
    } as never);
    vi.mocked(enqueueBackupJob).mockResolvedValue({ id: 'job-1' } as never);

    const res = await POST(request({ destinationId: 'dest-1', tag: 'sv-backup/x/v1' }));
    expect(res.status).toBe(202);
    const data = (await res.json()) as { jobId: string };
    expect(data.jobId).toBe('job-1');

    expect(enqueueBackupJob).toHaveBeenCalledWith(
      {},
      expect.objectContaining({
        id: 'job-1',
        scope: 'user',
        requestedByUserId: 'user-1',
        archivePath: '/backups/restore-job-1.age',
        kind: 'restore-fetch',
        optionsJson: JSON.stringify({ destinationId: 'dest-1', tag: 'sv-backup/x/v1' }),
      }),
    );
  });
});
