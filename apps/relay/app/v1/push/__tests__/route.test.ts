import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { sendApnsPush } = vi.hoisted(() => ({ sendApnsPush: vi.fn() }));
const { sendFcmPush } = vi.hoisted(() => ({ sendFcmPush: vi.fn() }));

vi.mock('../../../../src/apns', () => ({ sendApnsPush }));
vi.mock('../../../../src/fcm', () => ({ sendFcmPush }));

function jsonRequest(body: unknown): Request {
  return new Request('http://localhost/v1/push', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function issueToken(): Promise<{ instanceId: string; instanceKey: string }> {
  const { issueEnrollmentToken } = await import('../../../../src/enrollment');
  const { instanceId, token } = issueEnrollmentToken();
  return { instanceId, instanceKey: token };
}

beforeEach(() => {
  process.env.RELAY_ENROLLMENT_SECRET = 'test-secret';
  sendApnsPush.mockReset();
  sendFcmPush.mockReset();
});

afterEach(async () => {
  delete process.env.RELAY_ENROLLMENT_SECRET;
  delete process.env.APNS_KEY;
  delete process.env.APNS_KEY_ID;
  delete process.env.APNS_TEAM_ID;
  delete process.env.APNS_BUNDLE_ID;
  delete process.env.FCM_SERVICE_ACCOUNT_JSON;
  const { resetRateLimitsForTests } = await import('../../../../src/rate-limit');
  resetRateLimitsForTests();
});

describe('POST /v1/push', () => {
  it('returns 503 when enrollment is not configured at all', async () => {
    delete process.env.RELAY_ENROLLMENT_SECRET;
    const { POST } = await import('../route');
    const res = await POST(
      jsonRequest({ deviceToken: 'd', platform: 'ios', encryptedPayload: 'p', instanceKey: 'x' }),
    );
    expect(res.status).toBe(503);
  });

  it('returns 400 on a malformed JSON body', async () => {
    const { POST } = await import('../route');
    const res = await POST(new Request('http://localhost/v1/push', { method: 'POST', body: '{' }));
    expect(res.status).toBe(400);
  });

  it('returns 400 when required fields are missing or wrong-typed', async () => {
    const { POST } = await import('../route');
    const res = await POST(jsonRequest({ deviceToken: 'd', platform: 'windows' }));
    expect(res.status).toBe(400);
  });

  it('returns 401 for an invalid instanceKey', async () => {
    const { POST } = await import('../route');
    const res = await POST(
      jsonRequest({
        deviceToken: 'd',
        platform: 'ios',
        encryptedPayload: 'p',
        instanceKey: 'not-a-real-token',
      }),
    );
    expect(res.status).toBe(401);
  });

  it('returns 503 platform_not_configured for iOS when APNs creds are absent', async () => {
    const { instanceKey } = await issueToken();
    const { POST } = await import('../route');
    const res = await POST(
      jsonRequest({ deviceToken: 'd', platform: 'ios', encryptedPayload: 'p', instanceKey }),
    );
    expect(res.status).toBe(503);
    expect((await res.json()).error).toBe('platform_not_configured');
    expect(sendApnsPush).not.toHaveBeenCalled();
  });

  it('returns 503 platform_not_configured for android when FCM creds are absent', async () => {
    const { instanceKey } = await issueToken();
    const { POST } = await import('../route');
    const res = await POST(
      jsonRequest({ deviceToken: 'd', platform: 'android', encryptedPayload: 'p', instanceKey }),
    );
    expect(res.status).toBe(503);
    expect(sendFcmPush).not.toHaveBeenCalled();
  });

  it('dispatches to sendApnsPush for ios when configured, and returns its result', async () => {
    process.env.APNS_KEY = 'key';
    process.env.APNS_KEY_ID = 'kid';
    process.env.APNS_TEAM_ID = 'team';
    process.env.APNS_BUNDLE_ID = 'bundle';
    sendApnsPush.mockResolvedValue('sent');
    const { instanceKey } = await issueToken();

    const { POST } = await import('../route');
    const res = await POST(
      jsonRequest({
        deviceToken: 'device-1',
        platform: 'ios',
        encryptedPayload: 'blob',
        instanceKey,
      }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ result: 'sent' });
    expect(sendApnsPush).toHaveBeenCalledWith('device-1', 'blob');
  });

  it('dispatches to sendFcmPush for android when configured, and returns its result', async () => {
    process.env.FCM_SERVICE_ACCOUNT_JSON = JSON.stringify({
      project_id: 'p',
      private_key: 'k',
      client_email: 'e',
    });
    sendFcmPush.mockResolvedValue('invalid_token');
    const { instanceKey } = await issueToken();

    const { POST } = await import('../route');
    const res = await POST(
      jsonRequest({
        deviceToken: 'device-2',
        platform: 'android',
        encryptedPayload: 'blob',
        instanceKey,
      }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ result: 'invalid_token' });
    expect(sendFcmPush).toHaveBeenCalledWith('device-2', 'blob');
  });

  it('returns 502 send_failed when the underlying send throws', async () => {
    process.env.APNS_KEY = 'key';
    process.env.APNS_KEY_ID = 'kid';
    process.env.APNS_TEAM_ID = 'team';
    process.env.APNS_BUNDLE_ID = 'bundle';
    sendApnsPush.mockRejectedValue(new Error('boom'));
    const { instanceKey } = await issueToken();

    const { POST } = await import('../route');
    const res = await POST(
      jsonRequest({ deviceToken: 'd', platform: 'ios', encryptedPayload: 'p', instanceKey }),
    );
    expect(res.status).toBe(502);
    expect((await res.json()).error).toBe('send_failed');
  });

  it('rate-limits repeated push calls from the same instance', async () => {
    process.env.APNS_KEY = 'key';
    process.env.APNS_KEY_ID = 'kid';
    process.env.APNS_TEAM_ID = 'team';
    process.env.APNS_BUNDLE_ID = 'bundle';
    sendApnsPush.mockResolvedValue('sent');
    const { instanceKey } = await issueToken();

    const { POST } = await import('../route');
    const send = () =>
      POST(jsonRequest({ deviceToken: 'd', platform: 'ios', encryptedPayload: 'p', instanceKey }));
    for (let i = 0; i < 600; i++) {
      expect((await send()).status).toBe(200);
    }
    const blocked = await send();
    expect(blocked.status).toBe(429);
  });
});
