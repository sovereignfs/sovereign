import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getNotificationPrefs, recordEmailDelivery, sendPlatformEmail, recipientHash } = vi.hoisted(
  () => ({
    getNotificationPrefs: vi.fn(),
    recordEmailDelivery: vi.fn(async () => undefined),
    sendPlatformEmail: vi.fn<
      () => Promise<{ status: 'skipped' | 'sent' | 'failed'; errorCode?: string }>
    >(async () => ({ status: 'sent' })),
    recipientHash: vi.fn((email: string) => `hash:${email}`),
  }),
);

vi.mock('@sovereignfs/db', () => ({
  getNotificationPrefs,
  recordEmailDelivery,
}));

vi.mock('../platform-email', () => ({
  sendPlatformEmail,
  recipientHash,
}));

vi.mock('../logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { deliverCommunicationEmail } from '../communication-email';

const pdb = {} as import('@sovereignfs/db').PlatformDb;

const BASE_INPUT = {
  recipientUserId: 'u1',
  recipientEmail: 'u1@example.test',
  subject: 'Scheduled maintenance',
  text: 'We will be down for maintenance tonight.',
  html: '<p>We will be down for maintenance tonight.</p>',
  source: 'console' as const,
  templateId: 'broadcast',
};

describe('deliverCommunicationEmail (RFC 0062 §6)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sendPlatformEmail.mockResolvedValue({ status: 'sent' as const });
  });

  it('skips and records a log row without calling sendPlatformEmail when the recipient has not opted in', async () => {
    getNotificationPrefs.mockResolvedValueOnce({
      mutedCategories: [],
      pollIntervalSecs: 30,
      communicationEmail: false,
    });

    const result = await deliverCommunicationEmail(pdb, BASE_INPUT);

    expect(result).toEqual({ status: 'skipped', errorCode: 'COMMUNICATION_EMAIL_DISABLED' });
    expect(sendPlatformEmail).not.toHaveBeenCalled();
    expect(recordEmailDelivery).toHaveBeenCalledWith(
      pdb,
      expect.objectContaining({
        deliveryClass: 'communication',
        templateId: 'broadcast',
        source: 'console',
        recipientUserId: 'u1',
        recipientEmailHash: 'hash:u1@example.test',
        status: 'skipped',
        errorCode: 'COMMUNICATION_EMAIL_DISABLED',
      }),
    );
  });

  it('delegates to sendPlatformEmail when the recipient has opted in', async () => {
    getNotificationPrefs.mockResolvedValueOnce({
      mutedCategories: [],
      pollIntervalSecs: 30,
      communicationEmail: true,
    });

    const result = await deliverCommunicationEmail(pdb, BASE_INPUT);

    expect(result).toEqual({ status: 'sent' });
    expect(recordEmailDelivery).not.toHaveBeenCalled();
    expect(sendPlatformEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        deliveryClass: 'communication',
        templateId: 'broadcast',
        toUserId: 'u1',
        toEmail: 'u1@example.test',
        source: 'console',
        subject: BASE_INPUT.subject,
        text: BASE_INPUT.text,
        html: BASE_INPUT.html,
      }),
    );
  });

  it('propagates sendPlatformEmail failures for an opted-in recipient', async () => {
    getNotificationPrefs.mockResolvedValueOnce({
      mutedCategories: [],
      pollIntervalSecs: 30,
      communicationEmail: true,
    });
    sendPlatformEmail.mockResolvedValueOnce({ status: 'failed', errorCode: 'ECONNREFUSED' });

    const result = await deliverCommunicationEmail(pdb, BASE_INPUT);

    expect(result).toEqual({ status: 'failed', errorCode: 'ECONNREFUSED' });
  });
});
