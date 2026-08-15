import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  fetchDisabledPluginIds,
  fetchPaywalledPluginIds,
  fetchRestrictedPluginIds,
  fetchRootPluginPrefix,
} from '../plugin-gate';

describe('plugin-gate lookups fail open on error or non-OK response', () => {
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
