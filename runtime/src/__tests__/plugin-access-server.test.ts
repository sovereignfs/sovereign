import { afterEach, describe, expect, it, vi } from 'vitest';

// Mock @sovereignfs/db before importing the module under test so the real DB
// is never opened during unit tests.
vi.mock('@sovereignfs/db', () => ({
  getPluginAccessPolicy: vi.fn(),
  hasPluginAccessUserGrant: vi.fn(),
  listPluginAccessPolicies: vi.fn(),
  listPluginIdsGrantedToUser: vi.fn(),
  listPluginIdsGrantedToUserGroups: vi.fn(),
}));

import {
  getPluginAccessPolicy,
  hasPluginAccessUserGrant,
  listPluginAccessPolicies,
  listPluginIdsGrantedToUser,
  listPluginIdsGrantedToUserGroups,
} from '@sovereignfs/db';
import { canUserOpenPlugin, getRestrictedPluginIds } from '../plugin-access-server';

const mockPdb = { dialect: 'sqlite' } as never;

afterEach(() => {
  vi.clearAllMocks();
});

describe('canUserOpenPlugin', () => {
  it('always allows a chrome plugin when installed and enabled, skipping DB lookups', async () => {
    const result = await canUserOpenPlugin(
      mockPdb,
      'u1',
      'platform:user',
      'fs.sovereign.launcher',
      true,
      true,
    );
    expect(result).toBe(true);
    expect(getPluginAccessPolicy).not.toHaveBeenCalled();
  });

  it('denies a chrome plugin that is disabled', async () => {
    const result = await canUserOpenPlugin(
      mockPdb,
      'u1',
      'platform:user',
      'fs.sovereign.launcher',
      true,
      false,
    );
    expect(result).toBe(false);
  });

  it('defaults to everyone when no policy row exists', async () => {
    vi.mocked(getPluginAccessPolicy).mockResolvedValue(undefined);
    const result = await canUserOpenPlugin(
      mockPdb,
      'u1',
      'platform:user',
      'fs.example.tasks',
      true,
      true,
    );
    expect(result).toBe(true);
  });

  it('selected_users: checks the direct grant only when policy is selected_users', async () => {
    vi.mocked(getPluginAccessPolicy).mockResolvedValue({
      pluginId: 'fs.example.tasks',
      accessPolicy: 'selected_users',
      selfService: false,
    });
    vi.mocked(hasPluginAccessUserGrant).mockResolvedValue(true);

    const result = await canUserOpenPlugin(
      mockPdb,
      'u1',
      'platform:user',
      'fs.example.tasks',
      true,
      true,
    );
    expect(result).toBe(true);
    expect(hasPluginAccessUserGrant).toHaveBeenCalledWith(mockPdb, 'fs.example.tasks', 'u1');
  });

  it('selected_users: denies without a direct grant', async () => {
    vi.mocked(getPluginAccessPolicy).mockResolvedValue({
      pluginId: 'fs.example.tasks',
      accessPolicy: 'selected_users',
      selfService: false,
    });
    vi.mocked(hasPluginAccessUserGrant).mockResolvedValue(false);

    const result = await canUserOpenPlugin(
      mockPdb,
      'u1',
      'platform:user',
      'fs.example.tasks',
      true,
      true,
    );
    expect(result).toBe(false);
  });

  it('selected_groups: checks group grant membership via the bulk resolver', async () => {
    vi.mocked(getPluginAccessPolicy).mockResolvedValue({
      pluginId: 'fs.example.tasks',
      accessPolicy: 'selected_groups',
      selfService: false,
    });
    vi.mocked(listPluginIdsGrantedToUserGroups).mockResolvedValue(['fs.example.tasks']);

    const result = await canUserOpenPlugin(
      mockPdb,
      'u1',
      'platform:user',
      'fs.example.tasks',
      true,
      true,
    );
    expect(result).toBe(true);
  });

  it('admins: grants for a user with console:access without any DB grant lookups', async () => {
    vi.mocked(getPluginAccessPolicy).mockResolvedValue({
      pluginId: 'fs.example.tasks',
      accessPolicy: 'admins',
      selfService: false,
    });

    const result = await canUserOpenPlugin(
      mockPdb,
      'u1',
      'platform:admin',
      'fs.example.tasks',
      true,
      true,
    );
    expect(result).toBe(true);
    expect(hasPluginAccessUserGrant).not.toHaveBeenCalled();
    expect(listPluginIdsGrantedToUserGroups).not.toHaveBeenCalled();
  });

  it('disabled: denies regardless of grants', async () => {
    vi.mocked(getPluginAccessPolicy).mockResolvedValue({
      pluginId: 'fs.example.tasks',
      accessPolicy: 'disabled',
      selfService: false,
    });

    const result = await canUserOpenPlugin(
      mockPdb,
      'u1',
      'platform:owner',
      'fs.example.tasks',
      true,
      true,
    );
    expect(result).toBe(false);
  });
});

describe('getRestrictedPluginIds', () => {
  it('excludes chrome plugins from the candidate set and returns [] when nothing else installed', async () => {
    const result = await getRestrictedPluginIds(mockPdb, 'u1', 'platform:user', [
      'fs.sovereign.launcher',
      'fs.sovereign.account',
    ]);
    expect(result).toEqual([]);
    expect(listPluginAccessPolicies).not.toHaveBeenCalled();
  });

  it('resolves the restricted set across everyone/selected_users/selected_groups/disabled policies', async () => {
    vi.mocked(listPluginAccessPolicies).mockResolvedValue([
      { pluginId: 'fs.example.open', accessPolicy: 'everyone', selfService: false },
      { pluginId: 'fs.example.mine', accessPolicy: 'selected_users', selfService: false },
      { pluginId: 'fs.example.theirs', accessPolicy: 'selected_users', selfService: false },
      { pluginId: 'fs.example.group', accessPolicy: 'selected_groups', selfService: false },
      { pluginId: 'fs.example.off', accessPolicy: 'disabled', selfService: false },
    ]);
    vi.mocked(listPluginIdsGrantedToUser).mockResolvedValue(['fs.example.mine']);
    vi.mocked(listPluginIdsGrantedToUserGroups).mockResolvedValue(['fs.example.group']);

    const result = await getRestrictedPluginIds(mockPdb, 'u1', 'platform:user', [
      'fs.example.open',
      'fs.example.mine',
      'fs.example.theirs',
      'fs.example.group',
      'fs.example.off',
    ]);

    expect(result.sort()).toEqual(['fs.example.off', 'fs.example.theirs']);
  });

  it('a plugin with no explicit policy row defaults to everyone (never restricted)', async () => {
    vi.mocked(listPluginAccessPolicies).mockResolvedValue([]);
    vi.mocked(listPluginIdsGrantedToUser).mockResolvedValue([]);
    vi.mocked(listPluginIdsGrantedToUserGroups).mockResolvedValue([]);

    const result = await getRestrictedPluginIds(mockPdb, 'u1', 'platform:user', [
      'fs.example.untouched',
    ]);
    expect(result).toEqual([]);
  });
});
