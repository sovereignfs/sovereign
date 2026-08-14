import { beforeEach, describe, expect, it, vi } from 'vitest';

const requireSession = vi.fn();
const hasCapability = vi.fn();
const logActivity = vi.fn();
const deleteUser = vi.fn();
const getInstalledPlugins = vi.fn();

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
  },
}));
vi.mock('@/src/activity', () => ({ logActivity: (...args: unknown[]) => logActivity(...args) }));
vi.mock('@/src/launcher-plugins', () => ({ CHROME_PLUGIN_IDS: new Set(['launcher']) }));
vi.mock('@/src/registry', () => ({
  getInstalledPlugins: (...args: unknown[]) => getInstalledPlugins(...args) as unknown[],
}));
vi.mock('@/src/user-deletion', () => ({
  deleteUser: (...args: unknown[]) => deleteUser(...args),
}));

const {
  sendInviteAction,
  cancelInviteAction,
  changeRoleAction,
  toggleActiveAction,
  resetMfaAction,
  deleteUserAction,
} = await import('../actions');

function formData(entries: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [key, value] of Object.entries(entries)) fd.set(key, value);
  return fd;
}

/**
 * Every admin API call this file's actions make, keyed by "METHOD path".
 * `/api/admin/email` always defaults to a benign "skipped" response unless a
 * test overrides it — several actions fire a notification email as an
 * unawaited `void sendAdminEmail(...)` side effect, which would otherwise
 * throw an unhandled rejection in every test that doesn't care about it.
 */
function mockAdminFetch(responses: Record<string, { status: number; body?: unknown }>) {
  return vi.fn((url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    const path = new URL(url).pathname + new URL(url).search;
    const key = `${method} ${path}`;
    const match =
      responses[key] ??
      responses[path] ??
      (path === '/api/admin/email' ? { status: 200, body: { status: 'skipped' } } : undefined);
    if (!match) return Promise.reject(new Error(`unexpected fetch: ${key}`));
    return Promise.resolve(
      new Response(match.body ? JSON.stringify(match.body) : '{}', { status: match.status }),
    );
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  requireSession.mockResolvedValue({
    user: { id: 'admin-1', name: 'Admin', email: 'admin@example.test' },
  });
  hasCapability.mockReturnValue(true);
});

describe('sendInviteAction — invite creation flow', () => {
  it('rejects a missing email without calling the admin API', async () => {
    vi.stubGlobal('fetch', vi.fn());

    const result = await sendInviteAction(null, formData({}));

    expect(result).toEqual({ success: false, error: 'Email is required.' });
    expect(fetch).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('creates the invite and reports success even when the notification email fails', async () => {
    vi.stubGlobal(
      'fetch',
      mockAdminFetch({
        'POST /api/admin/invites': {
          status: 200,
          body: { token: 'tok-123', email: 'new@example.test' },
        },
        'POST /api/admin/email-templates/send': { status: 502, body: { error: 'smtp down' } },
      }),
    );

    const result = await sendInviteAction(null, formData({ email: 'new@example.test' }));

    expect(result).toEqual(
      expect.objectContaining({ success: true, token: 'tok-123', email: 'new@example.test' }),
    );
    if (result.success) expect(result.emailWarning).toBeDefined();
    vi.unstubAllGlobals();
  });

  it('surfaces a failure to create the invite itself', async () => {
    vi.stubGlobal('fetch', mockAdminFetch({ 'POST /api/admin/invites': { status: 500 } }));

    const result = await sendInviteAction(null, formData({ email: 'new@example.test' }));

    expect(result).toEqual({ success: false, error: 'Failed to create invite: 500' });
    vi.unstubAllGlobals();
  });
});

describe('cancelInviteAction — invite creation flow (cancellation)', () => {
  it('refuses a session without user:manage', async () => {
    hasCapability.mockReturnValue(false);
    vi.stubGlobal('fetch', vi.fn());

    await expect(cancelInviteAction(formData({ email: 'x@example.test' }))).rejects.toThrow(
      'Insufficient privileges to manage users.',
    );
    expect(fetch).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('cancels the invite by email for an authorized admin', async () => {
    const fetchMock = mockAdminFetch({
      'DELETE /api/admin/invites?email=x%40example.test': { status: 200 },
    });
    vi.stubGlobal('fetch', fetchMock);

    await cancelInviteAction(formData({ email: 'x@example.test' }));

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/admin/invites?email=x%40example.test'),
      expect.objectContaining({ method: 'DELETE' }),
    );
    vi.unstubAllGlobals();
  });
});

describe('changeRoleAction — role update guardrails', () => {
  it('refuses a session without role:assign, without calling the admin API', async () => {
    hasCapability.mockReturnValue(false);
    vi.stubGlobal('fetch', vi.fn());

    await expect(
      changeRoleAction(formData({ userId: 'user-2', role: 'platform:admin' })),
    ).rejects.toThrow('Insufficient privileges to assign roles.');
    expect(fetch).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('checks role:assign specifically, not a weaker capability', async () => {
    vi.stubGlobal(
      'fetch',
      mockAdminFetch({
        'PATCH /api/admin/users/user-2': {
          status: 200,
          body: { id: 'user-2', email: 'u2@example.test', role: 'platform:admin' },
        },
      }),
    );

    await changeRoleAction(formData({ userId: 'user-2', role: 'platform:admin' }));

    expect(hasCapability).toHaveBeenCalledWith(expect.anything(), 'role:assign');
    vi.unstubAllGlobals();
  });

  it('throws on a failed role change rather than silently succeeding', async () => {
    vi.stubGlobal('fetch', mockAdminFetch({ 'PATCH /api/admin/users/user-2': { status: 403 } }));

    await expect(
      changeRoleAction(formData({ userId: 'user-2', role: 'platform:owner' })),
    ).rejects.toThrow('Failed to change role: 403');
    vi.unstubAllGlobals();
  });
});

describe('toggleActiveAction — admin-only behavior for a sensitive route', () => {
  it('refuses a session without user:manage', async () => {
    hasCapability.mockReturnValue(false);
    vi.stubGlobal('fetch', vi.fn());

    await expect(
      toggleActiveAction(formData({ userId: 'user-2', active: 'false' })),
    ).rejects.toThrow('Insufficient privileges to manage users.');
    expect(fetch).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('deactivates an authorized target user', async () => {
    const fetchMock = mockAdminFetch({
      'PATCH /api/admin/users/user-2': {
        status: 200,
        body: { id: 'user-2', email: 'u2@example.test' },
      },
    });
    vi.stubGlobal('fetch', fetchMock);

    await toggleActiveAction(formData({ userId: 'user-2', active: 'false' }));

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/admin/users/user-2'),
      expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ active: false }) }),
    );
    vi.unstubAllGlobals();
  });
});

/**
 * Regression coverage for a real authorization gap found while writing this
 * suite: resetMfaAction previously called only requireSession(), with no
 * hasCapability check at all — unlike every sibling action in this file
 * (toggleActiveAction, changeRoleAction, vouchAction, deleteUserAction). Any
 * authenticated non-admin user could reset MFA on any other account by
 * invoking the action directly (server actions are reachable by action id
 * independent of the Console page's adminOnly gate — see
 * docs/architecture-rules.md). Fixed alongside this test.
 */
describe('resetMfaAction — admin-only behavior (regression)', () => {
  it('refuses a session without user:manage, without calling the admin API', async () => {
    hasCapability.mockReturnValue(false);
    vi.stubGlobal('fetch', vi.fn());

    await expect(resetMfaAction(formData({ userId: 'user-2' }))).rejects.toThrow(
      'Insufficient privileges to manage users.',
    );
    expect(fetch).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('checks user:manage specifically', async () => {
    vi.stubGlobal(
      'fetch',
      mockAdminFetch({
        'PATCH /api/admin/users/user-2': {
          status: 200,
          body: { id: 'user-2', email: 'u2@example.test' },
        },
      }),
    );

    await resetMfaAction(formData({ userId: 'user-2' }));

    expect(hasCapability).toHaveBeenCalledWith(expect.anything(), 'user:manage');
    vi.unstubAllGlobals();
  });
});

describe('deleteUserAction — role guardrail (owner cannot be deleted)', () => {
  it('refuses to delete a user whose role is platform:owner', async () => {
    vi.stubGlobal(
      'fetch',
      mockAdminFetch({
        'GET /api/admin/users': {
          status: 200,
          body: [{ id: 'owner-1', role: 'platform:owner' }],
        },
      }),
    );

    await expect(deleteUserAction(formData({ userId: 'owner-1' }))).rejects.toThrow(
      'The platform owner account cannot be deleted.',
    );
    expect(deleteUser).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('deletes an authorized target user who is not the owner', async () => {
    vi.stubGlobal(
      'fetch',
      mockAdminFetch({
        'GET /api/admin/users': {
          status: 200,
          body: [{ id: 'user-2', role: 'platform:user' }],
        },
      }),
    );
    deleteUser.mockResolvedValue(undefined);

    await deleteUserAction(formData({ userId: 'user-2' }));

    expect(deleteUser).toHaveBeenCalledWith('user-2', 'default');
    vi.unstubAllGlobals();
  });

  it('refuses a session without user:manage, without querying users or deleting', async () => {
    hasCapability.mockReturnValue(false);
    vi.stubGlobal('fetch', vi.fn());

    await expect(deleteUserAction(formData({ userId: 'user-2' }))).rejects.toThrow(
      'Insufficient privileges to manage users.',
    );
    expect(fetch).not.toHaveBeenCalled();
    expect(deleteUser).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
