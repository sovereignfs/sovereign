import { beforeEach, describe, expect, it, vi } from 'vitest';

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

/**
 * All 7 exported actions in groups/actions.ts route through one shared
 * requireGroupManageCapability() guard, which unconditionally throws
 * (not a { success: false } return) when hasCapability returns false —
 * including createGroupAction/addGroupMemberAction, which otherwise use a
 * GroupActionState success/failure return convention for their own
 * domain-specific validation ("Name is required.", etc.). The guard's own
 * throw is never caught inside those two actions, so it propagates out
 * uniformly across all 7 actions.
 */
describe('groups/actions.ts — capability gating (shared requireGroupManageCapability guard)', () => {
  it('createGroupAction rejects without user:manage', async () => {
    hasCapability.mockReturnValue(false);
    vi.stubGlobal('fetch', vi.fn());

    await expect(createGroupAction(null, formData({ name: 'Team A' }))).rejects.toThrow(
      'Insufficient privileges to manage groups.',
    );
    expect(fetch).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('updateGroupAction rejects without user:manage', async () => {
    hasCapability.mockReturnValue(false);
    vi.stubGlobal('fetch', vi.fn());

    await expect(updateGroupAction(formData({ id: 'group-1', name: 'Renamed' }))).rejects.toThrow(
      'Insufficient privileges to manage groups.',
    );
    expect(fetch).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('deleteGroupAction rejects without user:manage', async () => {
    hasCapability.mockReturnValue(false);
    vi.stubGlobal('fetch', vi.fn());

    await expect(deleteGroupAction(formData({ id: 'group-1' }))).rejects.toThrow(
      'Insufficient privileges to manage groups.',
    );
    expect(fetch).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('listResolvedGroupMembers rejects without user:manage', async () => {
    hasCapability.mockReturnValue(false);
    vi.stubGlobal('fetch', vi.fn());

    await expect(listResolvedGroupMembers('group-1')).rejects.toThrow(
      'Insufficient privileges to manage groups.',
    );
    expect(fetch).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('searchGroupDirectoryUsers rejects without user:manage, checking the exact capability string', async () => {
    hasCapability.mockReturnValue(false);
    vi.stubGlobal('fetch', vi.fn());

    await expect(searchGroupDirectoryUsers('al')).rejects.toThrow(
      'Insufficient privileges to manage groups.',
    );
    expect(hasCapability).toHaveBeenCalledWith(expect.anything(), 'user:manage');
    expect(searchUsers).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('addGroupMemberAction rejects without user:manage', async () => {
    hasCapability.mockReturnValue(false);
    vi.stubGlobal('fetch', vi.fn());

    await expect(
      addGroupMemberAction(null, formData({ groupId: 'group-1', userId: 'user-2' })),
    ).rejects.toThrow('Insufficient privileges to manage groups.');
    expect(fetch).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('removeGroupMemberAction rejects without user:manage', async () => {
    hasCapability.mockReturnValue(false);
    vi.stubGlobal('fetch', vi.fn());

    await expect(
      removeGroupMemberAction(formData({ groupId: 'group-1', userId: 'user-2' })),
    ).rejects.toThrow('Insufficient privileges to manage groups.');
    expect(fetch).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
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
    vi.unstubAllGlobals();
  });

  it('createGroupAction rejects a missing name without calling the admin API', async () => {
    vi.stubGlobal('fetch', vi.fn());

    const result = await createGroupAction(null, formData({}));

    expect(result).toEqual({ success: false, error: 'Name is required.' });
    expect(fetch).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('updateGroupAction updates a group', async () => {
    const fetchMock = mockAdminFetch({ 'PATCH /api/admin/groups/group-1': { status: 200 } });
    vi.stubGlobal('fetch', fetchMock);

    await updateGroupAction(formData({ id: 'group-1', name: 'Renamed' }));

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/admin/groups/group-1'),
      expect.objectContaining({ method: 'PATCH' }),
    );
    vi.unstubAllGlobals();
  });

  it('deleteGroupAction deletes a group', async () => {
    const fetchMock = mockAdminFetch({ 'DELETE /api/admin/groups/group-1': { status: 200 } });
    vi.stubGlobal('fetch', fetchMock);

    await deleteGroupAction(formData({ id: 'group-1' }));

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/admin/groups/group-1'),
      expect.objectContaining({ method: 'DELETE' }),
    );
    vi.unstubAllGlobals();
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
    vi.unstubAllGlobals();
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
    vi.unstubAllGlobals();
  });

  it('removeGroupMemberAction removes a member', async () => {
    const fetchMock = mockAdminFetch({
      'DELETE /api/admin/groups/group-1/members/user-2': { status: 200 },
    });
    vi.stubGlobal('fetch', fetchMock);

    await removeGroupMemberAction(formData({ groupId: 'group-1', userId: 'user-2' }));

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/admin/groups/group-1/members/user-2'),
      expect.objectContaining({ method: 'DELETE' }),
    );
    vi.unstubAllGlobals();
  });
});
