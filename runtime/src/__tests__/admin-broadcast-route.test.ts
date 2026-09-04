import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@sovereignfs/db', () => ({
  getPlatformSetting: vi.fn(async () => null),
  setPlatformSetting: vi.fn(async () => undefined),
}));
vi.mock('@/src/admin-guard', () => ({ checkAdminKey: vi.fn(() => null) }));
vi.mock('@/src/communication-email', () => ({
  deliverCommunicationEmail: vi.fn(async () => ({ status: 'sent' })),
  escapeHtml: (v: string) => v,
}));
vi.mock('@/src/db', () => ({ getPlatformDb: vi.fn(async () => ({})) }));
vi.mock('@/src/notification-delivery', () => ({
  deliverNotification: vi.fn(async () => ({ id: 'n1', outcome: 'delivered' })),
}));
vi.mock('@/src/sdk-host', () => ({ fetchDirectoryUsers: vi.fn(async () => []) }));

import { deliverCommunicationEmail } from '@/src/communication-email';
import { fetchDirectoryUsers } from '@/src/sdk-host';
import { POST } from '../../app/api/admin/broadcast/route';

function request(body: Record<string, unknown>): Request {
  return new Request('http://localhost/api/admin/broadcast', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer test-admin-key' },
    body: JSON.stringify(body),
  });
}

afterEach(() => {
  vi.clearAllMocks();
});

describe('POST /api/admin/broadcast — communication email (RFC 0062 §6)', () => {
  it('sends no email when sendEmail is omitted, preserving today’s behavior', async () => {
    const res = await POST(request({ recipientUserIds: ['u1'], title: 'Hi' }));
    expect(res.status).toBe(200);
    expect(fetchDirectoryUsers).not.toHaveBeenCalled();
    expect(deliverCommunicationEmail).not.toHaveBeenCalled();
  });

  it('resolves recipient emails and calls deliverCommunicationEmail per recipient when sendEmail is true', async () => {
    vi.mocked(fetchDirectoryUsers).mockResolvedValueOnce([
      { id: 'u1', email: 'u1@example.test', name: null, image: null },
    ]);

    const res = await POST(
      request({ recipientUserIds: ['u1'], title: 'Maintenance', sendEmail: true }),
    );

    expect(res.status).toBe(200);
    expect(fetchDirectoryUsers).toHaveBeenCalledWith({ mode: 'resolve', ids: ['u1'] });
    expect(deliverCommunicationEmail).toHaveBeenCalledWith(
      {},
      expect.objectContaining({
        recipientUserId: 'u1',
        recipientEmail: 'u1@example.test',
        source: 'console',
        templateId: 'broadcast',
      }),
    );
  });
});
