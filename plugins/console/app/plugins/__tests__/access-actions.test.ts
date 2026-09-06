import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const requireSession = vi.fn();
const hasCapability = vi.fn();
const resolveUsers = vi.fn();
const searchUsers = vi.fn();

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
    directory: {
      resolveUsers: (...args: unknown[]) => resolveUsers(...args),
      searchUsers: (...args: unknown[]) => searchUsers(...args),
    },
  },
}));

const {
  activatePluginAction,
  getPluginAccessState,
  listResolvedPluginAccessUsers,
  listResolvedPluginAccessGroups,
  searchPluginAccessDirectoryUsers,
  listGroupOptions,
  setPluginAccessPolicyAction,
  grantPluginAccessUserAction,
  revokePluginAccessUserAction,
  grantPluginAccessGroupAction,
  revokePluginAccessGroupAction,
} = await import('../actions');

const DENIED = 'Insufficient privileges to manage apps.';
const ACCESS = '/api/admin/plugins/tasks/access';
const STATE = {
  accessPolicy: 'selected_users',
  selfService: false,
  users: [{ userId: 'u-1', grantedByUserId: 'admin-1', grantedAt: 1 }],
  groups: [{ groupId: 'g-1', grantedByUserId: 'admin-1', grantedAt: 1 }],
};

function formData(entries: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [key, value] of Object.entries(entries)) fd.set(key, value);
  return fd;
}

/** Admin API responses keyed by "METHOD path" (no query strings are used here). */
function mockAdminFetch(responses: Record<string, { status: number; body?: unknown }>) {
  const fetchMock = vi.fn((url: string, init?: RequestInit) => {
    const key = `${init?.method ?? 'GET'} ${new URL(url).pathname}`;
    const match = responses[key];
    if (!match) return Promise.reject(new Error(`unexpected fetch: ${key}`));
    return Promise.resolve(
      new Response(match.body === undefined ? '{}' : JSON.stringify(match.body), {
        status: match.status,
      }),
    );
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

beforeEach(() => {
  vi.clearAllMocks();
  requireSession.mockResolvedValue({ user: { id: 'admin-1' } });
  hasCapability.mockReturnValue(true);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/**
 * Every access-policy action attaches SOVEREIGN_ADMIN_KEY on the caller's
 * behalf, so each one must refuse a session without plugin:manage before
 * any admin API call — the whole table, not just the two that had tests.
 */
describe('plugin access actions — refuse without plugin:manage, before any admin API call', () => {
  const cases: [string, () => Promise<unknown>][] = [
    ['activatePluginAction', () => activatePluginAction(null, formData({ pluginId: 'tasks' }))],
    ['getPluginAccessState', () => getPluginAccessState('tasks')],
    ['listResolvedPluginAccessUsers', () => listResolvedPluginAccessUsers('tasks')],
    ['listResolvedPluginAccessGroups', () => listResolvedPluginAccessGroups('tasks')],
    ['searchPluginAccessDirectoryUsers', () => searchPluginAccessDirectoryUsers('ali')],
    ['listGroupOptions', () => listGroupOptions()],
    [
      'setPluginAccessPolicyAction',
      () => setPluginAccessPolicyAction(formData({ pluginId: 'tasks', accessPolicy: 'admins' })),
    ],
    [
      'grantPluginAccessUserAction',
      () => grantPluginAccessUserAction(null, formData({ pluginId: 'tasks', userId: 'u-1' })),
    ],
    [
      'revokePluginAccessUserAction',
      () => revokePluginAccessUserAction(formData({ pluginId: 'tasks', userId: 'u-1' })),
    ],
    [
      'grantPluginAccessGroupAction',
      () => grantPluginAccessGroupAction(null, formData({ pluginId: 'tasks', groupId: 'g-1' })),
    ],
    [
      'revokePluginAccessGroupAction',
      () => revokePluginAccessGroupAction(formData({ pluginId: 'tasks', groupId: 'g-1' })),
    ],
  ];

  // The three `ActionResult` mutations return the refusal; the reads and the
  // `useActionState`-shaped grants still throw it.
  const RESOLVING = new Set([
    'setPluginAccessPolicyAction',
    'revokePluginAccessUserAction',
    'revokePluginAccessGroupAction',
  ]);

  for (const [name, call] of cases) {
    it(`${name} refuses and never calls fetch`, async () => {
      hasCapability.mockReturnValue(false);
      const fetchMock = mockAdminFetch({});

      if (RESOLVING.has(name)) {
        await expect(call()).resolves.toEqual({ ok: false, error: DENIED });
      } else {
        await expect(call()).rejects.toThrow(DENIED);
      }
      expect(fetchMock).not.toHaveBeenCalled();
      expect(hasCapability).toHaveBeenCalledWith(expect.anything(), 'plugin:manage');
    });
  }
});

describe('activatePluginAction', () => {
  it('POSTs the activate endpoint and reports first-time activation', async () => {
    const fetchMock = mockAdminFetch({
      'POST /api/admin/plugins/tasks/activate': { status: 200, body: { activated: true } },
    });

    await expect(activatePluginAction(null, formData({ pluginId: 'tasks' }))).resolves.toEqual({
      success: true,
      alreadyActive: false,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('reports an already-active plugin without treating it as a failure', async () => {
    mockAdminFetch({
      'POST /api/admin/plugins/tasks/activate': { status: 200, body: { activated: false } },
    });

    await expect(activatePluginAction(null, formData({ pluginId: 'tasks' }))).resolves.toEqual({
      success: true,
      alreadyActive: true,
    });
  });

  it('surfaces a manifest hard-disable as an inline error', async () => {
    mockAdminFetch({
      'POST /api/admin/plugins/tasks/activate': {
        status: 200,
        body: { activated: false, reason: 'hard-disabled' },
      },
    });

    const result = await activatePluginAction(null, formData({ pluginId: 'tasks' }));
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toMatch(/hard-disabled/);
  });

  it('returns the API error body on a non-OK response', async () => {
    mockAdminFetch({
      'POST /api/admin/plugins/tasks/activate': { status: 409, body: { error: 'incompatible' } },
    });

    await expect(activatePluginAction(null, formData({ pluginId: 'tasks' }))).resolves.toEqual({
      success: false,
      error: 'incompatible',
    });
  });
});

describe('access state readers', () => {
  it('getPluginAccessState returns the API state', async () => {
    mockAdminFetch({ [`GET ${ACCESS}`]: { status: 200, body: STATE } });
    await expect(getPluginAccessState('tasks')).resolves.toEqual(STATE);
  });

  it('getPluginAccessState degrades to the "everyone" default on a non-OK response', async () => {
    mockAdminFetch({ [`GET ${ACCESS}`]: { status: 500 } });
    await expect(getPluginAccessState('tasks')).resolves.toEqual({
      accessPolicy: 'everyone',
      selfService: false,
      users: [],
      groups: [],
    });
  });

  it('listResolvedPluginAccessUsers joins grants with directory names, falling back to the id', async () => {
    mockAdminFetch({ [`GET ${ACCESS}`]: { status: 200, body: STATE } });
    resolveUsers.mockResolvedValue([{ id: 'u-1', name: 'Ada', email: 'ada@example.test' }]);

    await expect(listResolvedPluginAccessUsers('tasks')).resolves.toEqual([
      { userId: 'u-1', name: 'Ada', email: 'ada@example.test' },
    ]);
    expect(resolveUsers).toHaveBeenCalledWith({ ids: ['u-1'] });
  });

  it('listResolvedPluginAccessUsers skips the directory lookup when there are no grants', async () => {
    mockAdminFetch({ [`GET ${ACCESS}`]: { status: 200, body: { ...STATE, users: [] } } });
    await expect(listResolvedPluginAccessUsers('tasks')).resolves.toEqual([]);
    expect(resolveUsers).not.toHaveBeenCalled();
  });

  it('listResolvedPluginAccessGroups joins grants with group names, falling back to the id', async () => {
    mockAdminFetch({
      [`GET ${ACCESS}`]: { status: 200, body: STATE },
      'GET /api/admin/groups': { status: 200, body: [{ id: 'g-1', name: 'Editors' }] },
    });
    await expect(listResolvedPluginAccessGroups('tasks')).resolves.toEqual([
      { groupId: 'g-1', name: 'Editors' },
    ]);
  });

  it('searchPluginAccessDirectoryUsers ignores queries under two characters', async () => {
    mockAdminFetch({});
    await expect(searchPluginAccessDirectoryUsers(' a ')).resolves.toEqual([]);
    expect(searchUsers).not.toHaveBeenCalled();
  });

  it('searchPluginAccessDirectoryUsers trims and forwards the query', async () => {
    mockAdminFetch({});
    searchUsers.mockResolvedValue([{ id: 'u-1' }]);
    await expect(searchPluginAccessDirectoryUsers(' ada ')).resolves.toEqual([{ id: 'u-1' }]);
    expect(searchUsers).toHaveBeenCalledWith({ query: 'ada', limit: 8 });
  });

  it('listGroupOptions returns [] on a non-OK response', async () => {
    mockAdminFetch({ 'GET /api/admin/groups': { status: 503 } });
    await expect(listGroupOptions()).resolves.toEqual([]);
  });
});

describe('access policy mutations', () => {
  it('setPluginAccessPolicyAction PATCHes policy and self-service together', async () => {
    const fetchMock = mockAdminFetch({ [`PATCH ${ACCESS}`]: { status: 200 } });

    await setPluginAccessPolicyAction(
      formData({ pluginId: 'tasks', accessPolicy: 'selected_users', selfService: 'true' }),
    );

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining(ACCESS),
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ accessPolicy: 'selected_users', selfService: true }),
      }),
    );
  });

  it('setPluginAccessPolicyAction reports a non-OK response as a result', async () => {
    mockAdminFetch({ [`PATCH ${ACCESS}`]: { status: 400 } });
    await expect(
      setPluginAccessPolicyAction(formData({ pluginId: 'tasks', accessPolicy: 'bogus' })),
    ).resolves.toEqual({ ok: false, error: 'Failed to update access policy: 400' });
  });

  it('grantPluginAccessUserAction requires a picked user before calling the API', async () => {
    const fetchMock = mockAdminFetch({});
    await expect(
      grantPluginAccessUserAction(null, formData({ pluginId: 'tasks', userId: '' })),
    ).resolves.toEqual({ success: false, error: 'Pick a person from the search results.' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('grantPluginAccessUserAction POSTs the grant and returns the API error on failure', async () => {
    mockAdminFetch({ [`POST ${ACCESS}/users`]: { status: 200 } });
    await expect(
      grantPluginAccessUserAction(null, formData({ pluginId: 'tasks', userId: 'u-1' })),
    ).resolves.toEqual({ success: true });

    mockAdminFetch({ [`POST ${ACCESS}/users`]: { status: 404, body: { error: 'no such user' } } });
    await expect(
      grantPluginAccessUserAction(null, formData({ pluginId: 'tasks', userId: 'u-9' })),
    ).resolves.toEqual({ success: false, error: 'no such user' });
  });

  it('revokePluginAccessUserAction DELETEs the grant and reports failure as a result', async () => {
    const fetchMock = mockAdminFetch({ [`DELETE ${ACCESS}/users/u-1`]: { status: 200 } });
    await revokePluginAccessUserAction(formData({ pluginId: 'tasks', userId: 'u-1' }));
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining(`${ACCESS}/users/u-1`),
      expect.objectContaining({ method: 'DELETE' }),
    );

    mockAdminFetch({ [`DELETE ${ACCESS}/users/u-1`]: { status: 500 } });
    await expect(
      revokePluginAccessUserAction(formData({ pluginId: 'tasks', userId: 'u-1' })),
    ).resolves.toEqual({ ok: false, error: 'Failed to revoke access: 500' });
  });

  it('grantPluginAccessGroupAction requires a group and POSTs the grant', async () => {
    const fetchMock = mockAdminFetch({ [`POST ${ACCESS}/groups`]: { status: 200 } });
    await expect(
      grantPluginAccessGroupAction(null, formData({ pluginId: 'tasks', groupId: '' })),
    ).resolves.toEqual({ success: false, error: 'Pick a group.' });
    expect(fetchMock).not.toHaveBeenCalled();

    await expect(
      grantPluginAccessGroupAction(null, formData({ pluginId: 'tasks', groupId: 'g-1' })),
    ).resolves.toEqual({ success: true });
  });

  it('revokePluginAccessGroupAction DELETEs the grant and reports failure as a result', async () => {
    mockAdminFetch({ [`DELETE ${ACCESS}/groups/g-1`]: { status: 200 } });
    await expect(
      revokePluginAccessGroupAction(formData({ pluginId: 'tasks', groupId: 'g-1' })),
    ).resolves.toEqual({ ok: true });

    mockAdminFetch({ [`DELETE ${ACCESS}/groups/g-1`]: { status: 500 } });
    await expect(
      revokePluginAccessGroupAction(formData({ pluginId: 'tasks', groupId: 'g-1' })),
    ).resolves.toEqual({ ok: false, error: 'Failed to revoke access: 500' });
  });
});
