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

const {
  deletePushSubscription,
  deletePushDeviceTokenByToken,
  getNotificationPrefs,
  getPushDeviceTokensForUser,
  getPushSubscriptionsForUser,
  touchPushDeviceToken,
  recordPushDelivery,
  logActivity,
  getInstanceKey,
  encryptPushPayload,
  warn,
  info,
} = vi.hoisted(() => ({
  deletePushSubscription: vi.fn(async () => undefined),
  deletePushDeviceTokenByToken: vi.fn(async () => undefined),
  getNotificationPrefs: vi.fn(
    async (): Promise<{ mutedCategories: string[]; pollIntervalSecs: number }> => ({
      mutedCategories: [],
      pollIntervalSecs: 30,
    }),
  ),
  getPushDeviceTokensForUser: vi.fn(async () => [] as unknown[]),
  getPushSubscriptionsForUser: vi.fn(async () => [
    { userId: 'u1', endpoint: 'https://web.push.apple.com/QOnjBEyWiC6H', p256dh: 'k', auth: 'a' },
  ]),
  touchPushDeviceToken: vi.fn(async () => undefined),
  recordPushDelivery: vi.fn(async () => undefined),
  logActivity: vi.fn(async () => undefined),
  getInstanceKey: vi.fn(async (): Promise<string | null> => 'test-instance-key'),
  encryptPushPayload: vi.fn(() => 'encrypted-blob'),
  warn: vi.fn<(msg: string, meta?: Record<string, unknown>) => void>(),
  info: vi.fn<(msg: string, meta?: Record<string, unknown>) => void>(),
}));

vi.mock('@sovereignfs/db', () => ({
  deletePushSubscription,
  deletePushDeviceTokenByToken,
  getNotificationPrefs,
  getPushDeviceTokensForUser,
  getPushSubscriptionsForUser,
  getPushSubscriptionsByUsers: vi.fn(async () => []),
  touchPushDeviceToken,
  recordPushDelivery,
}));

vi.mock('../db', () => ({
  getPlatformDb: vi.fn(async () => ({})),
}));

vi.mock('../activity', () => ({
  logActivity,
}));

vi.mock('../relay', () => ({
  getInstanceKey,
}));

vi.mock('../push-encryption', () => ({
  encryptPushPayload,
}));

vi.mock('../logger', () => ({
  logger: {
    warn,
    info,
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

import webpush from 'web-push';
import { fanOutPushToUser, resetSubjectWarning } from '../push';

const sendNotification = vi.mocked(webpush.sendNotification);

function nativeToken(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'dt1',
    userId: 'u1',
    platform: 'ios',
    deviceToken: 'device-token-abc',
    publicKey: 'base64-public-key',
    relayUrl: 'https://relay.sovereign.openfs.io',
    createdAt: 0,
    lastUsedAt: null,
    ...overrides,
  };
}

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

  // Every silent-return path must leave an info-level trace — push delivery is
  // fire-and-forget, so the log is the ONLY place an operator can see why no
  // push arrived (e.g. "user never enabled push on any device").
  it('logs the reason when the user has no subscriptions', async () => {
    getPushSubscriptionsForUser.mockResolvedValueOnce([]);
    await fanOutPushToUser('u1', { title: 'T' });
    expect(sendNotification).not.toHaveBeenCalled();
    expect(info.mock.calls.some(([msg]) => msg.includes('no push subscriptions'))).toBe(true);
  });

  it('logs the reason when VAPID keys are not configured', async () => {
    delete process.env.VAPID_PUBLIC_KEY;
    await fanOutPushToUser('u1', { title: 'T' });
    expect(info.mock.calls.some(([msg]) => msg.includes('VAPID keys not configured'))).toBe(true);
  });

  it('logs the reason when the category is muted', async () => {
    getNotificationPrefs.mockResolvedValueOnce({
      mutedCategories: ['info'],
      pollIntervalSecs: 30,
    });
    await fanOutPushToUser('u1', { title: 'T', category: 'info' });
    expect(info.mock.calls.some(([msg]) => msg.includes('category muted'))).toBe(true);
  });

  it('logs a fan-out summary with the delivered count on success', async () => {
    sendNotification.mockResolvedValueOnce({} as never);
    await fanOutPushToUser('u1', { title: 'T' });
    const summary = info.mock.calls.find(([msg]) => msg.includes('fan-out complete'));
    expect(summary).toBeDefined();
    expect(summary?.[1]?.devices).toBe(1);
    expect(summary?.[1]?.delivered).toBe(1);
    expect(summary?.[1]?.pushServices).toEqual(['web.push.apple.com']);
  });

  it('counts a failed send as not delivered in the summary', async () => {
    sendNotification.mockRejectedValueOnce(webPushError(403, 'BadJwtToken'));
    await fanOutPushToUser('u1', { title: 'T' });
    const summary = info.mock.calls.find(([msg]) => msg.includes('fan-out complete'));
    expect(summary?.[1]?.devices).toBe(1);
    expect(summary?.[1]?.delivered).toBe(0);
  });

  it('logs the prune at info level (routine hygiene, not a failure)', async () => {
    sendNotification.mockRejectedValueOnce(webPushError(410));
    await fanOutPushToUser('u1', { title: 'T' });
    const prune = info.mock.calls.find(([msg]) => msg.includes('pruned dead subscription'));
    expect(prune).toBeDefined();
    expect(prune?.[1]?.pushService).toBe('web.push.apple.com');
    expect(JSON.stringify(prune?.[1])).not.toContain('QOnjBEyWiC6H');
  });

  describe('push delivery logging (epic task 4.6)', () => {
    it('records a sent row without touching the activity log', async () => {
      sendNotification.mockResolvedValueOnce({} as never);
      await fanOutPushToUser('u1', { title: 'T', category: 'reminders' });
      expect(recordPushDelivery).toHaveBeenCalledTimes(1);
      expect(recordPushDelivery).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ userId: 'u1', status: 'sent', category: 'reminders' }),
      );
      expect(logActivity).not.toHaveBeenCalled();
    });

    it('records skipped + logs activity when VAPID is unconfigured', async () => {
      delete process.env.VAPID_PUBLIC_KEY;
      await fanOutPushToUser('u1', { title: 'T' });
      expect(recordPushDelivery).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          userId: 'u1',
          status: 'skipped',
          errorCode: 'VAPID_NOT_CONFIGURED',
        }),
      );
      expect(logActivity).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'push.delivery_failed',
          subjectUserId: 'u1',
          visibility: 'user',
        }),
      );
    });

    it('records skipped + logs activity when the category is muted', async () => {
      getNotificationPrefs.mockResolvedValueOnce({
        mutedCategories: ['info'],
        pollIntervalSecs: 30,
      });
      await fanOutPushToUser('u1', { title: 'T', category: 'info' });
      expect(recordPushDelivery).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ status: 'skipped', errorCode: 'CATEGORY_MUTED' }),
      );
      expect(logActivity).toHaveBeenCalledTimes(1);
    });

    it('records skipped + logs activity when the user has no subscriptions', async () => {
      getPushSubscriptionsForUser.mockResolvedValueOnce([]);
      await fanOutPushToUser('u1', { title: 'T' });
      expect(recordPushDelivery).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ status: 'skipped', errorCode: 'NO_SUBSCRIPTIONS' }),
      );
      expect(logActivity).toHaveBeenCalledTimes(1);
    });

    it('records pruned (not failed) on 410 and still logs activity, without leaking the endpoint', async () => {
      sendNotification.mockRejectedValueOnce(webPushError(410));
      await fanOutPushToUser('u1', { title: 'T' });
      expect(recordPushDelivery).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ status: 'pruned', pushService: 'web.push.apple.com' }),
      );
      const [call] = logActivity.mock.calls;
      expect(JSON.stringify(call)).not.toContain('QOnjBEyWiC6H');
    });

    it('records failed + logs activity on a real delivery error', async () => {
      sendNotification.mockRejectedValueOnce(webPushError(403, 'BadJwtToken'));
      await fanOutPushToUser('u1', { title: 'T' });
      expect(recordPushDelivery).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ status: 'failed', errorCode: '403' }),
      );
      expect(logActivity).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'push.delivery_failed', subjectUserId: 'u1' }),
      );
    });
  });

  describe('per-plugin icon default', () => {
    it('defaults icon to /plugin-icons/<source>.svg when unset', async () => {
      sendNotification.mockResolvedValueOnce({} as never);
      await fanOutPushToUser('u1', { title: 'T', source: 'fs.sovereign.tasks' });
      const [, body] = sendNotification.mock.calls[0] ?? [];
      expect(JSON.parse(body as string)).toMatchObject({
        icon: '/plugin-icons/fs.sovereign.tasks.svg',
      });
    });

    it('an explicit icon still wins over the plugin default', async () => {
      sendNotification.mockResolvedValueOnce({} as never);
      await fanOutPushToUser('u1', {
        title: 'T',
        source: 'fs.sovereign.tasks',
        icon: '/custom-icon.png',
      });
      const [, body] = sendNotification.mock.calls[0] ?? [];
      expect(JSON.parse(body as string)).toMatchObject({ icon: '/custom-icon.png' });
    });

    it('leaves icon undefined when there is no source and no explicit icon', async () => {
      sendNotification.mockResolvedValueOnce({} as never);
      await fanOutPushToUser('u1', { title: 'T' });
      const [, body] = sendNotification.mock.calls[0] ?? [];
      expect(JSON.parse(body as string).icon).toBeUndefined();
    });

    it('never leaks source into the payload actually sent to the push service', async () => {
      sendNotification.mockResolvedValueOnce({} as never);
      await fanOutPushToUser('u1', { title: 'T', source: 'fs.sovereign.tasks' });
      const [, body] = sendNotification.mock.calls[0] ?? [];
      expect(JSON.parse(body as string)).not.toHaveProperty('source');
    });
  });

  describe('native mobile push branch (RFC 0087, workstream 0005 leg 3)', () => {
    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it('is completely silent when the user has no registered device tokens', async () => {
      // Default mock already returns [] — explicit here for clarity.
      getPushDeviceTokensForUser.mockResolvedValueOnce([]);
      sendNotification.mockResolvedValueOnce({} as never);
      await fanOutPushToUser('u1', { title: 'T' });
      expect(getInstanceKey).not.toHaveBeenCalled();
      expect(encryptPushPayload).not.toHaveBeenCalled();
    });

    it('encrypts and forwards to the relay, then records sent and touches the token', async () => {
      getPushDeviceTokensForUser.mockResolvedValueOnce([nativeToken()]);
      sendNotification.mockResolvedValueOnce({} as never);
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ result: 'sent' }),
      });
      vi.stubGlobal('fetch', fetchMock);

      await fanOutPushToUser('u1', { title: 'T', category: 'reminders' });

      expect(encryptPushPayload).toHaveBeenCalledWith('base64-public-key', expect.anything());
      expect(fetchMock).toHaveBeenCalledWith(
        'https://relay.sovereign.openfs.io/v1/push',
        expect.objectContaining({ method: 'POST' }),
      );
      const [, init] = fetchMock.mock.calls[0] ?? [];
      const sentBody = JSON.parse((init as RequestInit).body as string);
      expect(sentBody).toEqual({
        deviceToken: 'device-token-abc',
        platform: 'ios',
        encryptedPayload: 'encrypted-blob',
        instanceKey: 'test-instance-key',
      });
      expect(touchPushDeviceToken).toHaveBeenCalledWith(expect.anything(), 'dt1');
      expect(recordPushDelivery).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          userId: 'u1',
          status: 'sent',
          category: 'reminders',
          pushService: 'relay.sovereign.openfs.io',
        }),
      );
    });

    it('prunes the device token when the relay reports invalid_token', async () => {
      getPushDeviceTokensForUser.mockResolvedValueOnce([nativeToken()]);
      sendNotification.mockResolvedValueOnce({} as never);
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({ ok: true, json: async () => ({ result: 'invalid_token' }) }),
      );

      await fanOutPushToUser('u1', { title: 'T' });

      expect(deletePushDeviceTokenByToken).toHaveBeenCalledWith(
        expect.anything(),
        'device-token-abc',
      );
      expect(recordPushDelivery).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ status: 'pruned', errorCode: 'invalid_token' }),
      );
    });

    it('records failed, without pruning, when the relay responds with a non-2xx status', async () => {
      getPushDeviceTokensForUser.mockResolvedValueOnce([nativeToken()]);
      sendNotification.mockResolvedValueOnce({} as never);
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503 }));

      await fanOutPushToUser('u1', { title: 'T' });

      expect(deletePushDeviceTokenByToken).not.toHaveBeenCalled();
      expect(recordPushDelivery).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ status: 'failed', errorCode: '503' }),
      );
    });

    it('records failed when enrollment fails, without attempting to encrypt or send', async () => {
      getPushDeviceTokensForUser.mockResolvedValueOnce([nativeToken()]);
      getInstanceKey.mockResolvedValueOnce(null);
      sendNotification.mockResolvedValueOnce({} as never);
      const fetchMock = vi.fn();
      vi.stubGlobal('fetch', fetchMock);

      await fanOutPushToUser('u1', { title: 'T' });

      expect(encryptPushPayload).not.toHaveBeenCalled();
      expect(fetchMock).not.toHaveBeenCalled();
      expect(recordPushDelivery).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ status: 'failed', errorCode: 'RELAY_ENROLLMENT_FAILED' }),
      );
    });

    it('records failed when encryption itself throws (malformed stored public key)', async () => {
      getPushDeviceTokensForUser.mockResolvedValueOnce([nativeToken()]);
      encryptPushPayload.mockImplementationOnce(() => {
        throw new Error('bad key');
      });
      sendNotification.mockResolvedValueOnce({} as never);
      vi.stubGlobal('fetch', vi.fn());

      await fanOutPushToUser('u1', { title: 'T' });

      expect(recordPushDelivery).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ status: 'failed', errorCode: 'ENCRYPTION_FAILED' }),
      );
    });

    it('records failed when the relay request itself throws (network error)', async () => {
      getPushDeviceTokensForUser.mockResolvedValueOnce([nativeToken()]);
      sendNotification.mockResolvedValueOnce({} as never);
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));

      await fanOutPushToUser('u1', { title: 'T' });

      expect(recordPushDelivery).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ status: 'failed', errorCode: 'ECONNREFUSED' }),
      );
    });

    it('delivers to both Web Push and native channels independently — one failing does not affect the other', async () => {
      getPushDeviceTokensForUser.mockResolvedValueOnce([nativeToken()]);
      // Web Push fails...
      sendNotification.mockRejectedValueOnce(webPushError(403, 'BadJwtToken'));
      // ...native succeeds.
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({ ok: true, json: async () => ({ result: 'sent' }) }),
      );

      await fanOutPushToUser('u1', { title: 'T' });

      expect(recordPushDelivery).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ status: 'failed', pushService: 'web.push.apple.com' }),
      );
      expect(recordPushDelivery).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ status: 'sent', pushService: 'relay.sovereign.openfs.io' }),
      );

      const summary = info.mock.calls.find(([msg]) => msg.includes('fan-out complete'));
      expect(summary?.[1]?.devices).toBe(2);
      expect(summary?.[1]?.delivered).toBe(1);
      expect(summary?.[1]?.pushServices).toEqual(
        expect.arrayContaining(['web.push.apple.com', 'relay.sovereign.openfs.io']),
      );
    });

    it('delivers via native push even when VAPID is not configured', async () => {
      delete process.env.VAPID_PUBLIC_KEY;
      getPushDeviceTokensForUser.mockResolvedValueOnce([nativeToken()]);
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({ ok: true, json: async () => ({ result: 'sent' }) }),
      );

      await fanOutPushToUser('u1', { title: 'T' });

      expect(sendNotification).not.toHaveBeenCalled();
      expect(recordPushDelivery).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ status: 'sent', pushService: 'relay.sovereign.openfs.io' }),
      );
    });

    it('is skipped entirely (like Web Push) when the category is muted', async () => {
      getPushDeviceTokensForUser.mockResolvedValueOnce([nativeToken()]);
      getNotificationPrefs.mockResolvedValueOnce({
        mutedCategories: ['info'],
        pollIntervalSecs: 30,
      });
      vi.stubGlobal('fetch', vi.fn());

      await fanOutPushToUser('u1', { title: 'T', category: 'info' });

      expect(getPushDeviceTokensForUser).not.toHaveBeenCalled();
    });
  });
});
