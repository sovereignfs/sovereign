import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  delete process.env.WNS_PACKAGE_SID;
  delete process.env.WNS_CLIENT_SECRET;
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe('isValidWnsChannelUri (SSRF guard)', () => {
  it('accepts real notify.windows.com subdomains over https', async () => {
    const { isValidWnsChannelUri } = await import('../wns');
    expect(isValidWnsChannelUri('https://db5.notify.windows.com/channel-uri')).toBe(true);
    expect(isValidWnsChannelUri('https://bn1.notify.windows.com/x?y=1')).toBe(true);
    expect(isValidWnsChannelUri('https://notify.windows.com/foo')).toBe(true);
  });

  it('rejects a non-Microsoft host entirely, including a subdomain-suffix trick', async () => {
    const { isValidWnsChannelUri } = await import('../wns');
    expect(isValidWnsChannelUri('https://attacker.example.com/x')).toBe(false);
    // "notify.windows.com.attacker.example.com" is NOT a notify.windows.com
    // subdomain — endsWith('.notify.windows.com') correctly rejects this.
    expect(isValidWnsChannelUri('https://evil.notify.windows.com.attacker.example.com/x')).toBe(
      false,
    );
    // Nor is a lookalike host that merely contains the string.
    expect(isValidWnsChannelUri('https://notify.windows.com.evil.com/x')).toBe(false);
  });

  it('rejects internal/metadata-style targets an SSRF would aim at', async () => {
    const { isValidWnsChannelUri } = await import('../wns');
    expect(isValidWnsChannelUri('http://169.254.169.254/latest/meta-data/')).toBe(false);
    expect(isValidWnsChannelUri('http://localhost:8080/internal')).toBe(false);
    expect(isValidWnsChannelUri('https://10.0.0.5/internal')).toBe(false);
  });

  it('rejects http (non-TLS) even against the real host', async () => {
    const { isValidWnsChannelUri } = await import('../wns');
    expect(isValidWnsChannelUri('http://db5.notify.windows.com/channel')).toBe(false);
  });

  it('rejects malformed URLs without throwing', async () => {
    const { isValidWnsChannelUri } = await import('../wns');
    expect(isValidWnsChannelUri('not-a-url')).toBe(false);
    expect(isValidWnsChannelUri('')).toBe(false);
  });
});

describe('sendWnsPush', () => {
  it('returns invalid_token for a non-WNS channel URI, without ever calling fetch (SSRF guard)', async () => {
    process.env.WNS_PACKAGE_SID = 'sid';
    process.env.WNS_CLIENT_SECRET = 'secret';
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const { sendWnsPush } = await import('../wns');
    const result = await sendWnsPush('https://internal.example.com/steal-me', 'payload');
    expect(result).toBe('invalid_token');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('throws when WNS is not configured', async () => {
    const { sendWnsPush } = await import('../wns');
    await expect(sendWnsPush('https://db5.notify.windows.com/channel', 'payload')).rejects.toThrow(
      /not configured/,
    );
  });

  it('exchanges Package SID/secret for a bearer token via login.live.com, then sends a raw notification to the channel URI', async () => {
    process.env.WNS_PACKAGE_SID = 'ms-app://s-1-15-2-test';
    process.env.WNS_CLIENT_SECRET = 'test-secret';

    const fetchMock = vi
      .fn()
      .mockImplementationOnce(async (url: string, init: RequestInit) => {
        expect(url).toBe('https://login.live.com/accesstoken.srf');
        const params = new URLSearchParams(init.body as string);
        expect(params.get('grant_type')).toBe('client_credentials');
        expect(params.get('client_id')).toBe('ms-app://s-1-15-2-test');
        expect(params.get('client_secret')).toBe('test-secret');
        expect(params.get('scope')).toBe('notify.windows.com');
        // Microsoft's documented response is form-urlencoded, not JSON.
        return {
          ok: true,
          text: async () => 'access_token=fake-wns-token&token_type=bearer&expires_in=86390',
        };
      })
      .mockImplementationOnce(async (url: string, init: RequestInit) => {
        expect(url).toBe('https://db5.notify.windows.com/channel-uri');
        expect(init.headers).toMatchObject({
          authorization: 'Bearer fake-wns-token',
          'x-wns-type': 'wns/raw',
          'content-type': 'application/octet-stream',
        });
        expect(init.body).toBe('ZW5jcnlwdGVk');
        return { ok: true, status: 200 };
      });
    vi.stubGlobal('fetch', fetchMock);

    const { sendWnsPush } = await import('../wns');
    const result = await sendWnsPush('https://db5.notify.windows.com/channel-uri', 'ZW5jcnlwdGVk');
    expect(result).toBe('sent');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('maps a 404 from the channel URI to invalid_token', async () => {
    process.env.WNS_PACKAGE_SID = 'sid';
    process.env.WNS_CLIENT_SECRET = 'secret';
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce({ ok: true, text: async () => 'access_token=t&expires_in=3600' })
        .mockResolvedValueOnce({ ok: false, status: 404 }),
    );
    const { sendWnsPush } = await import('../wns');
    expect(await sendWnsPush('https://db5.notify.windows.com/gone', 'p')).toBe('invalid_token');
  });

  it('maps a 410 from the channel URI to invalid_token', async () => {
    process.env.WNS_PACKAGE_SID = 'sid';
    process.env.WNS_CLIENT_SECRET = 'secret';
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce({ ok: true, text: async () => 'access_token=t&expires_in=3600' })
        .mockResolvedValueOnce({ ok: false, status: 410 }),
    );
    const { sendWnsPush } = await import('../wns');
    expect(await sendWnsPush('https://db5.notify.windows.com/expired', 'p')).toBe('invalid_token');
  });

  it('maps an unrelated error status to failed', async () => {
    process.env.WNS_PACKAGE_SID = 'sid';
    process.env.WNS_CLIENT_SECRET = 'secret';
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce({ ok: true, text: async () => 'access_token=t&expires_in=3600' })
        .mockResolvedValueOnce({ ok: false, status: 401 }),
    );
    const { sendWnsPush } = await import('../wns');
    expect(await sendWnsPush('https://db5.notify.windows.com/x', 'p')).toBe('failed');
  });

  it('throws when the OAuth2 token exchange itself fails', async () => {
    process.env.WNS_PACKAGE_SID = 'sid';
    process.env.WNS_CLIENT_SECRET = 'secret';
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 401, text: async () => 'invalid_client' }),
    );
    const { sendWnsPush } = await import('../wns');
    await expect(sendWnsPush('https://db5.notify.windows.com/x', 'p')).rejects.toThrow(
      /token exchange failed/,
    );
  });

  it('throws a clear error when the token response has no access_token', async () => {
    process.env.WNS_PACKAGE_SID = 'sid';
    process.env.WNS_CLIENT_SECRET = 'secret';
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, text: async () => 'token_type=bearer' }),
    );
    const { sendWnsPush } = await import('../wns');
    await expect(sendWnsPush('https://db5.notify.windows.com/x', 'p')).rejects.toThrow(
      /missing access_token/,
    );
  });

  it('caches the access token across calls (one token-exchange fetch, two send fetches)', async () => {
    process.env.WNS_PACKAGE_SID = 'sid';
    process.env.WNS_CLIENT_SECRET = 'secret';
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      if (url === 'https://login.live.com/accesstoken.srf') {
        return { ok: true, text: async () => 'access_token=cached-token&expires_in=3600' };
      }
      return { ok: true, status: 200 };
    });
    vi.stubGlobal('fetch', fetchMock);

    const { sendWnsPush } = await import('../wns');
    await sendWnsPush('https://db5.notify.windows.com/a', 'p1');
    await sendWnsPush('https://db5.notify.windows.com/b', 'p2');

    const tokenExchangeCalls = fetchMock.mock.calls.filter(
      ([url]) => url === 'https://login.live.com/accesstoken.srf',
    );
    expect(tokenExchangeCalls).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
