import { afterEach, describe, expect, it, vi } from 'vitest';

const { getPlatformSetting, setPlatformSetting, warn } = vi.hoisted(() => ({
  getPlatformSetting: vi.fn<(pdb: unknown, key: string) => Promise<string | null>>(),
  setPlatformSetting: vi.fn<(pdb: unknown, key: string, value: string) => Promise<void>>(),
  warn: vi.fn<(msg: string, meta?: Record<string, unknown>) => void>(),
}));

vi.mock('@sovereignfs/db', () => ({ getPlatformSetting, setPlatformSetting }));
vi.mock('../logger', () => ({ logger: { warn, info: vi.fn(), error: vi.fn(), debug: vi.fn() } }));

const { getConfiguredRelayUrl, getInstanceKey } = await import('../relay');

const pdb = {} as never;

describe('getConfiguredRelayUrl', () => {
  afterEach(() => {
    vi.resetAllMocks();
    vi.unstubAllGlobals();
    delete process.env.SOVEREIGN_RELAY_URL;
  });

  it('returns null when the relay is explicitly disabled', async () => {
    getPlatformSetting.mockImplementation(async (_pdb, key) =>
      key === 'push_relay_disabled' ? 'true' : null,
    );
    expect(await getConfiguredRelayUrl(pdb)).toBeNull();
  });

  it('returns the admin-configured URL when set', async () => {
    getPlatformSetting.mockImplementation(async (_pdb, key) =>
      key === 'push_relay_url' ? 'https://custom.relay.example' : null,
    );
    expect(await getConfiguredRelayUrl(pdb)).toBe('https://custom.relay.example');
  });

  it('falls back to SOVEREIGN_RELAY_URL when no admin override is set', async () => {
    getPlatformSetting.mockResolvedValue(null);
    process.env.SOVEREIGN_RELAY_URL = 'https://self-hosted.relay.example';
    expect(await getConfiguredRelayUrl(pdb)).toBe('https://self-hosted.relay.example');
  });

  it('falls back to the sovereignfs default when nothing is configured', async () => {
    getPlatformSetting.mockResolvedValue(null);
    expect(await getConfiguredRelayUrl(pdb)).toBe('https://relay.sovereign.openfs.io');
  });

  it('an explicit disable wins even if a URL is also configured', async () => {
    getPlatformSetting.mockImplementation(async (_pdb, key) => {
      if (key === 'push_relay_disabled') return 'true';
      if (key === 'push_relay_url') return 'https://custom.relay.example';
      return null;
    });
    expect(await getConfiguredRelayUrl(pdb)).toBeNull();
  });
});

describe('getInstanceKey', () => {
  afterEach(() => {
    vi.resetAllMocks();
    vi.unstubAllGlobals();
  });

  it('enrolls and caches when nothing is stored yet', async () => {
    getPlatformSetting.mockResolvedValue(null);
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ instanceId: 'inst-1', instanceKey: 'key-1' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await getInstanceKey(pdb, 'https://relay.example');

    expect(fetchMock).toHaveBeenCalledWith('https://relay.example/v1/enroll', { method: 'POST' });
    expect(result).toBe('key-1');
    expect(setPlatformSetting).toHaveBeenCalledWith(
      pdb,
      'push_relay_instance_key',
      JSON.stringify({ relayUrl: 'https://relay.example', instanceKey: 'key-1' }),
    );
  });

  it('returns the cached key without re-enrolling when the relay URL matches', async () => {
    getPlatformSetting.mockResolvedValue(
      JSON.stringify({ relayUrl: 'https://relay.example', instanceKey: 'cached-key' }),
    );
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const result = await getInstanceKey(pdb, 'https://relay.example');

    expect(result).toBe('cached-key');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('re-enrolls when the cached key was issued for a different relay URL', async () => {
    getPlatformSetting.mockResolvedValue(
      JSON.stringify({ relayUrl: 'https://old-relay.example', instanceKey: 'stale-key' }),
    );
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ instanceId: 'inst-2', instanceKey: 'new-key' }),
      }),
    );

    const result = await getInstanceKey(pdb, 'https://new-relay.example');
    expect(result).toBe('new-key');
  });

  it('re-enrolls when the stored value is corrupt JSON', async () => {
    getPlatformSetting.mockResolvedValue('not json');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ instanceId: 'inst-3', instanceKey: 'recovered-key' }),
      }),
    );
    expect(await getInstanceKey(pdb, 'https://relay.example')).toBe('recovered-key');
  });

  it('returns null (never throws) when enrollment responds with a non-2xx status', async () => {
    getPlatformSetting.mockResolvedValue(null);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503 }));
    expect(await getInstanceKey(pdb, 'https://relay.example')).toBeNull();
    expect(setPlatformSetting).not.toHaveBeenCalled();
  });

  it('returns null when the enrollment response is missing instanceKey', async () => {
    getPlatformSetting.mockResolvedValue(null);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }));
    expect(await getInstanceKey(pdb, 'https://relay.example')).toBeNull();
  });

  it('returns null (never throws) when the enrollment request itself errors', async () => {
    getPlatformSetting.mockResolvedValue(null);
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));
    expect(await getInstanceKey(pdb, 'https://relay.example')).toBeNull();
    expect(warn).toHaveBeenCalled();
  });
});
