import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `PATCH /api/admin/plugins/[id]` must refuse to toggle a platform chrome
 * plugin. The proxy 404s a disabled plugin's whole route prefix (SRS
 * CON-07), so a disabled Console/Launcher/Account/Inbox row locks every
 * user out with no UI path back — the Console action refuses too, but the
 * route is the boundary any admin-key caller can reach directly.
 */

const setPluginEnabled = vi.fn();
const logActivity = vi.fn();

vi.mock('@sovereignfs/db', () => ({
  setPluginEnabled: (...args: unknown[]) => setPluginEnabled(...args),
}));
vi.mock('../db', () => ({ getPlatformDb: () => Promise.resolve({}) }));
vi.mock('../admin-guard', () => ({ checkAdminKey: () => null }));
vi.mock('../activity', () => ({ logActivity: (...args: unknown[]) => logActivity(...args) }));
vi.mock('../registry', () => ({
  getInstalledPlugins: () => [{ id: 'fs.sovereign.console' }, { id: 'tasks' }],
}));

const { PATCH } = await import('../../app/api/admin/plugins/[id]/route');

function patchRequest(id: string, enabled: boolean) {
  const request = new Request(`http://localhost/api/admin/plugins/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ enabled }),
  });
  return PATCH(request, { params: Promise.resolve({ id }) });
}

beforeEach(() => {
  vi.clearAllMocks();
  setPluginEnabled.mockResolvedValue(undefined);
});

describe('PATCH /api/admin/plugins/[id] — chrome plugin guard', () => {
  it('refuses to disable a chrome plugin without touching the DB', async () => {
    const res = await patchRequest('fs.sovereign.console', false);

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({
      error: 'platform chrome plugins are always enabled and cannot be toggled',
    });
    expect(setPluginEnabled).not.toHaveBeenCalled();
    expect(logActivity).not.toHaveBeenCalled();
  });

  it('refuses to "enable" a chrome plugin too — the row must never exist', async () => {
    const res = await patchRequest('fs.sovereign.console', true);

    expect(res.status).toBe(403);
    expect(setPluginEnabled).not.toHaveBeenCalled();
  });

  it('still toggles an ordinary installed plugin', async () => {
    const res = await patchRequest('tasks', false);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: 'tasks', enabled: false });
    expect(setPluginEnabled).toHaveBeenCalledWith({}, 'tasks', false);
  });
});
