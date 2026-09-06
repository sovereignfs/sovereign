import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const requireSession = vi.fn();
const hasCapability = vi.fn();

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next/headers', () => ({
  headers: () => Promise.resolve(new Headers({ 'x-sovereign-user-id': 'admin-1' })),
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

const { togglePluginAction } = await import('../actions');

function formData(entries: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [key, value] of Object.entries(entries)) fd.set(key, value);
  return fd;
}

beforeEach(() => {
  vi.clearAllMocks();
  requireSession.mockResolvedValue({ user: { id: 'admin-1' } });
  hasCapability.mockReturnValue(true);
});

/** Every test that stubs `fetch` used to unstub it by hand on its last line —
 *  a failing assertion skipped the unstub and leaked the stub into the next
 *  test. Centralised here so it runs even when an assertion throws. */
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('togglePluginAction — enable/disable', () => {
  it('refuses a session without plugin:manage, without calling the admin API', async () => {
    hasCapability.mockReturnValue(false);
    vi.stubGlobal('fetch', vi.fn());

    await expect(
      togglePluginAction(null, formData({ pluginId: 'tasks', enabled: 'false' })),
    ).rejects.toThrow('Insufficient privileges to manage apps.');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('checks plugin:manage specifically', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response('{}', { status: 200 }))),
    );

    await togglePluginAction(null, formData({ pluginId: 'tasks', enabled: 'false' }));

    expect(hasCapability).toHaveBeenCalledWith(expect.anything(), 'plugin:manage');
  });

  it('PATCHes the target plugin to disabled', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(new Response('{}', { status: 200 })));
    vi.stubGlobal('fetch', fetchMock);

    await togglePluginAction(null, formData({ pluginId: 'tasks', enabled: 'false' }));

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/admin/plugins/tasks'),
      expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ enabled: false }) }),
    );
  });

  it('PATCHes the target plugin to enabled', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(new Response('{}', { status: 200 })));
    vi.stubGlobal('fetch', fetchMock);

    await togglePluginAction(null, formData({ pluginId: 'tasks', enabled: 'true' }));

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/admin/plugins/tasks'),
      expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ enabled: true }) }),
    );
  });

  it('refuses to toggle a platform chrome app (Console cannot disable itself)', async () => {
    // Regression: the proxy 404s a disabled plugin's whole prefix, so
    // disabling `fs.sovereign.console` from Console locked every admin out.
    vi.stubGlobal('fetch', vi.fn());

    await expect(
      togglePluginAction(null, formData({ pluginId: 'fs.sovereign.console', enabled: 'false' })),
    ).resolves.toEqual({
      success: false,
      error: 'This app is part of the platform shell and is always on.',
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('returns a failure result on a non-ok response rather than silently succeeding', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response('{}', { status: 500 }))),
    );

    await expect(
      togglePluginAction(null, formData({ pluginId: 'tasks', enabled: 'false' })),
    ).resolves.toEqual({ success: false, error: 'Failed to toggle plugin: 500' });
  });
});
