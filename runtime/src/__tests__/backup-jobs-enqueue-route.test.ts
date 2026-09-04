import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('node:crypto', () => ({ randomUUID: vi.fn(() => 'job-1') }));
vi.mock('@sovereignfs/db', () => ({
  DEFAULT_TENANT_ID: 'default',
  enqueueBackupJob: vi.fn(),
  getPluginConnection: vi.fn(),
}));
vi.mock('@/src/activity', () => ({ logActivity: vi.fn() }));
vi.mock('@/src/backup-download', () => ({
  backupArchivePathForJob: vi.fn((jobId: string, scope: string) => `/backups/${jobId}.${scope}`),
}));
vi.mock('@/src/backup-passphrase-store', () => ({ storeBackupPassphrase: vi.fn() }));
vi.mock('@/src/db', () => ({ getPlatformDb: vi.fn(async () => ({})) }));

import { enqueueBackupJob, getPluginConnection } from '@sovereignfs/db';
import { logActivity } from '@/src/activity';
import { storeBackupPassphrase } from '@/src/backup-passphrase-store';
import { POST } from '../../app/api/account/backup-jobs/route';

function request(
  body: Record<string, unknown> | null,
  headers: Record<string, string> = { 'x-sovereign-user-id': 'user-1' },
): Request {
  return new Request('http://localhost/api/account/backup-jobs', {
    method: 'POST',
    headers: { ...headers, 'content-type': 'application/json' },
    body: body === null ? undefined : JSON.stringify(body),
  });
}

afterEach(() => {
  vi.clearAllMocks();
});

describe('POST /api/account/backup-jobs', () => {
  it('rejects an unauthenticated request without enqueueing anything', async () => {
    const res = await POST(request({ passphrase: 'a real passphrase' }, {}));
    expect(res.status).toBe(401);
    expect(enqueueBackupJob).not.toHaveBeenCalled();
  });

  it('rejects a missing passphrase', async () => {
    const res = await POST(request({}));
    expect(res.status).toBe(400);
    expect(enqueueBackupJob).not.toHaveBeenCalled();
  });

  it('rejects a passphrase shorter than the minimum length', async () => {
    const res = await POST(request({ passphrase: 'short' }));
    expect(res.status).toBe(400);
    const data = (await res.json()) as { error: string };
    expect(data.error).toMatch(/at least 8 characters/);
    expect(enqueueBackupJob).not.toHaveBeenCalled();
  });

  it('rejects a non-JSON body cleanly rather than throwing', async () => {
    const req = new Request('http://localhost/api/account/backup-jobs', {
      method: 'POST',
      headers: { 'x-sovereign-user-id': 'user-1' },
      body: 'not json',
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    expect(enqueueBackupJob).not.toHaveBeenCalled();
  });

  it('enqueues a user-scope job, stores the passphrase, and returns the job id', async () => {
    vi.mocked(enqueueBackupJob).mockResolvedValue({
      id: 'job-1',
      tenantId: 'default',
      scope: 'user',
      requestedByUserId: 'user-1',
      status: 'queued',
      optionsJson: null,
      archivePath: '/backups/job-1.user',
      sizeBytes: 0,
      errorMessage: null,
      createdAt: 1000,
      startedAt: null,
      completedAt: null,
      expiresAt: 2000,
      pushStatus: null,
      pushError: null,
    });

    const res = await POST(
      request({
        passphrase: 'correct horse battery staple',
        includeFiles: false,
        excludePluginIds: ['com.example.notes'],
      }),
    );

    expect(res.status).toBe(202);
    const data = (await res.json()) as { jobId: string };
    expect(data.jobId).toBe('job-1');

    expect(enqueueBackupJob).toHaveBeenCalledWith(
      {},
      expect.objectContaining({
        scope: 'user',
        requestedByUserId: 'user-1',
        archivePath: '/backups/job-1.user',
        optionsJson: JSON.stringify({
          includeFiles: false,
          excludePluginIds: ['com.example.notes'],
          pushDestinationId: undefined,
        }),
      }),
    );
    expect(storeBackupPassphrase).toHaveBeenCalledWith('job-1', 'correct horse battery staple');
    expect(logActivity).toHaveBeenCalledWith(
      expect.objectContaining({ actorId: 'user-1', action: 'account.backup_requested' }),
    );
  });

  it('defaults includeFiles to true and excludePluginIds to undefined when omitted', async () => {
    vi.mocked(enqueueBackupJob).mockResolvedValue({
      id: 'job-2',
      tenantId: 'default',
      scope: 'user',
      requestedByUserId: 'user-1',
      status: 'queued',
      optionsJson: null,
      archivePath: '/backups/job-2.user',
      sizeBytes: 0,
      errorMessage: null,
      createdAt: 1000,
      startedAt: null,
      completedAt: null,
      expiresAt: 2000,
      pushStatus: null,
      pushError: null,
    });

    await POST(request({ passphrase: 'correct horse battery staple' }));

    expect(enqueueBackupJob).toHaveBeenCalledWith(
      {},
      expect.objectContaining({
        optionsJson: JSON.stringify({
          includeFiles: true,
          excludePluginIds: undefined,
          pushDestinationId: undefined,
        }),
      }),
    );
  });

  it('never stores the passphrase before the job row actually exists', async () => {
    vi.mocked(enqueueBackupJob).mockRejectedValue(new Error('db down'));
    await expect(POST(request({ passphrase: 'correct horse battery staple' }))).rejects.toThrow(
      'db down',
    );
    expect(storeBackupPassphrase).not.toHaveBeenCalled();
  });

  describe('pushDestinationId (workstream 0023 leg 3, epic 8.39)', () => {
    it('rejects an unknown/foreign destination with 400 before ever enqueueing', async () => {
      vi.mocked(getPluginConnection).mockResolvedValue(undefined);
      const res = await POST(
        request({ passphrase: 'correct horse battery staple', pushDestinationId: 'dest-1' }),
      );
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
      const res = await POST(
        request({ passphrase: 'correct horse battery staple', pushDestinationId: 'dest-1' }),
      );
      expect(res.status).toBe(400);
      expect(enqueueBackupJob).not.toHaveBeenCalled();
    });

    it('threads a valid pushDestinationId through into optionsJson', async () => {
      vi.mocked(getPluginConnection).mockResolvedValue({
        id: 'dest-1',
        status: 'connected',
      } as never);
      vi.mocked(enqueueBackupJob).mockResolvedValue({
        id: 'job-1',
        tenantId: 'default',
        scope: 'user',
        requestedByUserId: 'user-1',
        status: 'queued',
        optionsJson: null,
        archivePath: '/backups/job-1.user',
        sizeBytes: 0,
        errorMessage: null,
        createdAt: 1000,
        startedAt: null,
        completedAt: null,
        expiresAt: 2000,
        pushStatus: null,
        pushError: null,
      });

      await POST(
        request({ passphrase: 'correct horse battery staple', pushDestinationId: 'dest-1' }),
      );

      expect(enqueueBackupJob).toHaveBeenCalledWith(
        {},
        expect.objectContaining({
          optionsJson: JSON.stringify({
            includeFiles: true,
            excludePluginIds: undefined,
            pushDestinationId: 'dest-1',
          }),
        }),
      );
    });
  });
});
