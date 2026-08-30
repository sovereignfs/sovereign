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
  vouchAction,
  revokeVouchAction,
  grantCapabilityAction,
  revokeCapabilityAction,
  listUserCapabilitiesAction,
  listInvitablePluginOptions,
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
  it('refuses a session without user:manage', async () => {
    hasCapability.mockReturnValue(false);
    vi.stubGlobal('fetch', vi.fn());

    const result = await sendInviteAction(null, formData({ email: 'new@example.test' }));

    expect(result).toEqual({
      success: false,
      error: 'Insufficient privileges to manage users.',
    });
    expect(fetch).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

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
 * docs/architecture-rules.md). Fixed alongside this test. This
 * "refuses a session without <capability>" pattern is now applied
 * uniformly across every one of this file's 12 exported actions (task
 * 13.11, workstream 0020 leg 7) — not just this one — so a future regression
 * on any sibling action can never again slip through undetected. The
 * identical gap was independently found (and fixed the same way) in
 * sendInviteAction and listUserCapabilitiesAction below.
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

describe('vouchAction — trust escalation', () => {
  it('refuses a session without user:manage', async () => {
    hasCapability.mockReturnValue(false);
    vi.stubGlobal('fetch', vi.fn());

    await expect(vouchAction(formData({ userId: 'user-2' }))).rejects.toThrow(
      'Insufficient privileges to manage users.',
    );
    expect(fetch).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('vouches for an authorized target user', async () => {
    const fetchMock = mockAdminFetch({
      'POST /api/admin/users/user-2/vouch': {
        status: 200,
        body: { id: 'user-2', email: 'u2@example.test' },
      },
    });
    vi.stubGlobal('fetch', fetchMock);

    await vouchAction(formData({ userId: 'user-2' }));

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/admin/users/user-2/vouch'),
      expect.objectContaining({ method: 'POST' }),
    );
    vi.unstubAllGlobals();
  });
});

describe('revokeVouchAction — trust de-escalation', () => {
  it('refuses a session without user:manage', async () => {
    hasCapability.mockReturnValue(false);
    vi.stubGlobal('fetch', vi.fn());

    await expect(revokeVouchAction(formData({ userId: 'user-2' }))).rejects.toThrow(
      'Insufficient privileges to manage users.',
    );
    expect(fetch).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('revokes the vouch for an authorized target user', async () => {
    const fetchMock = mockAdminFetch({
      'DELETE /api/admin/users/user-2/vouch': {
        status: 200,
        body: { id: 'user-2', email: 'u2@example.test' },
      },
    });
    vi.stubGlobal('fetch', fetchMock);

    await revokeVouchAction(formData({ userId: 'user-2' }));

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/admin/users/user-2/vouch'),
      expect.objectContaining({ method: 'DELETE' }),
    );
    vi.unstubAllGlobals();
  });
});

describe('grantCapabilityAction — per-user capability grants (RFC 0070)', () => {
  it('refuses a session without user:manage', async () => {
    hasCapability.mockReturnValue(false);
    vi.stubGlobal('fetch', vi.fn());

    await expect(
      grantCapabilityAction(formData({ userId: 'user-2', capability: 'user:manage' })),
    ).rejects.toThrow('Insufficient privileges to grant capabilities.');
    expect(fetch).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('grants a capability to an authorized target user', async () => {
    const fetchMock = mockAdminFetch({
      'POST /api/admin/users/user-2/capabilities': { status: 200 },
    });
    vi.stubGlobal('fetch', fetchMock);

    await grantCapabilityAction(formData({ userId: 'user-2', capability: 'user:manage' }));

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/admin/users/user-2/capabilities'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ capability: 'user:manage' }),
      }),
    );
    vi.unstubAllGlobals();
  });
});

describe('revokeCapabilityAction — per-user capability grants (RFC 0070)', () => {
  it('refuses a session without user:manage', async () => {
    hasCapability.mockReturnValue(false);
    vi.stubGlobal('fetch', vi.fn());

    await expect(
      revokeCapabilityAction(formData({ userId: 'user-2', capability: 'user:manage' })),
    ).rejects.toThrow('Insufficient privileges to revoke capabilities.');
    expect(fetch).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('revokes a capability from an authorized target user', async () => {
    const fetchMock = mockAdminFetch({
      'DELETE /api/admin/users/user-2/capabilities/user%3Amanage': { status: 200 },
    });
    vi.stubGlobal('fetch', fetchMock);

    await revokeCapabilityAction(formData({ userId: 'user-2', capability: 'user:manage' }));

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/admin/users/user-2/capabilities/user%3Amanage'),
      expect.objectContaining({ method: 'DELETE' }),
    );
    vi.unstubAllGlobals();
  });
});

/**
 * Regression coverage for the same class of gap resetMfaAction once had
 * (see the block above): listUserCapabilitiesAction previously called only
 * requireSession(), with no hasCapability check at all — unlike every
 * sibling action in this file. Any authenticated non-admin user could read
 * any other user's granted capabilities by invoking the action directly
 * (server actions are reachable by action id independent of the Console
 * page's adminOnly gate — see docs/architecture-rules.md). Fixed alongside
 * this test. CapabilitiesButton.tsx's existing `.catch(() => setGrants([]))`
 * already handles the resulting rejection gracefully, so no client-side
 * change was needed.
 */
describe('listUserCapabilitiesAction — admin-only behavior (regression)', () => {
  it('refuses a session without user:manage', async () => {
    hasCapability.mockReturnValue(false);
    vi.stubGlobal('fetch', vi.fn());

    await expect(listUserCapabilitiesAction('user-2')).rejects.toThrow(
      'Insufficient privileges to view capabilities.',
    );
    expect(fetch).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('maps the API response to a flat capability list for an authorized session', async () => {
    vi.stubGlobal(
      'fetch',
      mockAdminFetch({
        'GET /api/admin/users/user-2/capabilities': {
          status: 200,
          body: [{ capability: 'user:manage' }, { capability: 'role:assign' }],
        },
      }),
    );

    const result = await listUserCapabilitiesAction('user-2');

    expect(result).toEqual(['user:manage', 'role:assign']);
    vi.unstubAllGlobals();
  });
});

describe('listInvitablePluginOptions — invite multi-select options (RFC 0065)', () => {
  it('filters out chrome plugins, keeping only invitable ones', async () => {
    getInstalledPlugins.mockReturnValue([
      { id: 'launcher', name: 'Launcher' },
      { id: 'fs.example.notes', name: 'Notes' },
      { id: 'fs.example.tasks', name: 'Tasks' },
    ]);

    const result = await listInvitablePluginOptions();

    expect(result).toEqual([
      { id: 'fs.example.notes', name: 'Notes' },
      { id: 'fs.example.tasks', name: 'Tasks' },
    ]);
  });
});
