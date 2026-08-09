import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchInstanceOAuthClients } from '../instance-oauth-clients';

describe('fetchInstanceOAuthClients', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns the auth server response when it succeeds', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ desktop: 'desktop-id', mobile: 'mobile-id' }),
      }),
    );
    expect(await fetchInstanceOAuthClients()).toEqual({
      desktop: 'desktop-id',
      mobile: 'mobile-id',
    });
  });

  it('returns undefined (never throws) when the auth server is unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('connect ECONNREFUSED')));
    await expect(fetchInstanceOAuthClients()).resolves.toBeUndefined();
  });

  it('returns undefined when the auth server responds with a non-2xx status', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));
    expect(await fetchInstanceOAuthClients()).toBeUndefined();
  });
});
