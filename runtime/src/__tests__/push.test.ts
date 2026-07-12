import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// web-push and the DB layer are fully mocked — these tests exercise the
// fan-out's error handling (prune vs. log) and the VAPID-subject warning,
// not actual Web Push delivery.
vi.mock('web-push', () => ({
  default: {
    setVapidDetails: vi.fn(),
    sendNotification: vi.fn(),
  },
}));

const { deletePushSubscription, getNotificationPrefs, getPushSubscriptionsForUser, warn } =
  vi.hoisted(() => ({
    deletePushSubscription: vi.fn(async () => undefined),
    getNotificationPrefs: vi.fn(
      async (): Promise<{ mutedCategories: string[]; pollIntervalSecs: number }> => ({
        mutedCategories: [],
        pollIntervalSecs: 30,
      }),
    ),
    getPushSubscriptionsForUser: vi.fn(async () => [
      { endpoint: 'https://web.push.apple.com/QOnjBEyWiC6H', p256dh: 'k', auth: 'a' },
    ]),
    warn: vi.fn<(msg: string, meta?: Record<string, unknown>) => void>(),
  }));

vi.mock('@sovereignfs/db', () => ({
  deletePushSubscription,
  getNotificationPrefs,
  getPushSubscriptionsForUser,
  getPushSubscriptionsByUsers: vi.fn(async () => []),
}));

vi.mock('../db', () => ({
  getPlatformDb: vi.fn(async () => ({})),
}));

vi.mock('../logger', () => ({
  logger: {
    warn,
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

import webpush from 'web-push';
import { fanOutPushToUser, resetSubjectWarning } from '../push';

const sendNotification = vi.mocked(webpush.sendNotification);

function webPushError(statusCode: number, body?: string) {
  return Object.assign(new Error(`push failed with ${statusCode}`), { statusCode, body });
}

beforeEach(() => {
  process.env.VAPID_PUBLIC_KEY = 'pub';
  process.env.VAPID_PRIVATE_KEY = 'priv';
  process.env.VAPID_CONTACT = 'mailto:ops@example.com';
  resetSubjectWarning();
});

afterEach(() => {
  vi.clearAllMocks();
  delete process.env.VAPID_PUBLIC_KEY;
  delete process.env.VAPID_PRIVATE_KEY;
  delete process.env.VAPID_CONTACT;
});

describe('fanOutPushToUser', () => {
  it('no-ops without VAPID keys', async () => {
    delete process.env.VAPID_PUBLIC_KEY;
    await fanOutPushToUser('u1', { title: 'T' });
    expect(sendNotification).not.toHaveBeenCalled();
  });

  it('skips a muted category without sending', async () => {
    getNotificationPrefs.mockResolvedValueOnce({
      mutedCategories: ['info'],
      pollIntervalSecs: 30,
    });
    await fanOutPushToUser('u1', { title: 'T', category: 'info' });
    expect(sendNotification).not.toHaveBeenCalled();
  });

  it('sends to each subscription and logs nothing on success', async () => {
    sendNotification.mockResolvedValueOnce({} as never);
    await fanOutPushToUser('u1', { title: 'T' });
    expect(sendNotification).toHaveBeenCalledTimes(1);
    expect(warn).not.toHaveBeenCalled();
  });

  it('prunes the subscription on 410 Gone without logging a failure', async () => {
    sendNotification.mockRejectedValueOnce(webPushError(410));
    await fanOutPushToUser('u1', { title: 'T' });
    expect(deletePushSubscription).toHaveBeenCalledTimes(1);
    expect(warn).not.toHaveBeenCalled();
  });

  it('prunes on 404 too (some push services use it for gone subscriptions)', async () => {
    sendNotification.mockRejectedValueOnce(webPushError(404));
    await fanOutPushToUser('u1', { title: 'T' });
    expect(deletePushSubscription).toHaveBeenCalledTimes(1);
  });

  it('logs a warning with the status and push-service host on other failures — never the full endpoint', async () => {
    sendNotification.mockRejectedValueOnce(webPushError(403, 'BadJwtToken'));
    await fanOutPushToUser('u1', { title: 'T' });
    expect(deletePushSubscription).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledTimes(1);
    const [msg, fields] = warn.mock.calls[0] ?? [];
    expect(msg).toBe('push: send failed');
    expect(fields?.statusCode).toBe(403);
    expect(fields?.body).toBe('BadJwtToken');
    expect(fields?.pushService).toBe('web.push.apple.com');
    expect(JSON.stringify(fields)).not.toContain('QOnjBEyWiC6H');
  });

  it('warns once when VAPID_CONTACT is unset (APNs rejects the localhost default)', async () => {
    delete process.env.VAPID_CONTACT;
    sendNotification.mockResolvedValue({} as never);
    await fanOutPushToUser('u1', { title: 'T' });
    await fanOutPushToUser('u1', { title: 'T' });
    const subjectWarnings = warn.mock.calls.filter(([msg]) => msg.includes('VAPID_CONTACT'));
    expect(subjectWarnings).toHaveLength(1);
  });

  it('warns when VAPID_CONTACT itself points at localhost', async () => {
    process.env.VAPID_CONTACT = 'mailto:admin@localhost';
    sendNotification.mockResolvedValue({} as never);
    await fanOutPushToUser('u1', { title: 'T' });
    expect(warn.mock.calls.some(([msg]) => msg.includes('VAPID_CONTACT'))).toBe(true);
  });

  it('does not warn about the subject when VAPID_CONTACT is a real address', async () => {
    sendNotification.mockResolvedValue({} as never);
    await fanOutPushToUser('u1', { title: 'T' });
    expect(warn.mock.calls.some(([msg]) => msg.includes('VAPID_CONTACT'))).toBe(false);
  });
});
