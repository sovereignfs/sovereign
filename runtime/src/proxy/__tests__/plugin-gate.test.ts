import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  fetchDisabledPluginIds,
  fetchPaywalledPluginIds,
  fetchRestrictedPluginIds,
  fetchRootPluginPrefix,
  resetPluginGateCacheForTests,
} from '../plugin-gate';

describe('plugin-gate lookups fail open on error or non-OK response', () => {
  beforeEach(() => {
    resetPluginGateCacheForTests();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('fetchDisabledPluginIds returns an empty set on a thrown fetch', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('network down');
      }),
    );
    await expect(fetchDisabledPluginIds()).resolves.toEqual(new Set());
  });

  it('fetchDisabledPluginIds returns an empty set on a non-OK response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false })),
    );
    await expect(fetchDisabledPluginIds()).resolves.toEqual(new Set());
  });

  it('fetchDisabledPluginIds returns the disabled set on success', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, json: async () => ({ disabled: ['a', 'b'] }) })),
    );
    await expect(fetchDisabledPluginIds()).resolves.toEqual(new Set(['a', 'b']));
  });

  it('fetchPaywalledPluginIds fails open to an empty set', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('boom');
      }),
    );
    await expect(fetchPaywalledPluginIds('u1')).resolves.toEqual(new Set());
  });

  it('fetchRestrictedPluginIds fails open to an empty set', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false })),
    );
    await expect(fetchRestrictedPluginIds('u1', 'platform:user')).resolves.toEqual(new Set());
  });

  it('fetchRootPluginPrefix fails open to null on error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('boom');
      }),
    );
    await expect(fetchRootPluginPrefix('u1', 'platform:user')).resolves.toBeNull();
  });

  it('fetchRootPluginPrefix returns the resolved prefix on success', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, json: async () => ({ routePrefix: '/console' }) })),
    );
    await expect(fetchRootPluginPrefix('u1', 'platform:owner')).resolves.toBe('/console');
  });
});

describe('fetchDisabledPluginIds / fetchRootPluginPrefix caching (Task 2.18)', () => {
  beforeEach(() => {
    resetPluginGateCacheForTests();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('serves fetchDisabledPluginIds from cache within the TTL window (one fetch, two calls)', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ disabled: ['x'] }) }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchDisabledPluginIds()).resolves.toEqual(new Set(['x']));
    await expect(fetchDisabledPluginIds()).resolves.toEqual(new Set(['x']));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('re-fetches fetchDisabledPluginIds once the TTL expires', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ disabled: ['x'] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ disabled: ['y'] }) });
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchDisabledPluginIds()).resolves.toEqual(new Set(['x']));
    vi.advanceTimersByTime(3001);
    await expect(fetchDisabledPluginIds()).resolves.toEqual(new Set(['y']));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('caches a fail-open empty result too, rather than retrying every call', async () => {
    const fetchMock = vi.fn(async () => {
      throw new Error('outage');
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchDisabledPluginIds()).resolves.toEqual(new Set());
    await expect(fetchDisabledPluginIds()).resolves.toEqual(new Set());
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('serves fetchRootPluginPrefix from cache within the TTL window, keyed per user', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      const isU1 = url.includes('userId=u1');
      return { ok: true, json: async () => ({ routePrefix: isU1 ? '/console' : '/shopper' }) };
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchRootPluginPrefix('u1', 'platform:owner')).resolves.toBe('/console');
    await expect(fetchRootPluginPrefix('u1', 'platform:owner')).resolves.toBe('/console');
    await expect(fetchRootPluginPrefix('u2', 'platform:user')).resolves.toBe('/shopper');

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
