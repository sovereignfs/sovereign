import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@sovereignfs/db', () => ({
  getPlatformSetting: vi.fn(async () => null),
  setPlatformSetting: vi.fn(async () => undefined),
}));
vi.mock('@/src/capabilities', () => ({ hasCapability: vi.fn(() => true) }));
vi.mock('@/src/communication-email', () => ({
  deliverCommunicationEmail: vi.fn(async () => ({ status: 'sent' })),
  escapeHtml: (v: string) => v,
}));
vi.mock('@/src/db', () => ({ getPlatformDb: vi.fn(async () => ({})) }));
vi.mock('@/src/notification-delivery', () => ({
  deliverNotification: vi.fn(async () => ({ id: 'n1', outcome: 'delivered' })),
}));
vi.mock('@/src/sdk-host', () => ({ fetchDirectoryUsers: vi.fn(async () => []) }));

import { hasCapability } from '@/src/capabilities';
import { deliverCommunicationEmail } from '@/src/communication-email';
import { fetchDirectoryUsers } from '@/src/sdk-host';
import { POST } from '../../app/api/account/broadcast/route';

function request(body: Record<string, unknown>, role = 'platform:owner'): Request {
  return new Request('http://localhost/api/account/broadcast', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-sovereign-user-role': role },
    body: JSON.stringify(body),
  });
}

afterEach(() => {
  vi.clearAllMocks();
});

describe('POST /api/account/broadcast — communication email (RFC 0062 §6)', () => {
  it('rejects a caller without console:access before touching email delivery', async () => {
    vi.mocked(hasCapability).mockReturnValueOnce(false);
    const res = await POST(request({ recipientUserIds: ['u1'], title: 'Hi', sendEmail: true }));
    expect(res.status).toBe(403);
    expect(fetchDirectoryUsers).not.toHaveBeenCalled();
    expect(deliverCommunicationEmail).not.toHaveBeenCalled();
  });

  it('sends no email when sendEmail is omitted, preserving today’s behavior', async () => {
    const res = await POST(request({ recipientUserIds: ['u1'], title: 'Hi' }));
    expect(res.status).toBe(200);
    expect(fetchDirectoryUsers).not.toHaveBeenCalled();
    expect(deliverCommunicationEmail).not.toHaveBeenCalled();
  });

  it('resolves recipient emails and calls deliverCommunicationEmail once per recipient when sendEmail is true', async () => {
    vi.mocked(fetchDirectoryUsers).mockResolvedValueOnce([
      { id: 'u1', email: 'u1@example.test', name: null, image: null },
      { id: 'u2', email: 'u2@example.test', name: null, image: null },
    ]);

    const res = await POST(
      request({
        recipientUserIds: ['u1', 'u2'],
        title: 'Scheduled maintenance',
        body: 'We will be down tonight.',
        sendEmail: true,
      }),
    );

    expect(res.status).toBe(200);
    expect(fetchDirectoryUsers).toHaveBeenCalledWith({ mode: 'resolve', ids: ['u1', 'u2'] });
    expect(deliverCommunicationEmail).toHaveBeenCalledTimes(2);
    expect(deliverCommunicationEmail).toHaveBeenCalledWith(
      {},
      expect.objectContaining({
        recipientUserId: 'u1',
        recipientEmail: 'u1@example.test',
        subject: 'Scheduled maintenance',
        source: 'console',
        templateId: 'broadcast',
      }),
    );
  });
});
