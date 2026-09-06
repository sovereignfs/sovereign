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
  createGroupAction,
  updateGroupAction,
  deleteGroupAction,
  listResolvedGroupMembers,
  searchGroupDirectoryUsers,
  addGroupMemberAction,
  removeGroupMemberAction,
} = await import('../actions');

function formData(entries: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [key, value] of Object.entries(entries)) fd.set(key, value);
  return fd;
}

function mockAdminFetch(responses: Record<string, { status: number; body?: unknown }>) {
  return vi.fn((url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    const path = new URL(url).pathname + new URL(url).search;
    const key = `${method} ${path}`;
    const match = responses[key] ?? responses[path];
    if (!match) return Promise.reject(new Error(`unexpected fetch: ${key}`));
    return Promise.resolve(
      new Response(match.body ? JSON.stringify(match.body) : '{}', { status: match.status }),
    );
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  requireSession.mockResolvedValue({ user: { id: 'admin-1', email: 'admin@example.test' } });
  hasCapability.mockReturnValue(true);
});

/** Every test that stubs `fetch` used to unstub it by hand on its last line —
 *  a failing assertion skipped the unstub and leaked the stub into the next
 *  test. Centralised here so it runs even when an assertion throws. */
afterEach(() => {
  vi.unstubAllGlobals();
});

/**
 * All 7 exported actions in groups/actions.ts share `requireCapability`.
 * The `ActionResult`-returning mutations (update/delete/removeMember) wrap
 * it in `guarded()`, so a refusal comes back as `{ ok: false }`; the
 * `GroupActionState` actions and the read helpers still let it throw.
 */
describe('groups/actions.ts — capability gating (shared requireGroupManageCapability guard)', () => {
  it('createGroupAction rejects without user:manage', async () => {
    hasCapability.mockReturnValue(false);
    vi.stubGlobal('fetch', vi.fn());

    await expect(createGroupAction(null, formData({ name: 'Team A' }))).rejects.toThrow(
      'Insufficient privileges to manage groups.',
    );
    expect(fetch).not.toHaveBeenCalled();
  });

  it('updateGroupAction rejects without user:manage', async () => {
    hasCapability.mockReturnValue(false);
    vi.stubGlobal('fetch', vi.fn());

    await expect(
      updateGroupAction(null, formData({ id: 'group-1', name: 'Renamed' })),
    ).resolves.toEqual({ ok: false, error: 'Insufficient privileges to manage groups.' });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('deleteGroupAction rejects without user:manage', async () => {
    hasCapability.mockReturnValue(false);
    vi.stubGlobal('fetch', vi.fn());

    await expect(deleteGroupAction(formData({ id: 'group-1' }))).resolves.toEqual({
      ok: false,
      error: 'Insufficient privileges to manage groups.',
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('listResolvedGroupMembers rejects without user:manage', async () => {
    hasCapability.mockReturnValue(false);
    vi.stubGlobal('fetch', vi.fn());

    await expect(listResolvedGroupMembers('group-1')).rejects.toThrow(
      'Insufficient privileges to manage groups.',
    );
    expect(fetch).not.toHaveBeenCalled();
  });

  it('searchGroupDirectoryUsers rejects without user:manage, checking the exact capability string', async () => {
    hasCapability.mockReturnValue(false);
    vi.stubGlobal('fetch', vi.fn());

    await expect(searchGroupDirectoryUsers('al')).rejects.toThrow(
      'Insufficient privileges to manage groups.',
    );
    expect(hasCapability).toHaveBeenCalledWith(expect.anything(), 'user:manage');
    expect(searchUsers).not.toHaveBeenCalled();
  });

  it('addGroupMemberAction rejects without user:manage', async () => {
    hasCapability.mockReturnValue(false);
    vi.stubGlobal('fetch', vi.fn());

    await expect(
      addGroupMemberAction(null, formData({ groupId: 'group-1', userId: 'user-2' })),
    ).rejects.toThrow('Insufficient privileges to manage groups.');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('removeGroupMemberAction rejects without user:manage', async () => {
    hasCapability.mockReturnValue(false);
    vi.stubGlobal('fetch', vi.fn());

    await expect(
      removeGroupMemberAction(formData({ groupId: 'group-1', userId: 'user-2' })),
    ).resolves.toEqual({ ok: false, error: 'Insufficient privileges to manage groups.' });
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe('groups/actions.ts — happy paths', () => {
  it('createGroupAction creates a group and revalidates', async () => {
    vi.stubGlobal(
      'fetch',
      mockAdminFetch({ 'POST /api/admin/groups': { status: 200, body: { id: 'group-1' } } }),
    );

    const result = await createGroupAction(null, formData({ name: 'Team A', description: 'desc' }));

    expect(result).toEqual({ success: true });
  });

  it('createGroupAction rejects a missing name without calling the admin API', async () => {
    vi.stubGlobal('fetch', vi.fn());

    const result = await createGroupAction(null, formData({}));

    expect(result).toEqual({ success: false, error: 'Name is required.' });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('updateGroupAction updates a group', async () => {
    const fetchMock = mockAdminFetch({ 'PATCH /api/admin/groups/group-1': { status: 200 } });
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      updateGroupAction(null, formData({ id: 'group-1', name: 'Renamed' })),
    ).resolves.toEqual({ ok: true, message: 'Group saved.' });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/admin/groups/group-1'),
      expect.objectContaining({ method: 'PATCH' }),
    );
  });

  it('updateGroupAction requires a name and reports an API failure as a result', async () => {
    vi.stubGlobal('fetch', vi.fn());
    await expect(updateGroupAction(null, formData({ id: 'group-1', name: ' ' }))).resolves.toEqual({
      ok: false,
      error: 'Name is required.',
    });
    expect(fetch).not.toHaveBeenCalled();

    vi.stubGlobal(
      'fetch',
      mockAdminFetch({
        'PATCH /api/admin/groups/group-1': { status: 400, body: { error: 'slug taken' } },
      }),
    );
    await expect(
      updateGroupAction(null, formData({ id: 'group-1', name: 'Renamed' })),
    ).resolves.toEqual({ ok: false, error: 'slug taken' });
  });

  it('deleteGroupAction deletes a group', async () => {
    const fetchMock = mockAdminFetch({ 'DELETE /api/admin/groups/group-1': { status: 200 } });
    vi.stubGlobal('fetch', fetchMock);

    await expect(deleteGroupAction(formData({ id: 'group-1' }))).resolves.toEqual({
      ok: true,
      message: 'Group deleted.',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/admin/groups/group-1'),
      expect.objectContaining({ method: 'DELETE' }),
    );
  });

  it('deleteGroupAction reports a policy-referenced group as blocked, and forces on request', async () => {
    const fetchMock = mockAdminFetch({
      'DELETE /api/admin/groups/group-1': {
        status: 409,
        body: { error: 'group is referenced by one or more plugin access policies' },
      },
      'DELETE /api/admin/groups/group-1?force=true': { status: 200 },
    });
    vi.stubGlobal('fetch', fetchMock);

    const blocked = await deleteGroupAction(formData({ id: 'group-1' }));
    expect(blocked).toMatchObject({ ok: false, blocked: true });

    await expect(deleteGroupAction(formData({ id: 'group-1', force: 'true' }))).resolves.toEqual({
      ok: true,
      message: 'Group deleted.',
    });
    expect(fetchMock).toHaveBeenLastCalledWith(
      expect.stringContaining('/api/admin/groups/group-1?force=true'),
      expect.objectContaining({ method: 'DELETE' }),
    );
  });

  it('listResolvedGroupMembers joins membership with directory info', async () => {
    vi.stubGlobal(
      'fetch',
      mockAdminFetch({
        'GET /api/admin/groups/group-1/members': {
          status: 200,
          body: [{ userId: 'user-2', addedAt: 1000 }],
        },
      }),
    );
    resolveUsers.mockResolvedValue([
      {
        id: 'user-2',
        name: 'Bob',
        email: 'bob@example.test',
        image: 'https://example.test/bob.png',
      },
    ]);

    const result = await listResolvedGroupMembers('group-1');

    expect(result).toEqual([
      {
        userId: 'user-2',
        addedAt: 1000,
        name: 'Bob',
        email: 'bob@example.test',
        image: 'https://example.test/bob.png',
      },
    ]);
  });

  it('searchGroupDirectoryUsers returns matches for an authorized session', async () => {
    searchUsers.mockResolvedValue([{ id: 'user-2', name: 'Alice', email: 'alice@example.test' }]);

    const result = await searchGroupDirectoryUsers('ali');

    expect(searchUsers).toHaveBeenCalledWith({ query: 'ali', limit: 8 });
    expect(result).toEqual([{ id: 'user-2', name: 'Alice', email: 'alice@example.test' }]);
  });

  it('searchGroupDirectoryUsers returns empty for a too-short query without calling the directory', async () => {
    const result = await searchGroupDirectoryUsers('a');

    expect(result).toEqual([]);
    expect(searchUsers).not.toHaveBeenCalled();
  });

  it('addGroupMemberAction adds a member and revalidates', async () => {
    vi.stubGlobal(
      'fetch',
      mockAdminFetch({ 'POST /api/admin/groups/group-1/members': { status: 200 } }),
    );

    const result = await addGroupMemberAction(
      null,
      formData({ groupId: 'group-1', userId: 'user-2' }),
    );

    expect(result).toEqual({ success: true });
  });

  it('removeGroupMemberAction removes a member', async () => {
    const fetchMock = mockAdminFetch({
      'DELETE /api/admin/groups/group-1/members/user-2': { status: 200 },
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      removeGroupMemberAction(formData({ groupId: 'group-1', userId: 'user-2' })),
    ).resolves.toEqual({ ok: true });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/admin/groups/group-1/members/user-2'),
      expect.objectContaining({ method: 'DELETE' }),
    );
  });
});
