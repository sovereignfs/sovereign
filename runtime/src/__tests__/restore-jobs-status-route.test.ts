import { afterEach, describe, expect, it, vi } from 'vitest';
import type { BackupJobRow } from '@sovereignfs/db';

vi.mock('@sovereignfs/db', () => ({ getBackupJob: vi.fn() }));
vi.mock('@/src/backup-download', () => ({
  createBackupDownloadToken: vi.fn(() => 'signed-token'),
}));
vi.mock('@/src/db', () => ({ getPlatformDb: vi.fn(async () => ({})) }));

import { getBackupJob } from '@sovereignfs/db';
import { GET } from '../../app/api/account/restore-jobs/[id]/route';

function job(overrides: Partial<BackupJobRow> = {}): BackupJobRow {
  return {
    id: 'job-1',
    tenantId: 'default',
    scope: 'user',
    requestedByUserId: 'user-1',
    status: 'queued',
    optionsJson: null,
    archivePath: '/backups/restore-job-1.age',
    sizeBytes: 0,
    errorMessage: null,
    createdAt: 1000,
    startedAt: null,
    completedAt: null,
    expiresAt: 2000,
    pushStatus: null,
    pushError: null,
    kind: 'restore-fetch',
    ...overrides,
  };
}

function request(headers: Record<string, string> = { 'x-sovereign-user-id': 'user-1' }): Request {
  return new Request('http://localhost/api/account/restore-jobs/job-1', { headers });
}

function params(id = 'job-1'): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}

afterEach(() => {
  vi.clearAllMocks();
});

describe('GET /api/account/restore-jobs/[id]', () => {
  it('rejects an unauthenticated request', async () => {
    const res = await GET(request({}), params());
    expect(res.status).toBe(401);
    expect(getBackupJob).not.toHaveBeenCalled();
  });

  it('404s for a job that does not exist', async () => {
    vi.mocked(getBackupJob).mockResolvedValue(undefined);
    const res = await GET(request(), params());
    expect(res.status).toBe(404);
  });

  it('404s for a job belonging to a different user', async () => {
    vi.mocked(getBackupJob).mockResolvedValue(job({ requestedByUserId: 'someone-else' }));
    const res = await GET(request(), params());
    expect(res.status).toBe(404);
  });

  it('404s for a real backup job (kind !== restore-fetch), not just any user-scope job', async () => {
    vi.mocked(getBackupJob).mockResolvedValue(job({ kind: 'backup' }));
    const res = await GET(request(), params());
    expect(res.status).toBe(404);
  });

  it('404s for an instance-scope job', async () => {
    vi.mocked(getBackupJob).mockResolvedValue(job({ scope: 'instance', requestedByUserId: null }));
    const res = await GET(request(), params());
    expect(res.status).toBe(404);
  });

  it('returns status with no download link while queued/running', async () => {
    vi.mocked(getBackupJob).mockResolvedValue(job({ status: 'running' }));
    const res = await GET(request(), params());
    expect(res.status).toBe(200);
    const data = (await res.json()) as { status: string; downloadUrl: string | null };
    expect(data.status).toBe('running');
    expect(data.downloadUrl).toBeNull();
  });

  it('returns the error message for a failed job', async () => {
    vi.mocked(getBackupJob).mockResolvedValue(
      job({ status: 'failed', errorMessage: 'git fetch failed: unreachable remote' }),
    );
    const res = await GET(request(), params());
    const data = (await res.json()) as { errorMessage: string | null };
    expect(data.errorMessage).toBe('git fetch failed: unreachable remote');
  });

  it('includes a signed download URL once complete — the same route a real backup uses', async () => {
    vi.mocked(getBackupJob).mockResolvedValue(job({ status: 'complete', sizeBytes: 4096 }));
    const res = await GET(request(), params());
    const data = (await res.json()) as { downloadUrl: string; sizeBytes: number };
    expect(data.downloadUrl).toBe('/api/backup-jobs/job-1/download/signed-token');
    expect(data.sizeBytes).toBe(4096);
  });
});
