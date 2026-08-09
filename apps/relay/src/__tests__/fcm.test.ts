import { generateKeyPairSync } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const TEST_ACCOUNT = {
  project_id: 'test-project',
  private_key: privateKey.export({ type: 'pkcs1', format: 'pem' }).toString(),
  client_email: 'test@test-project.iam.gserviceaccount.com',
};

afterEach(() => {
  delete process.env.FCM_SERVICE_ACCOUNT_JSON;
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe('sendFcmPush', () => {
  it('throws when FCM is not configured', async () => {
    const { sendFcmPush } = await import('../fcm');
    await expect(sendFcmPush('device-token', 'payload')).rejects.toThrow(/not configured/);
  });

  it('exchanges the service-account JWT for an access token, then sends via FCM v1', async () => {
    process.env.FCM_SERVICE_ACCOUNT_JSON = JSON.stringify(TEST_ACCOUNT);

    const fetchMock = vi
      .fn()
      .mockImplementationOnce(async (url: string, init: RequestInit) => {
        expect(url).toBe('https://oauth2.googleapis.com/token');
        const params = new URLSearchParams(init.body as string);
        expect(params.get('grant_type')).toBe('urn:ietf:params:oauth:grant-type:jwt-bearer');
        const assertion = params.get('assertion');
        expect(assertion).not.toBeNull();
        const [headerB64, payloadB64] = (assertion ?? '').split('.');
        expect(JSON.parse(Buffer.from(headerB64, 'base64url').toString())).toEqual({
          alg: 'RS256',
          typ: 'JWT',
        });
        const claims = JSON.parse(Buffer.from(payloadB64, 'base64url').toString());
        expect(claims.iss).toBe(TEST_ACCOUNT.client_email);
        expect(claims.scope).toBe('https://www.googleapis.com/auth/firebase.messaging');
        return {
          ok: true,
          json: async () => ({ access_token: 'fake-access-token', expires_in: 3600 }),
        };
      })
      .mockImplementationOnce(async (url: string, init: RequestInit) => {
        expect(url).toBe('https://fcm.googleapis.com/v1/projects/test-project/messages:send');
        expect(init.headers).toMatchObject({ authorization: 'Bearer fake-access-token' });
        const body = JSON.parse(init.body as string);
        expect(body.message.token).toBe('device-token-xyz');
        expect(body.message.data.encryptedPayload).toBe('ZW5jcnlwdGVk');
        expect(body.message.notification).toBeUndefined();
        return { ok: true, json: async () => ({ name: 'projects/test-project/messages/1' }) };
      });
    vi.stubGlobal('fetch', fetchMock);

    const { sendFcmPush } = await import('../fcm');
    const result = await sendFcmPush('device-token-xyz', 'ZW5jcnlwdGVk');
    expect(result).toBe('sent');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('maps UNREGISTERED to invalid_token', async () => {
    process.env.FCM_SERVICE_ACCOUNT_JSON = JSON.stringify(TEST_ACCOUNT);
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ access_token: 'tok', expires_in: 3600 }),
        })
        .mockResolvedValueOnce({
          ok: false,
          json: async () => ({ error: { status: 'UNREGISTERED' } }),
        }),
    );
    const { sendFcmPush } = await import('../fcm');
    expect(await sendFcmPush('gone-token', 'p')).toBe('invalid_token');
  });

  it('maps NOT_FOUND and INVALID_ARGUMENT to invalid_token too', async () => {
    process.env.FCM_SERVICE_ACCOUNT_JSON = JSON.stringify(TEST_ACCOUNT);
    for (const status of ['NOT_FOUND', 'INVALID_ARGUMENT']) {
      vi.resetModules();
      vi.stubGlobal(
        'fetch',
        vi
          .fn()
          .mockResolvedValueOnce({
            ok: true,
            json: async () => ({ access_token: 'tok', expires_in: 3600 }),
          })
          .mockResolvedValueOnce({ ok: false, json: async () => ({ error: { status } }) }),
      );
      const { sendFcmPush } = await import('../fcm');
      expect(await sendFcmPush('token', 'p')).toBe('invalid_token');
    }
  });

  it('maps an unrelated error status to failed', async () => {
    process.env.FCM_SERVICE_ACCOUNT_JSON = JSON.stringify(TEST_ACCOUNT);
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ access_token: 'tok', expires_in: 3600 }),
        })
        .mockResolvedValueOnce({
          ok: false,
          json: async () => ({ error: { status: 'INTERNAL' } }),
        }),
    );
    const { sendFcmPush } = await import('../fcm');
    expect(await sendFcmPush('device-token', 'p')).toBe('failed');
  });

  it('maps a non-JSON error body to failed, without throwing', async () => {
    process.env.FCM_SERVICE_ACCOUNT_JSON = JSON.stringify(TEST_ACCOUNT);
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ access_token: 'tok', expires_in: 3600 }),
        })
        .mockResolvedValueOnce({
          ok: false,
          json: async () => {
            throw new Error('not json');
          },
        }),
    );
    const { sendFcmPush } = await import('../fcm');
    expect(await sendFcmPush('device-token', 'p')).toBe('failed');
  });

  it('throws when the OAuth2 token exchange itself fails', async () => {
    process.env.FCM_SERVICE_ACCOUNT_JSON = JSON.stringify(TEST_ACCOUNT);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 401, text: async () => 'invalid_grant' }),
    );
    const { sendFcmPush } = await import('../fcm');
    await expect(sendFcmPush('device-token', 'p')).rejects.toThrow(/token exchange failed/);
  });

  it('caches the access token across calls (one token-exchange fetch, two send fetches)', async () => {
    process.env.FCM_SERVICE_ACCOUNT_JSON = JSON.stringify(TEST_ACCOUNT);
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      if (url === 'https://oauth2.googleapis.com/token') {
        return { ok: true, json: async () => ({ access_token: 'cached-token', expires_in: 3600 }) };
      }
      return { ok: true, json: async () => ({}) };
    });
    vi.stubGlobal('fetch', fetchMock);

    const { sendFcmPush } = await import('../fcm');
    await sendFcmPush('device-a', 'p1');
    await sendFcmPush('device-b', 'p2');

    const tokenExchangeCalls = fetchMock.mock.calls.filter(
      ([url]) => url === 'https://oauth2.googleapis.com/token',
    );
    expect(tokenExchangeCalls).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
