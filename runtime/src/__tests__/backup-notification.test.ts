import { beforeEach, describe, expect, it, vi } from 'vitest';

const { sendNotification, getPlatformDb, getBroker, publish, fanOutPushToUser, warn } = vi.hoisted(
  () => ({
    sendNotification: vi.fn(async () => undefined),
    getPlatformDb: vi.fn(async () => ({ dialect: 'sqlite' as const, db: {} })),
    getBroker: vi.fn(),
    publish: vi.fn(async () => undefined),
    fanOutPushToUser: vi.fn(async () => undefined),
    warn: vi.fn<(msg: string, meta?: Record<string, unknown>) => void>(),
  }),
);

vi.mock('@sovereignfs/db', () => ({ sendNotification }));
vi.mock('../db', () => ({ getPlatformDb }));
vi.mock('../notification-broker', () => ({ getBroker }));
vi.mock('../push', () => ({ fanOutPushToUser }));
vi.mock('../logger', () => ({ logger: { warn, error: vi.fn(), info: vi.fn() } }));

// The real (unmocked) module under test.
const { notifyBackupCompletion } = await import('../backup-notification');

describe('notifyBackupCompletion', () => {
  beforeEach(() => {
    sendNotification.mockClear();
    getPlatformDb.mockClear();
    getBroker.mockReset();
    getBroker.mockReturnValue({ publish });
    publish.mockClear();
    fanOutPushToUser.mockClear();
    warn.mockClear();
  });

  it('sends a notification, broker publish, and push for a completed job with a known recipient', async () => {
    await notifyBackupCompletion({
      jobId: 'job-1',
      scope: 'instance',
      status: 'complete',
      recipientUserId: 'user-1',
    });

    expect(sendNotification).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        recipientUserId: 'user-1',
        source: 'backup',
        sourceType: 'platform',
        title: 'Backup complete',
        category: 'backup',
      }),
    );
    expect(publish).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ userId: 'user-1', title: 'Backup complete', category: 'backup' }),
    );
    expect(fanOutPushToUser).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ title: 'Backup complete', category: 'backup' }),
    );
    expect(warn).not.toHaveBeenCalled();
  });

  it('sends a notification, broker publish, and push for a failed job with a known recipient, including the error in the title', async () => {
    await notifyBackupCompletion({
      jobId: 'job-2',
      scope: 'user',
      status: 'failed',
      errorMessage: 'sv backup exited with code 1',
      recipientUserId: 'user-2',
    });

    expect(sendNotification).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        recipientUserId: 'user-2',
        source: 'backup',
        sourceType: 'platform',
        title: 'Backup failed: sv backup exited with code 1',
        category: 'backup',
      }),
    );
    expect(publish).toHaveBeenCalledWith(
      'user-2',
      expect.objectContaining({ title: 'Backup failed: sv backup exited with code 1' }),
    );
    expect(fanOutPushToUser).toHaveBeenCalledWith(
      'user-2',
      expect.objectContaining({ title: 'Backup failed: sv backup exited with code 1' }),
    );
  });

  it('logs a clear warning and sends nothing when recipientUserId is null (instance-scope, no requester)', async () => {
    await notifyBackupCompletion({
      jobId: 'job-3',
      scope: 'instance',
      status: 'complete',
      recipientUserId: null,
    });

    expect(sendNotification).not.toHaveBeenCalled();
    expect(publish).not.toHaveBeenCalled();
    expect(fanOutPushToUser).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('admin fan-out is not implemented'),
      expect.objectContaining({ jobId: 'job-3', scope: 'instance' }),
    );
  });

  it('still writes the notification row and calls the push fan-out when no broker is configured (polling-only deployment), skipping only the broker publish', async () => {
    getBroker.mockReturnValue(null);

    await notifyBackupCompletion({
      jobId: 'job-4',
      scope: 'instance',
      status: 'complete',
      recipientUserId: 'user-1',
    });

    expect(sendNotification).toHaveBeenCalled();
    expect(fanOutPushToUser).toHaveBeenCalled();
    expect(publish).not.toHaveBeenCalled();
  });
});
