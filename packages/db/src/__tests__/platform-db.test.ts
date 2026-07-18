import { describe, expect, it } from 'vitest';
import { createClient } from '../client';
import {
  DEFAULT_TENANT_ID,
  DEFAULT_ROOT_PLUGIN_ID,
  addUserGroupMember,
  bootstrapPlatformDb,
  createE2eeDeviceEnrollment,
  createE2eeProfile,
  createPluginConnection,
  createPluginSecret,
  createStorageObject,
  createUserGroup,
  deletePluginSecret,
  deletePluginProviderConfig,
  deleteStorageObject,
  deleteUserData,
  deleteUserGroup,
  disconnectPluginConnection,
  getAccountPrefs,
  getDefaultTenant,
  getE2eeProfile,
  getE2eeRecoveryWrapper,
  getPluginAccessPolicy,
  getPluginConnection,
  getPluginProviderConfig,
  getPluginSecret,
  getInstanceConfig,
  getPlatformSetting,
  getStorageObjectByIdForToken,
  getStorageObjectByKey,
  getUserGroupById,
  getUserGroupUsage,
  grantPluginAccessGroup,
  grantPluginAccessUser,
  grantUserCapability,
  hasPluginAccessUserGrant,
  hasUserCapabilityGrant,
  hardDeleteUserE2eeData,
  hardDeleteUserStorageObjects,
  listE2eeDeviceEnrollments,
  listPluginConnections,
  listAllPluginProviderConfigs,
  listPluginSecrets,
  listStorageObjects,
  listUserCapabilityGrants,
  listUserGroupMembers,
  listUserGroups,
  listUserGroupsForUser,
  listUserPluginConnectionRefs,
  listUserPluginSecretRefs,
  markPluginConnectionError,
  markPluginConnectionUsed,
  markPluginProviderConfigChecked,
  markPluginSecretUsed,
  listAdminActivity,
  listDisabledPluginIds,
  listPluginAccessGroups,
  listPluginAccessPolicies,
  listPluginAccessUsers,
  listPluginIdsGrantedToUser,
  listPluginIdsGrantedToUserGroups,
  listPluginStatus,
  listUserActivity,
  recordActivity,
  removeUserGroupMember,
  revokeE2eeDeviceEnrollment,
  revokePluginAccessGroup,
  revokePluginAccessUser,
  revokeUserCapability,
  setAccountPrefs,
  setInstanceConfig,
  setPlatformSetting,
  setPluginAccessPolicy,
  setPluginEnabled,
  setTenantName,
  sumPluginStorageBytes,
  updatePluginConnection,
  updateUserGroup,
  upsertE2eeRecoveryWrapper,
  upsertPluginProviderConfig,
  updatePluginSecret,
  type PlatformDb,
} from '../platform-db';

async function freshDb(): Promise<PlatformDb> {
  const db = createClient({ url: ':memory:' });
  await bootstrapPlatformDb(db);
  return db;
}

function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) {
    Reflect.deleteProperty(process.env, name);
  } else {
    process.env[name] = value;
  }
}

describe('bootstrapPlatformDb', () => {
  it('seeds the default tenant', async () => {
    const tenant = await getDefaultTenant(await freshDb());
    expect(tenant.name).toBe('Sovereign');
  });

  it('seeds root_plugin_id with the Launcher default', async () => {
    expect(await getPlatformSetting(await freshDb(), 'root_plugin_id')).toBe(
      DEFAULT_ROOT_PLUGIN_ID,
    );
  });

  it('is idempotent and does not overwrite existing values', async () => {
    const db = await freshDb();
    await setTenantName(db, 'Acme');
    await setPlatformSetting(db, 'root_plugin_id', 'fs.example.tasks');

    await bootstrapPlatformDb(db); // simulate a second startup

    expect((await getDefaultTenant(db)).name).toBe('Acme');
    expect(await getPlatformSetting(db, 'root_plugin_id')).toBe('fs.example.tasks');
  });
});

describe('platform settings helpers', () => {
  it('returns null for an unset key', async () => {
    expect(await getPlatformSetting(await freshDb(), 'no_such_key')).toBeNull();
  });

  it('round-trips a new setting', async () => {
    const db = await freshDb();
    await setPlatformSetting(db, 'invite_only', 'true');
    expect(await getPlatformSetting(db, 'invite_only')).toBe('true');
  });

  it('upserts an existing setting', async () => {
    const db = await freshDb();
    await setPlatformSetting(db, 'invite_only', 'true');
    await setPlatformSetting(db, 'invite_only', 'false');
    expect(await getPlatformSetting(db, 'invite_only')).toBe('false');
  });
});

describe('tenant helpers', () => {
  it('renames the default tenant', async () => {
    const db = await freshDb();
    await setTenantName(db, 'My Workspace');
    expect((await getDefaultTenant(db)).name).toBe('My Workspace');
  });
});

describe('instance config helpers', () => {
  it('treats blank INSTANCE_NAME as unset', async () => {
    const previous = process.env.INSTANCE_NAME;
    process.env.INSTANCE_NAME = '';
    try {
      const config = await getInstanceConfig(await freshDb(), DEFAULT_TENANT_ID);
      expect(config.instanceName).toBe('Sovereign');
    } finally {
      restoreEnv('INSTANCE_NAME', previous);
    }
  });

  it('falls back from a blank DB value to the env instance name', async () => {
    const previous = process.env.INSTANCE_NAME;
    process.env.INSTANCE_NAME = 'Acme Workspace';
    try {
      const db = await freshDb();
      await setInstanceConfig(db, DEFAULT_TENANT_ID, {
        instanceName: '   ',
        instanceLogo: null,
        instanceLogoDark: null,
        instanceFavicon: null,
        instancePrimary: null,
        emailFromName: null,
        emailLogo: null,
      });
      const config = await getInstanceConfig(db, DEFAULT_TENANT_ID);
      expect(config.instanceName).toBe('Acme Workspace');
    } finally {
      restoreEnv('INSTANCE_NAME', previous);
    }
  });
});

describe('account preferences helpers', () => {
  it('returns UTC + system defaults when no row exists', async () => {
    expect(await getAccountPrefs(await freshDb(), 'u1')).toEqual({
      timezone: 'UTC',
      theme: 'system',
      sidebarPlugins: null,
    });
  });

  it('inserts a row on first set and round-trips it', async () => {
    const db = await freshDb();
    const next = await setAccountPrefs(db, 'u1', { timezone: 'America/New_York', theme: 'dark' });
    expect(next).toEqual({ timezone: 'America/New_York', theme: 'dark', sidebarPlugins: null });
    expect(await getAccountPrefs(db, 'u1')).toEqual({
      timezone: 'America/New_York',
      theme: 'dark',
      sidebarPlugins: null,
    });
  });

  it('merges a partial update, leaving other fields intact', async () => {
    const db = await freshDb();
    await setAccountPrefs(db, 'u1', { timezone: 'Europe/Berlin', theme: 'light' });
    await setAccountPrefs(db, 'u1', { theme: 'dark' });
    expect(await getAccountPrefs(db, 'u1')).toEqual({
      timezone: 'Europe/Berlin',
      theme: 'dark',
      sidebarPlugins: null,
    });
  });

  it('keeps preferences isolated per user', async () => {
    const db = await freshDb();
    await setAccountPrefs(db, 'u1', { theme: 'dark' });
    expect(await getAccountPrefs(db, 'u2')).toEqual({
      timezone: 'UTC',
      theme: 'system',
      sidebarPlugins: null,
    });
  });
});

describe('activity log helpers (RFC 0005)', () => {
  it('recordActivity inserts a row readable by listAdminActivity', async () => {
    const db = await freshDb();
    await recordActivity(db, {
      id: 'evt-1',
      actorId: 'u1',
      actorType: 'user',
      action: 'plugin.enabled',
      visibility: 'admin',
      summary: 'Plugin enabled',
    });

    const rows = await listAdminActivity(db);
    expect(rows).toHaveLength(1);
    const row0 = rows[0];
    expect(row0).toMatchObject({
      id: 'evt-1',
      actorId: 'u1',
      actorType: 'user',
      action: 'plugin.enabled',
      visibility: 'admin',
      summary: 'Plugin enabled',
    });
    expect(row0?.createdAt).toBeGreaterThan(0);
  });

  it('listUserActivity returns only user-scoped events for the given user', async () => {
    const db = await freshDb();
    await recordActivity(db, {
      id: 'evt-admin',
      actorId: 'u1',
      actorType: 'user',
      action: 'settings.changed',
      visibility: 'admin',
    });
    await recordActivity(db, {
      id: 'evt-user-actor',
      actorId: 'u1',
      actorType: 'user',
      action: 'account.password_changed',
      visibility: 'user',
    });
    await recordActivity(db, {
      id: 'evt-user-subject',
      actorId: 'u2',
      actorType: 'user',
      action: 'user.role_changed',
      subjectUserId: 'u1',
      visibility: 'user',
    });
    await recordActivity(db, {
      id: 'evt-other-user',
      actorId: 'u2',
      actorType: 'user',
      action: 'account.password_changed',
      visibility: 'user',
    });

    const rows = await listUserActivity(db, 'u1');
    const ids = rows.map((r) => r.id).sort();
    expect(ids).toEqual(['evt-user-actor', 'evt-user-subject']);
  });

  it('listAdminActivity returns all rows regardless of visibility', async () => {
    const db = await freshDb();
    await recordActivity(db, {
      id: 'evt-a',
      actorId: 'u1',
      actorType: 'user',
      action: 'plugin.disabled',
      visibility: 'admin',
    });
    await recordActivity(db, {
      id: 'evt-b',
      actorId: 'u2',
      actorType: 'user',
      action: 'account.password_changed',
      visibility: 'user',
    });

    const rows = await listAdminActivity(db);
    expect(rows.map((r) => r.id).sort()).toEqual(['evt-a', 'evt-b']);
  });

  it('listAdminActivity filters by actorId', async () => {
    const db = await freshDb();
    await recordActivity(db, {
      id: 'evt-u1',
      actorId: 'u1',
      actorType: 'user',
      action: 'plugin.enabled',
      visibility: 'admin',
    });
    await recordActivity(db, {
      id: 'evt-u2',
      actorId: 'u2',
      actorType: 'user',
      action: 'plugin.disabled',
      visibility: 'admin',
    });

    const rows = await listAdminActivity(db, { actorId: 'u1' });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe('evt-u1');
  });

  it('listAdminActivity filters by action', async () => {
    const db = await freshDb();
    await recordActivity(db, {
      id: 'evt-a',
      actorId: 'u1',
      actorType: 'user',
      action: 'plugin.enabled',
      visibility: 'admin',
    });
    await recordActivity(db, {
      id: 'evt-b',
      actorId: 'u1',
      actorType: 'user',
      action: 'plugin.disabled',
      visibility: 'admin',
    });

    const rows = await listAdminActivity(db, { action: 'plugin.enabled' });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe('evt-a');
  });

  it('listAdminActivity respects the limit', async () => {
    const db = await freshDb();
    for (let i = 0; i < 5; i++) {
      await recordActivity(db, {
        id: `evt-${i}`,
        actorId: 'u1',
        actorType: 'user',
        action: 'plugin.enabled',
        visibility: 'admin',
      });
    }

    const rows = await listAdminActivity(db, { limit: 3 });
    expect(rows).toHaveLength(3);
  });

  it('listAdminActivity returns rows in descending created_at order', async () => {
    const db = await freshDb();
    // Insert two rows with deliberately different timestamps so ordering is deterministic.
    const now = Math.floor(Date.now() / 1000);
    const { sql } = await import('drizzle-orm');
    const { dbRun } = await import('../exec');
    await dbRun(
      db,
      sql`INSERT INTO activity_log (id, tenant_id, actor_id, actor_type, action, visibility, created_at)
          VALUES ('evt-older', 'default', 'u1', 'user', 'a', 'admin', ${now - 10})`,
    );
    await dbRun(
      db,
      sql`INSERT INTO activity_log (id, tenant_id, actor_id, actor_type, action, visibility, created_at)
          VALUES ('evt-newer', 'default', 'u1', 'user', 'b', 'admin', ${now})`,
    );

    const rows = await listAdminActivity(db);
    expect(rows[0]?.id).toBe('evt-newer');
    expect(rows[1]?.id).toBe('evt-older');
  });

  it('serialises metadata as JSON and returns it as a string', async () => {
    const db = await freshDb();
    await recordActivity(db, {
      id: 'evt-meta',
      actorId: 'u1',
      actorType: 'user',
      action: 'settings.changed',
      visibility: 'admin',
      metadata: { tenantName: 'Acme', enabled: true },
    });

    const rows = await listAdminActivity(db);
    expect(JSON.parse(rows[0]?.metadata ?? 'null')).toEqual({ tenantName: 'Acme', enabled: true });
  });

  it('handles null optional fields gracefully', async () => {
    const db = await freshDb();
    await recordActivity(db, {
      id: 'evt-minimal',
      actorId: null,
      actorType: 'system',
      action: 'system.boot',
      visibility: 'admin',
    });

    const rows = await listAdminActivity(db);
    const row = rows[0];
    expect(row?.actorId).toBeNull();
    expect(row?.subjectUserId).toBeNull();
    expect(row?.targetType).toBeNull();
    expect(row?.summary).toBeNull();
    expect(row?.metadata).toBeNull();
  });
});

describe('plugin secret vault helpers (RFC 0043)', () => {
  it('keeps plugin and user scopes isolated and hides soft-deleted rows', async () => {
    const db = await freshDb();
    const context = { tenantId: DEFAULT_TENANT_ID, pluginId: 'com.example.notes', userId: 'u1' };
    const ref = await createPluginSecret(db, {
      ...context,
      id: 'secret-1',
      scope: 'user',
      label: 'OAuth token',
      ciphertext: 'encrypted-value',
      metadata: '{"provider":"example"}',
    });

    expect(ref).toMatchObject({ id: 'secret-1', scope: 'user', label: 'OAuth token' });
    expect(await getPluginSecret(db, 'secret-1', context)).toMatchObject({
      ciphertext: 'encrypted-value',
    });
    expect(
      await getPluginSecret(db, 'secret-1', { ...context, pluginId: 'com.example.other' }),
    ).toBeUndefined();
    expect(await getPluginSecret(db, 'secret-1', { ...context, userId: 'u2' })).toBeUndefined();

    await markPluginSecretUsed(db, 'secret-1', context);
    const [listed] = await listPluginSecrets(db, context, 'user');
    expect(listed?.lastUsedAt).toBeGreaterThan(0);

    await deletePluginSecret(db, 'secret-1', context);
    expect(await listPluginSecrets(db, context)).toEqual([]);
  });

  it('exports metadata-only user secret refs and hard-deletes them with user data', async () => {
    const db = await freshDb();
    await createPluginSecret(db, {
      tenantId: DEFAULT_TENANT_ID,
      pluginId: 'com.example.notes',
      userId: 'u1',
      id: 'secret-1',
      scope: 'user',
      label: 'OAuth token',
      ciphertext: 'encrypted-value',
    });
    await createPluginSecret(db, {
      tenantId: DEFAULT_TENANT_ID,
      pluginId: 'com.example.notes',
      userId: null,
      id: 'secret-2',
      scope: 'plugin',
      label: 'Webhook key',
      ciphertext: 'encrypted-plugin-value',
    });

    expect(await listUserPluginSecretRefs(db, 'u1')).toHaveLength(1);
    await updatePluginSecret(
      db,
      'secret-1',
      { tenantId: DEFAULT_TENANT_ID, pluginId: 'com.example.notes', userId: 'u1' },
      'encrypted-value-2',
    );
    await deleteUserData(db, 'u1');

    expect(await listUserPluginSecretRefs(db, 'u1')).toEqual([]);
    expect(
      await getPluginSecret(db, 'secret-2', {
        tenantId: DEFAULT_TENANT_ID,
        pluginId: 'com.example.notes',
        userId: null,
      }),
    ).toBeDefined();
  });
});

describe('plugin storage object helpers (RFC 0044)', () => {
  it('scopes reads by tenant/plugin/owner and hides objects from other plugins/users', async () => {
    const db = await freshDb();
    const context = { tenantId: DEFAULT_TENANT_ID, pluginId: 'com.example.notes', userId: 'u1' };
    const row = await createStorageObject(db, {
      ...context,
      id: 'obj-1',
      ownerUserId: 'u1',
      key: 'attachments/receipt.png',
      contentType: 'image/png',
      size: 1024,
      checksum: 'abc123',
      metadata: null,
    });

    expect(row).toMatchObject({ id: 'obj-1', key: 'attachments/receipt.png', size: 1024 });
    expect(await getStorageObjectByKey(db, 'attachments/receipt.png', context)).toMatchObject({
      id: 'obj-1',
    });
    expect(
      await getStorageObjectByKey(db, 'attachments/receipt.png', {
        ...context,
        pluginId: 'com.example.other',
      }),
    ).toBeUndefined();
    expect(
      await getStorageObjectByKey(db, 'attachments/receipt.png', { ...context, userId: 'u2' }),
    ).toBeUndefined();
  });

  it('lists by key prefix and sums bytes for quota accounting', async () => {
    const db = await freshDb();
    const context = { tenantId: DEFAULT_TENANT_ID, pluginId: 'com.example.notes', userId: 'u1' };
    await createStorageObject(db, {
      ...context,
      id: 'obj-1',
      ownerUserId: 'u1',
      key: 'imports/a.csv',
      contentType: 'text/csv',
      size: 100,
      checksum: 'a',
      metadata: null,
    });
    await createStorageObject(db, {
      ...context,
      id: 'obj-2',
      ownerUserId: 'u1',
      key: 'exports/b.csv',
      contentType: 'text/csv',
      size: 200,
      checksum: 'b',
      metadata: null,
    });

    expect(await listStorageObjects(db, context)).toHaveLength(2);
    expect(await listStorageObjects(db, context, 'imports/')).toHaveLength(1);
    expect(await sumPluginStorageBytes(db, DEFAULT_TENANT_ID, 'com.example.notes')).toBe(300);
  });

  it('deletes an accessible object and drops it from list/sum', async () => {
    const db = await freshDb();
    const context = { tenantId: DEFAULT_TENANT_ID, pluginId: 'com.example.notes', userId: 'u1' };
    await createStorageObject(db, {
      ...context,
      id: 'obj-1',
      ownerUserId: 'u1',
      key: 'imports/a.csv',
      contentType: 'text/csv',
      size: 100,
      checksum: 'a',
      metadata: null,
    });

    const deleted = await deleteStorageObject(db, 'obj-1', context);
    expect(deleted?.id).toBe('obj-1');
    expect(await listStorageObjects(db, context)).toEqual([]);
    expect(await sumPluginStorageBytes(db, DEFAULT_TENANT_ID, 'com.example.notes')).toBe(0);
  });

  it('hard-deletes only user-owned objects on account deletion, leaving plugin-scoped ones', async () => {
    const db = await freshDb();
    await createStorageObject(db, {
      tenantId: DEFAULT_TENANT_ID,
      pluginId: 'com.example.notes',
      id: 'obj-user',
      ownerUserId: 'u1',
      key: 'attachments/a.png',
      contentType: 'image/png',
      size: 10,
      checksum: 'a',
      metadata: null,
    });
    await createStorageObject(db, {
      tenantId: DEFAULT_TENANT_ID,
      pluginId: 'com.example.notes',
      id: 'obj-plugin',
      ownerUserId: null,
      key: 'shared/logo.png',
      contentType: 'image/png',
      size: 20,
      checksum: 'b',
      metadata: null,
    });

    const deleted = await hardDeleteUserStorageObjects(db, 'u1');
    expect(deleted.map((r) => r.id)).toEqual(['obj-user']);

    const remaining = await listStorageObjects(db, {
      tenantId: DEFAULT_TENANT_ID,
      pluginId: 'com.example.notes',
      userId: null,
    });
    expect(remaining.map((r) => r.id)).toEqual(['obj-plugin']);
  });

  it('getStorageObjectByIdForToken bypasses owner scoping but still respects tenant/plugin', async () => {
    const db = await freshDb();
    await createStorageObject(db, {
      tenantId: DEFAULT_TENANT_ID,
      pluginId: 'com.example.notes',
      id: 'obj-1',
      ownerUserId: 'u1',
      key: 'attachments/a.png',
      contentType: 'image/png',
      size: 10,
      checksum: 'a',
      metadata: null,
    });

    expect(
      await getStorageObjectByIdForToken(db, 'obj-1', DEFAULT_TENANT_ID, 'com.example.notes'),
    ).toMatchObject({ id: 'obj-1' });
    expect(
      await getStorageObjectByIdForToken(db, 'obj-1', DEFAULT_TENANT_ID, 'com.example.other'),
    ).toBeUndefined();
  });
});

describe('client-side encryption profile helpers (RFC 0060)', () => {
  it('creates and reads a profile scoped by tenant/user', async () => {
    const db = await freshDb();
    const created = await createE2eeProfile(db, {
      id: 'profile-1',
      tenantId: DEFAULT_TENANT_ID,
      userId: 'u1',
      cmkAlgorithm: 'AES-GCM-256',
    });

    expect(created).toMatchObject({
      id: 'profile-1',
      userId: 'u1',
      status: 'active',
      cmkAlgorithm: 'AES-GCM-256',
    });
    expect(await getE2eeProfile(db, DEFAULT_TENANT_ID, 'u1')).toMatchObject({ id: 'profile-1' });
    expect(await getE2eeProfile(db, DEFAULT_TENANT_ID, 'u2')).toBeUndefined();
  });

  it('upserts the recovery wrapper — a second call replaces, not duplicates', async () => {
    const db = await freshDb();
    await upsertE2eeRecoveryWrapper(db, {
      id: 'wrapper-1',
      tenantId: DEFAULT_TENANT_ID,
      userId: 'u1',
      wrappedCmk: 'ciphertext-v1',
      kdfAlgorithm: 'argon2id',
      kdfParams: '{"m":19456,"t":2,"p":1}',
      kdfSalt: 'salt-1',
      algorithmVersion: 'v1',
    });

    const rotated = await upsertE2eeRecoveryWrapper(db, {
      id: 'wrapper-2',
      tenantId: DEFAULT_TENANT_ID,
      userId: 'u1',
      wrappedCmk: 'ciphertext-v2',
      kdfAlgorithm: 'argon2id',
      kdfParams: '{"m":19456,"t":2,"p":1}',
      kdfSalt: 'salt-2',
      algorithmVersion: 'v1',
    });

    // The row keeps its original id (INSERT ... ON CONFLICT DO UPDATE updates
    // in place; it does not adopt the conflicting insert's id) but the
    // ciphertext/salt reflect the rotation.
    expect(rotated.wrappedCmk).toBe('ciphertext-v2');
    expect(rotated.kdfSalt).toBe('salt-2');
    expect(await getE2eeRecoveryWrapper(db, DEFAULT_TENANT_ID, 'u1')).toMatchObject({
      wrappedCmk: 'ciphertext-v2',
    });
  });

  it('enrolls devices, lists only active ones by default, and revoke excludes without deleting', async () => {
    const db = await freshDb();
    await createE2eeDeviceEnrollment(db, {
      id: 'device-1',
      tenantId: DEFAULT_TENANT_ID,
      userId: 'u1',
      deviceId: 'chrome-macbook',
      deviceLabel: 'Chrome on MacBook',
      wrappedCmk: 'wrapped-for-device-1',
      algorithmVersion: 'v1',
    });
    await createE2eeDeviceEnrollment(db, {
      id: 'device-2',
      tenantId: DEFAULT_TENANT_ID,
      userId: 'u1',
      deviceId: 'safari-iphone',
      deviceLabel: 'Safari on iPhone',
      wrappedCmk: 'wrapped-for-device-2',
      algorithmVersion: 'v1',
    });

    expect(await listE2eeDeviceEnrollments(db, DEFAULT_TENANT_ID, 'u1')).toHaveLength(2);

    await revokeE2eeDeviceEnrollment(db, 'device-1', DEFAULT_TENANT_ID, 'u1');

    const active = await listE2eeDeviceEnrollments(db, DEFAULT_TENANT_ID, 'u1');
    expect(active.map((d) => d.id)).toEqual(['device-2']);

    const withRevoked = await listE2eeDeviceEnrollments(db, DEFAULT_TENANT_ID, 'u1', {
      includeRevoked: true,
    });
    expect(withRevoked.map((d) => d.id).sort()).toEqual(['device-1', 'device-2']);
    expect(withRevoked.find((d) => d.id === 'device-1')?.revokedAt).not.toBeNull();
  });

  it('hard-deletes all three tables for a user on account deletion, leaving other users untouched', async () => {
    const db = await freshDb();
    await createE2eeProfile(db, {
      id: 'profile-1',
      tenantId: DEFAULT_TENANT_ID,
      userId: 'u1',
      cmkAlgorithm: 'AES-GCM-256',
    });
    await upsertE2eeRecoveryWrapper(db, {
      id: 'wrapper-1',
      tenantId: DEFAULT_TENANT_ID,
      userId: 'u1',
      wrappedCmk: 'ciphertext',
      kdfAlgorithm: 'argon2id',
      kdfParams: '{}',
      kdfSalt: 'salt',
      algorithmVersion: 'v1',
    });
    await createE2eeDeviceEnrollment(db, {
      id: 'device-1',
      tenantId: DEFAULT_TENANT_ID,
      userId: 'u1',
      deviceId: 'chrome-macbook',
      deviceLabel: null,
      wrappedCmk: 'wrapped',
      algorithmVersion: 'v1',
    });
    await createE2eeProfile(db, {
      id: 'profile-2',
      tenantId: DEFAULT_TENANT_ID,
      userId: 'u2',
      cmkAlgorithm: 'AES-GCM-256',
    });

    await hardDeleteUserE2eeData(db, 'u1');

    expect(await getE2eeProfile(db, DEFAULT_TENANT_ID, 'u1')).toBeUndefined();
    expect(await getE2eeRecoveryWrapper(db, DEFAULT_TENANT_ID, 'u1')).toBeUndefined();
    expect(await listE2eeDeviceEnrollments(db, DEFAULT_TENANT_ID, 'u1')).toEqual([]);
    expect(await getE2eeProfile(db, DEFAULT_TENANT_ID, 'u2')).toMatchObject({ id: 'profile-2' });
  });
});

describe('plugin external connection helpers (RFC 0049)', () => {
  it('keeps connection metadata plugin/user scoped and disconnects linked secrets', async () => {
    const db = await freshDb();
    const context = { tenantId: DEFAULT_TENANT_ID, pluginId: 'com.example.notes', userId: 'u1' };
    await createPluginSecret(db, {
      ...context,
      id: 'secret-conn-1',
      scope: 'user',
      label: 'Google token',
      ciphertext: 'encrypted-token',
    });

    const ref = await createPluginConnection(db, {
      ...context,
      id: 'conn-1',
      scope: 'user',
      provider: 'email.google',
      label: 'Google Mail',
      secretRef: 'secret-conn-1',
      metadata: '{"account":"user@example.test"}',
    });

    expect(ref).toMatchObject({
      id: 'conn-1',
      scope: 'user',
      provider: 'email.google',
      status: 'connected',
      secretRef: 'secret-conn-1',
    });
    expect(await getPluginConnection(db, 'conn-1', context)).toBeDefined();
    expect(
      await getPluginConnection(db, 'conn-1', { ...context, pluginId: 'com.example.other' }),
    ).toBeUndefined();
    expect(await getPluginConnection(db, 'conn-1', { ...context, userId: 'u2' })).toBeUndefined();

    await markPluginConnectionUsed(db, 'conn-1', context);
    await markPluginConnectionError(db, 'conn-1', context, '{"message":"expired"}', 'needs_reauth');
    const [listed] = await listPluginConnections(db, context, { provider: 'email.google' });
    expect(listed).toMatchObject({ status: 'needs_reauth', lastError: '{"message":"expired"}' });
    expect(listed?.lastUsedAt).toBeGreaterThan(0);

    const updated = await updatePluginConnection(db, 'conn-1', context, {
      label: 'Work Google Mail',
      status: 'connected',
      metadata: '{"account":"work@example.test"}',
    });
    expect(updated).toMatchObject({ label: 'Work Google Mail', status: 'connected' });

    await disconnectPluginConnection(db, 'conn-1', context);
    expect(await getPluginSecret(db, 'secret-conn-1', context)).toBeUndefined();
    expect(await getPluginConnection(db, 'conn-1', context)).toMatchObject({
      status: 'disconnected',
      secretRef: null,
    });
    expect(await listPluginConnections(db, context)).toEqual([]);
    expect(await listPluginConnections(db, context, { includeDisconnected: true })).toHaveLength(1);
  });

  it('lists user connection metadata and deletes user-scoped rows with user data', async () => {
    const db = await freshDb();
    await createPluginConnection(db, {
      tenantId: DEFAULT_TENANT_ID,
      pluginId: 'com.example.notes',
      userId: 'u1',
      id: 'conn-user',
      scope: 'user',
      provider: 'openrouter',
      label: 'OpenRouter',
    });
    await createPluginConnection(db, {
      tenantId: DEFAULT_TENANT_ID,
      pluginId: 'com.example.notes',
      userId: null,
      id: 'conn-plugin',
      scope: 'plugin',
      provider: 'stripe',
      label: 'Stripe',
    });

    expect(await listUserPluginConnectionRefs(db, 'u1')).toHaveLength(1);
    await deleteUserData(db, 'u1');
    expect(await listUserPluginConnectionRefs(db, 'u1')).toEqual([]);
    expect(
      await getPluginConnection(db, 'conn-plugin', {
        tenantId: DEFAULT_TENANT_ID,
        pluginId: 'com.example.notes',
        userId: null,
      }),
    ).toBeDefined();
  });
});

describe('plugin external provider config helpers', () => {
  it('stores instance-level provider config metadata and deletes linked vault secrets', async () => {
    const db = await freshDb();
    await createPluginSecret(db, {
      tenantId: DEFAULT_TENANT_ID,
      pluginId: 'com.example.notes',
      userId: null,
      id: 'secret-provider-1',
      scope: 'instance',
      label: 'GitHub credentials',
      ciphertext: 'encrypted-json',
    });

    const created = await upsertPluginProviderConfig(db, {
      id: 'provider-config-1',
      tenantId: DEFAULT_TENANT_ID,
      pluginId: 'com.example.notes',
      provider: 'github',
      label: 'GitHub',
      publicConfig: '{"clientId":"client-id"}',
      secretRef: 'secret-provider-1',
      callbackUrl: 'https://example.test/notes/connections/github/callback',
      scopes: '["user"]',
    });

    expect(created).toMatchObject({
      id: 'provider-config-1',
      pluginId: 'com.example.notes',
      provider: 'github',
      status: 'configured',
      secretRef: 'secret-provider-1',
    });
    expect(
      await getPluginProviderConfig(db, DEFAULT_TENANT_ID, 'com.example.notes', 'github'),
    ).toMatchObject({ id: 'provider-config-1' });
    expect(await listAllPluginProviderConfigs(db)).toHaveLength(1);

    const checked = await markPluginProviderConfigChecked(
      db,
      'provider-config-1',
      DEFAULT_TENANT_ID,
      'Missing required fields: clientSecret',
    );
    expect(checked).toMatchObject({ status: 'error' });

    const deleted = await deletePluginProviderConfig(db, 'provider-config-1');
    expect(deleted).toMatchObject({ id: 'provider-config-1', secretRef: 'secret-provider-1' });
    expect(await listAllPluginProviderConfigs(db)).toEqual([]);
    expect(
      await getPluginProviderConfig(db, DEFAULT_TENANT_ID, 'com.example.notes', 'github'),
    ).toBeUndefined();
    expect(
      await getPluginSecret(db, 'secret-provider-1', {
        tenantId: DEFAULT_TENANT_ID,
        pluginId: 'com.example.notes',
        userId: null,
      }),
    ).toBeUndefined();
  });
});

describe('plugin status helpers', () => {
  it('returns no status rows on a fresh database (absence = enabled)', async () => {
    expect(await listPluginStatus(await freshDb())).toEqual([]);
    expect(await listDisabledPluginIds(await freshDb())).toEqual([]);
  });

  it('upserts enable/disable state and maps the boolean correctly', async () => {
    const db = await freshDb();
    await setPluginEnabled(db, 'fs.test.alpha', false);

    const rows = await listPluginStatus(db);
    expect(rows).toEqual([{ pluginId: 'fs.test.alpha', enabled: false }]);
    expect(await listDisabledPluginIds(db)).toEqual(['fs.test.alpha']);

    // re-enabling upserts the same row, not a duplicate
    await setPluginEnabled(db, 'fs.test.alpha', true);
    expect(await listPluginStatus(db)).toEqual([{ pluginId: 'fs.test.alpha', enabled: true }]);
    expect(await listDisabledPluginIds(db)).toEqual([]);
  });
});

describe('user group helpers (RFC 0065)', () => {
  it('creates, reads, updates, and deletes a group', async () => {
    const db = await freshDb();
    await createUserGroup(db, 'grp_1', 'Finance', 'finance', 'Finance team', 'admin_1');

    const created = await getUserGroupById(db, 'grp_1');
    expect(created).toMatchObject({
      id: 'grp_1',
      name: 'Finance',
      slug: 'finance',
      description: 'Finance team',
      createdByUserId: 'admin_1',
    });

    await updateUserGroup(db, 'grp_1', { name: 'Finance & Ops', description: null });
    const updated = await getUserGroupById(db, 'grp_1');
    expect(updated?.name).toBe('Finance & Ops');
    expect(updated?.description).toBeNull();
    expect(updated?.updatedAt).toBeGreaterThanOrEqual(updated?.createdAt ?? 0);

    await deleteUserGroup(db, 'grp_1');
    expect(await getUserGroupById(db, 'grp_1')).toBeUndefined();
  });

  it('lists groups ordered by name', async () => {
    const db = await freshDb();
    await createUserGroup(db, 'grp_b', 'Bravo', 'bravo', null, 'admin_1');
    await createUserGroup(db, 'grp_a', 'Alpha', 'alpha', null, 'admin_1');

    const groups = await listUserGroups(db);
    expect(groups.map((g) => g.name)).toEqual(['Alpha', 'Bravo']);
  });

  it('adds and removes membership idempotently', async () => {
    const db = await freshDb();
    await createUserGroup(db, 'grp_1', 'Finance', 'finance', null, 'admin_1');

    await addUserGroupMember(db, 'grp_1', 'user_1', 'admin_1');
    await addUserGroupMember(db, 'grp_1', 'user_1', 'admin_1'); // idempotent, no duplicate row

    const members = await listUserGroupMembers(db, 'grp_1');
    expect(members).toEqual([
      { userId: 'user_1', addedByUserId: 'admin_1', addedAt: expect.any(Number) },
    ]);

    await removeUserGroupMember(db, 'grp_1', 'user_1');
    expect(await listUserGroupMembers(db, 'grp_1')).toEqual([]);

    // removing a non-member is a no-op, not an error
    await expect(removeUserGroupMember(db, 'grp_1', 'user_1')).resolves.toBeUndefined();
  });

  it('resolves effective group membership for a user across multiple groups', async () => {
    const db = await freshDb();
    await createUserGroup(db, 'grp_a', 'Alpha', 'alpha', null, 'admin_1');
    await createUserGroup(db, 'grp_b', 'Bravo', 'bravo', null, 'admin_1');
    await createUserGroup(db, 'grp_c', 'Charlie', 'charlie', null, 'admin_1');

    await addUserGroupMember(db, 'grp_a', 'user_1', 'admin_1');
    await addUserGroupMember(db, 'grp_c', 'user_1', 'admin_1');
    await addUserGroupMember(db, 'grp_b', 'user_2', 'admin_1');

    const groups = await listUserGroupsForUser(db, 'user_1');
    expect(groups.map((g) => g.name)).toEqual(['Alpha', 'Charlie']);
    expect(await listUserGroupsForUser(db, 'user_2')).toHaveLength(1);
    expect(await listUserGroupsForUser(db, 'nobody')).toEqual([]);
  });

  it('deleting a group cascades its membership rows', async () => {
    const db = await freshDb();
    await createUserGroup(db, 'grp_1', 'Finance', 'finance', null, 'admin_1');
    await addUserGroupMember(db, 'grp_1', 'user_1', 'admin_1');

    await deleteUserGroup(db, 'grp_1');
    expect(await listUserGroupMembers(db, 'grp_1')).toEqual([]);
  });

  it('reports no usage for a group with no plugin access grants', async () => {
    const db = await freshDb();
    await createUserGroup(db, 'grp_1', 'Finance', 'finance', null, 'admin_1');
    expect(await getUserGroupUsage(db, 'grp_1')).toEqual({
      referencedByPluginAccessPolicies: false,
    });
  });
});

describe('user capability grant helpers (RFC 0070)', () => {
  it('grants and lists a capability idempotently', async () => {
    const db = await freshDb();
    await grantUserCapability(db, 'user_1', 'plugins:self-manage', 'admin_1');
    await grantUserCapability(db, 'user_1', 'plugins:self-manage', 'admin_1'); // idempotent

    const grants = await listUserCapabilityGrants(db, 'user_1');
    expect(grants).toEqual([
      {
        userId: 'user_1',
        capability: 'plugins:self-manage',
        grantedByUserId: 'admin_1',
        grantedAt: expect.any(Number),
      },
    ]);
  });

  it('checks whether a specific grant exists', async () => {
    const db = await freshDb();
    expect(await hasUserCapabilityGrant(db, 'user_1', 'plugins:self-manage')).toBe(false);

    await grantUserCapability(db, 'user_1', 'plugins:self-manage', 'admin_1');
    expect(await hasUserCapabilityGrant(db, 'user_1', 'plugins:self-manage')).toBe(true);
    expect(await hasUserCapabilityGrant(db, 'user_2', 'plugins:self-manage')).toBe(false);
  });

  it('revokes a grant; revoking a non-grant is a no-op', async () => {
    const db = await freshDb();
    await grantUserCapability(db, 'user_1', 'plugins:self-manage', 'admin_1');

    await revokeUserCapability(db, 'user_1', 'plugins:self-manage');
    expect(await hasUserCapabilityGrant(db, 'user_1', 'plugins:self-manage')).toBe(false);

    await expect(
      revokeUserCapability(db, 'user_1', 'plugins:self-manage'),
    ).resolves.toBeUndefined();
  });

  it('scopes grants per user independently', async () => {
    const db = await freshDb();
    await grantUserCapability(db, 'user_1', 'plugins:self-manage', 'admin_1');

    expect(await listUserCapabilityGrants(db, 'user_1')).toHaveLength(1);
    expect(await listUserCapabilityGrants(db, 'user_2')).toEqual([]);
  });
});

describe('plugin access policy helpers (RFC 0065)', () => {
  it('returns undefined for a plugin with no explicit row', async () => {
    const db = await freshDb();
    expect(await getPluginAccessPolicy(db, 'fs.example.tasks')).toBeUndefined();
  });

  it('sets and reads back a policy, defaulting enabled to true on first insert', async () => {
    const db = await freshDb();
    await setPluginAccessPolicy(db, 'fs.example.tasks', 'selected_users', false);

    const row = await getPluginAccessPolicy(db, 'fs.example.tasks');
    expect(row).toEqual({
      pluginId: 'fs.example.tasks',
      accessPolicy: 'selected_users',
      selfService: false,
    });
  });

  it('updates an existing policy without touching the enabled column', async () => {
    const db = await freshDb();
    await setPluginEnabled(db, 'fs.example.tasks', false);
    await setPluginAccessPolicy(db, 'fs.example.tasks', 'admins', true);

    expect(await listDisabledPluginIds(db)).toEqual(['fs.example.tasks']);
    expect(await getPluginAccessPolicy(db, 'fs.example.tasks')).toEqual({
      pluginId: 'fs.example.tasks',
      accessPolicy: 'admins',
      selfService: true,
    });
  });

  it('lists every explicit policy row in bulk', async () => {
    const db = await freshDb();
    await setPluginAccessPolicy(db, 'fs.example.a', 'admins', false);
    await setPluginAccessPolicy(db, 'fs.example.b', 'disabled', false);

    const rows = await listPluginAccessPolicies(db);
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.pluginId).sort()).toEqual(['fs.example.a', 'fs.example.b']);
  });
});

describe('plugin access grant helpers (RFC 0065)', () => {
  it('grants and checks a direct user grant idempotently', async () => {
    const db = await freshDb();
    expect(await hasPluginAccessUserGrant(db, 'fs.example.tasks', 'user_1')).toBe(false);

    await grantPluginAccessUser(db, 'fs.example.tasks', 'user_1', 'admin_1');
    await grantPluginAccessUser(db, 'fs.example.tasks', 'user_1', 'admin_1'); // idempotent

    expect(await hasPluginAccessUserGrant(db, 'fs.example.tasks', 'user_1')).toBe(true);
    const rows = await listPluginAccessUsers(db, 'fs.example.tasks');
    expect(rows).toEqual([
      { userId: 'user_1', grantedByUserId: 'admin_1', grantedAt: expect.any(Number) },
    ]);
  });

  it('revokes a direct user grant; revoking a non-grant is a no-op', async () => {
    const db = await freshDb();
    await grantPluginAccessUser(db, 'fs.example.tasks', 'user_1', 'admin_1');

    await revokePluginAccessUser(db, 'fs.example.tasks', 'user_1');
    expect(await hasPluginAccessUserGrant(db, 'fs.example.tasks', 'user_1')).toBe(false);

    await expect(revokePluginAccessUser(db, 'fs.example.tasks', 'user_1')).resolves.toBeUndefined();
  });

  it('lists every plugin a user has a direct grant for', async () => {
    const db = await freshDb();
    await grantPluginAccessUser(db, 'fs.example.a', 'user_1', 'admin_1');
    await grantPluginAccessUser(db, 'fs.example.b', 'user_1', 'admin_1');
    await grantPluginAccessUser(db, 'fs.example.a', 'user_2', 'admin_1');

    expect((await listPluginIdsGrantedToUser(db, 'user_1')).sort()).toEqual([
      'fs.example.a',
      'fs.example.b',
    ]);
    expect(await listPluginIdsGrantedToUser(db, 'user_2')).toEqual(['fs.example.a']);
  });

  it('grants and revokes a group access, idempotently', async () => {
    const db = await freshDb();
    await grantPluginAccessGroup(db, 'fs.example.tasks', 'grp_1', 'admin_1');
    await grantPluginAccessGroup(db, 'fs.example.tasks', 'grp_1', 'admin_1'); // idempotent

    expect(await listPluginAccessGroups(db, 'fs.example.tasks')).toEqual([
      { groupId: 'grp_1', grantedByUserId: 'admin_1', grantedAt: expect.any(Number) },
    ]);

    await revokePluginAccessGroup(db, 'fs.example.tasks', 'grp_1');
    expect(await listPluginAccessGroups(db, 'fs.example.tasks')).toEqual([]);
  });

  it('resolves plugin ids granted via any group the user belongs to', async () => {
    const db = await freshDb();
    await createUserGroup(db, 'grp_1', 'Finance', 'finance', null, 'admin_1');
    await addUserGroupMember(db, 'grp_1', 'user_1', 'admin_1');
    await grantPluginAccessGroup(db, 'fs.example.finance', 'grp_1', 'admin_1');

    expect(await listPluginIdsGrantedToUserGroups(db, 'user_1')).toEqual(['fs.example.finance']);
    expect(await listPluginIdsGrantedToUserGroups(db, 'user_2')).toEqual([]);
  });

  it('getUserGroupUsage reports a group referenced by a plugin access policy', async () => {
    const db = await freshDb();
    await createUserGroup(db, 'grp_1', 'Finance', 'finance', null, 'admin_1');
    expect(await getUserGroupUsage(db, 'grp_1')).toEqual({
      referencedByPluginAccessPolicies: false,
    });

    await grantPluginAccessGroup(db, 'fs.example.finance', 'grp_1', 'admin_1');
    expect(await getUserGroupUsage(db, 'grp_1')).toEqual({
      referencedByPluginAccessPolicies: true,
    });
  });
});
