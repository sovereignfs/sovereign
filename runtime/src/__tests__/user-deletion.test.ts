import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@sovereignfs/db', () => ({
  deleteUserData: vi.fn(async () => ({ platformRowsDeleted: 0 })),
  dropPluginDb: vi.fn(async () => {}),
  hardDeleteUserE2eeData: vi.fn(async () => {}),
  hardDeleteUserStorageObjects: vi.fn(async () => []),
  getPluginDb: vi.fn(() => ({ db: {} })),
}));
vi.mock('@sovereignfs/manifest', () => ({
  manifestDatabaseIsolation: (type: unknown) => (type === 'platform' ? 'shared' : 'isolated'),
}));
vi.mock('../db', () => ({ getPlatformDb: vi.fn(async () => ({ db: {} })) }));
vi.mock('../avatars', () => ({ findAvatarFile: vi.fn(() => null) }));
vi.mock('../portability/registry', () => ({ getAllDeleters: vi.fn(() => []) }));
vi.mock('../registry', () => ({ getInstalledPlugins: vi.fn(() => []) }));
vi.mock('../storage', () => ({ deleteObjectBytes: vi.fn() }));

import { dropPluginDb } from '@sovereignfs/db';
import { getAllDeleters } from '../portability/registry';
import { getInstalledPlugins } from '../registry';
import { deleteUser } from '../user-deletion';

const ISOLATED_NO_HANDLER = { id: 'com.example.isolated-no-handler', type: 'sovereign' };
const ISOLATED_WITH_HANDLER = { id: 'com.example.isolated-with-handler', type: 'sovereign' };
const PLATFORM_PLUGIN = { id: 'account', type: 'platform' };

function mockMembers(members: Array<{ id: string | null }>): void {
  const fetchMock = vi.fn(async (url: string) => {
    if (url.endsWith('/api/admin/users')) {
      return { ok: true, json: async () => members } as Response;
    }
    // Phase 6: better-auth user-removal DELETE call.
    return { ok: true, json: async () => ({}) } as Response;
  });
  vi.stubGlobal('fetch', fetchMock);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getInstalledPlugins).mockReturnValue([
    ISOLATED_NO_HANDLER,
    ISOLATED_WITH_HANDLER,
    PLATFORM_PLUGIN,
  ] as never);
  vi.mocked(getAllDeleters).mockReturnValue([
    [ISOLATED_WITH_HANDLER.id, vi.fn(async () => ({ rowsDeleted: 1 }))],
  ] as never);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('deleteUser — isolated plugin DB cleanup (GDPR-2)', () => {
  it('does not drop any isolated plugin database on a multi-user instance', async () => {
    mockMembers([{ id: 'u1' }, { id: 'u2' }]);

    const summary = await deleteUser('u1', 'default');

    expect(dropPluginDb).not.toHaveBeenCalled();
    expect(summary.droppedPluginDbs).toEqual([]);
  });

  it('drops every isolated plugin database when the deleted user was the only user', async () => {
    mockMembers([{ id: 'u1' }]);

    const summary = await deleteUser('u1', 'default');

    // Both isolated plugins get dropped — including the one with a
    // provideDelete handler, which is harmless (its rows are already gone)
    // and is the only way to close the gap for the one with no handler.
    expect(dropPluginDb).toHaveBeenCalledWith(ISOLATED_NO_HANDLER.id);
    expect(dropPluginDb).toHaveBeenCalledWith(ISOLATED_WITH_HANDLER.id);
    expect(dropPluginDb).not.toHaveBeenCalledWith(PLATFORM_PLUGIN.id);
    expect(summary.droppedPluginDbs.sort()).toEqual(
      [ISOLATED_NO_HANDLER.id, ISOLATED_WITH_HANDLER.id].sort(),
    );
  });

  it('records a drop failure without aborting the rest of the cascade', async () => {
    mockMembers([{ id: 'u1' }]);
    vi.mocked(dropPluginDb).mockImplementation(async (pluginId: string) => {
      if (pluginId === ISOLATED_NO_HANDLER.id) throw new Error('namespace already gone');
    });

    const summary = await deleteUser('u1', 'default');

    expect(summary.errors.some((e) => e.includes(ISOLATED_NO_HANDLER.id))).toBe(true);
    expect(summary.droppedPluginDbs).toEqual([ISOLATED_WITH_HANDLER.id]);
  });
});
