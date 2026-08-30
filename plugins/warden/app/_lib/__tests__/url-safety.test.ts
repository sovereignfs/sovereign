import { beforeEach, describe, expect, it, vi } from 'vitest';

const lookup = vi.fn();

vi.mock('node:dns/promises', () => ({ lookup: (...args: unknown[]) => lookup(...args) }));

const { assertSafeProviderBaseUrl, UnsafeProviderUrlError } = await import('../url-safety');

beforeEach(() => {
  vi.clearAllMocks();
});

describe('assertSafeProviderBaseUrl', () => {
  it('accepts a URL that resolves to a public address', async () => {
    lookup.mockResolvedValue([{ address: '203.0.113.10', family: 4 }]);
    const { url } = await assertSafeProviderBaseUrl('https://openrouter.ai/api/v1');
    expect(url.toString()).toBe('https://openrouter.ai/api/v1');
  });

  it('returns the resolved address to pin the actual connection to', async () => {
    lookup.mockResolvedValue([{ address: '203.0.113.10', family: 4 }]);
    const { pinnedAddress, pinnedFamily } = await assertSafeProviderBaseUrl(
      'https://openrouter.ai/api/v1',
    );
    expect(pinnedAddress).toBe('203.0.113.10');
    expect(pinnedFamily).toBe(4);
  });

  it('pins to the first resolved address when a hostname resolves to several', async () => {
    lookup.mockResolvedValue([
      { address: '203.0.113.10', family: 4 },
      { address: '203.0.113.11', family: 4 },
    ]);
    const { pinnedAddress } = await assertSafeProviderBaseUrl('https://openrouter.ai/api/v1');
    expect(pinnedAddress).toBe('203.0.113.10');
  });

  it('normalizes an IPv6 family to 6, not the raw dns module value', async () => {
    lookup.mockResolvedValue([{ address: '2001:db8::1', family: 6 }]);
    const { pinnedFamily } = await assertSafeProviderBaseUrl('https://openrouter.ai/api/v1');
    expect(pinnedFamily).toBe(6);
  });

  it('rejects a non-http(s) protocol', async () => {
    await expect(assertSafeProviderBaseUrl('ftp://example.com')).rejects.toThrow(
      UnsafeProviderUrlError,
    );
    expect(lookup).not.toHaveBeenCalled();
  });

  it('rejects a malformed URL', async () => {
    await expect(assertSafeProviderBaseUrl('not a url')).rejects.toThrow(UnsafeProviderUrlError);
  });

  it('rejects localhost by literal hostname without resolving it', async () => {
    await expect(assertSafeProviderBaseUrl('http://localhost:8080')).rejects.toThrow(
      UnsafeProviderUrlError,
    );
    expect(lookup).not.toHaveBeenCalled();
  });

  it.each(['auth', 'runtime', 'harness', 'harness-engine', 'sqld', 'sovereign-harness'])(
    "rejects this repo's own internal service hostname %s",
    async (hostname) => {
      await expect(assertSafeProviderBaseUrl(`http://${hostname}:3000`)).rejects.toThrow(
        UnsafeProviderUrlError,
      );
      expect(lookup).not.toHaveBeenCalled();
    },
  );

  it('rejects a hostname that resolves to loopback (IPv4)', async () => {
    lookup.mockResolvedValue([{ address: '127.0.0.1', family: 4 }]);
    await expect(assertSafeProviderBaseUrl('https://sneaky.example.com')).rejects.toThrow(
      UnsafeProviderUrlError,
    );
  });

  it('rejects a hostname that resolves to link-local/cloud metadata', async () => {
    lookup.mockResolvedValue([{ address: '169.254.169.254', family: 4 }]);
    await expect(assertSafeProviderBaseUrl('https://sneaky.example.com')).rejects.toThrow(
      UnsafeProviderUrlError,
    );
  });

  it('rejects a hostname that resolves to IPv6 loopback', async () => {
    lookup.mockResolvedValue([{ address: '::1', family: 6 }]);
    await expect(assertSafeProviderBaseUrl('https://sneaky.example.com')).rejects.toThrow(
      UnsafeProviderUrlError,
    );
  });

  it('rejects when any one of multiple resolved addresses is unsafe', async () => {
    lookup.mockResolvedValue([
      { address: '203.0.113.10', family: 4 },
      { address: '127.0.0.1', family: 4 },
    ]);
    await expect(assertSafeProviderBaseUrl('https://sneaky.example.com')).rejects.toThrow(
      UnsafeProviderUrlError,
    );
  });

  it('does NOT reject an ordinary private-LAN address (a legitimate self-hosted server)', async () => {
    lookup.mockResolvedValue([{ address: '192.168.1.50', family: 4 }]);
    const { url, pinnedAddress } = await assertSafeProviderBaseUrl(
      'http://my-home-server.local:8080',
    );
    expect(url.hostname).toBe('my-home-server.local');
    expect(pinnedAddress).toBe('192.168.1.50');
  });

  it('rejects when DNS resolution fails', async () => {
    lookup.mockRejectedValue(new Error('ENOTFOUND'));
    await expect(assertSafeProviderBaseUrl('https://nowhere.example.com')).rejects.toThrow(
      UnsafeProviderUrlError,
    );
  });
});
