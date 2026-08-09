import { afterEach, describe, expect, it, vi } from 'vitest';

const { getPlatformSetting } = vi.hoisted(() => ({
  getPlatformSetting: vi.fn<(pdb: unknown, key: string) => Promise<string | null>>(),
}));

vi.mock('@sovereignfs/db', () => ({ getPlatformSetting }));

const { getConfiguredRelayUrl } = await import('../relay');

const pdb = {} as never;

describe('getConfiguredRelayUrl', () => {
  afterEach(() => {
    vi.resetAllMocks();
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
