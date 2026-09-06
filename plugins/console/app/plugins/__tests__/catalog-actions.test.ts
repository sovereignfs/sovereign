import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const requireSession = vi.fn();
const hasCapability = vi.fn();

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next/headers', () => ({
  headers: () => Promise.resolve(new Headers({ 'x-sovereign-user-id': 'auditor-1' })),
}));
vi.mock('@sovereignfs/sdk', () => ({
  sdk: {
    auth: {
      requireSession: () => requireSession(),
      hasCapability: (...args: unknown[]) => hasCapability(...args),
    },
    directory: { resolveUsers: vi.fn(), searchUsers: vi.fn() },
  },
}));

const { getPluginCatalogAction } = await import('../actions');

beforeEach(() => {
  vi.clearAllMocks();
  requireSession.mockResolvedValue({ user: { id: 'auditor-1' } });
});

/** Every test that stubs `fetch` used to unstub it by hand on its last line —
 *  a failing assertion skipped the unstub and leaked the stub into the next
 *  test. Centralised here so it runs even when an assertion throws. */
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('getPluginCatalogAction — read-only catalog fetch', () => {
  it('succeeds for a session without plugin:manage — Overview must load for every Console role', async () => {
    hasCapability.mockReturnValue(false);
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          new Response(JSON.stringify({ catalog: [{ id: 'tasks', active: true }] }), {
            status: 200,
          }),
        ),
      ),
    );

    await expect(getPluginCatalogAction()).resolves.toEqual([{ id: 'tasks', active: true }]);
    expect(hasCapability).not.toHaveBeenCalled();
  });

  it('requires a session — an unauthenticated caller still fails', async () => {
    requireSession.mockRejectedValue(new Error('no session'));
    vi.stubGlobal('fetch', vi.fn());

    await expect(getPluginCatalogAction()).rejects.toThrow('no session');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('returns an empty array on a non-ok response rather than throwing', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response('{}', { status: 500 }))),
    );

    await expect(getPluginCatalogAction()).resolves.toEqual([]);
  });
});
