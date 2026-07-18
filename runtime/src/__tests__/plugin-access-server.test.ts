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

vi.mock('../user-capabilities', () => ({
  hasUserCapability: vi.fn(),
}));

import {
  getPluginAccessPolicy,
  hasPluginAccessUserGrant,
  listPluginAccessPolicies,
  listPluginIdsGrantedToUser,
  listPluginIdsGrantedToUserGroups,
} from '@sovereignfs/db';
import {
  canUserOpenPlugin,
  getRestrictedPluginIds,
  getSelfServiceDirectory,
} from '../plugin-access-server';
import { hasUserCapability } from '../user-capabilities';

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

  it('defaults to disabled when no policy row exists (RFC 0065 Task 3.28 — a genuinely absent row means never activated, not open to everyone)', async () => {
    vi.mocked(getPluginAccessPolicy).mockResolvedValue(undefined);
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

  it('an explicit everyone row is still open to everyone', async () => {
    vi.mocked(getPluginAccessPolicy).mockResolvedValue({
      pluginId: 'fs.example.tasks',
      accessPolicy: 'everyone',
      selfService: false,
    });
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

  it('a plugin with no explicit policy row defaults to disabled — restricted for everyone, including an admin (RFC 0065 Task 3.28)', async () => {
    vi.mocked(listPluginAccessPolicies).mockResolvedValue([]);
    vi.mocked(listPluginIdsGrantedToUser).mockResolvedValue([]);
    vi.mocked(listPluginIdsGrantedToUserGroups).mockResolvedValue([]);

    const result = await getRestrictedPluginIds(mockPdb, 'u1', 'platform:admin', [
      'fs.example.untouched',
    ]);
    expect(result).toEqual(['fs.example.untouched']);
  });
});

describe('getSelfServiceDirectory', () => {
  function manifest(id: string, overrides: Record<string, unknown> = {}) {
    return {
      id,
      name: id,
      description: `${id} description`,
      routePrefix: `/${id}`,
      ...overrides,
    } as never;
  }

  it("returns null when the user lacks plugins:self-manage — the control doesn't exist, not just hidden", async () => {
    vi.mocked(hasUserCapability).mockResolvedValue(false);

    const result = await getSelfServiceDirectory(mockPdb, 'u1', 'platform:user', [
      manifest('fs.example.tasks'),
    ]);

    expect(result).toBeNull();
    expect(listPluginAccessPolicies).not.toHaveBeenCalled();
  });

  it('splits self-service-eligible plugins into eligible (no grant) and enabled (has grant)', async () => {
    vi.mocked(hasUserCapability).mockResolvedValue(true);
    vi.mocked(listPluginAccessPolicies).mockResolvedValue([
      { pluginId: 'fs.example.tasks', accessPolicy: 'selected_users', selfService: true },
      { pluginId: 'fs.example.wallet', accessPolicy: 'selected_users', selfService: true },
    ]);
    vi.mocked(listPluginIdsGrantedToUser).mockResolvedValue(['fs.example.wallet']);

    const result = await getSelfServiceDirectory(mockPdb, 'u1', 'platform:user', [
      manifest('fs.example.tasks'),
      manifest('fs.example.wallet'),
    ]);

    expect(result?.eligible.map((p) => p.id)).toEqual(['fs.example.tasks']);
    expect(result?.enabled.map((p) => p.id)).toEqual(['fs.example.wallet']);
  });

  it('excludes plugins that are not selected_users, not self_service, or have no policy row at all', async () => {
    vi.mocked(hasUserCapability).mockResolvedValue(true);
    vi.mocked(listPluginAccessPolicies).mockResolvedValue([
      { pluginId: 'fs.example.everyone', accessPolicy: 'everyone', selfService: true },
      { pluginId: 'fs.example.notSelfService', accessPolicy: 'selected_users', selfService: false },
      { pluginId: 'fs.example.groups', accessPolicy: 'selected_groups', selfService: true },
    ]);
    vi.mocked(listPluginIdsGrantedToUser).mockResolvedValue([]);

    const result = await getSelfServiceDirectory(mockPdb, 'u1', 'platform:user', [
      manifest('fs.example.everyone'),
      manifest('fs.example.notSelfService'),
      manifest('fs.example.groups'),
      manifest('fs.example.noPolicyRow'),
    ]);

    expect(result).toBeNull();
  });

  it('excludes chrome plugins even if somehow policy-scoped', async () => {
    vi.mocked(hasUserCapability).mockResolvedValue(true);
    vi.mocked(listPluginAccessPolicies).mockResolvedValue([
      { pluginId: 'fs.sovereign.launcher', accessPolicy: 'selected_users', selfService: true },
    ]);
    vi.mocked(listPluginIdsGrantedToUser).mockResolvedValue([]);

    const result = await getSelfServiceDirectory(mockPdb, 'u1', 'platform:user', [
      manifest('fs.sovereign.launcher'),
    ]);

    expect(result).toBeNull();
  });
});
