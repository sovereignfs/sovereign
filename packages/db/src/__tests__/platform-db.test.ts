import { describe, expect, it } from 'vitest';
import { createClient } from '../client';
import {
  DEFAULT_TENANT_ID,
  DEFAULT_ROOT_PLUGIN_ID,
  bootstrapPlatformDb,
  createPluginConnection,
  createPluginSecret,
  deletePluginSecret,
  deletePluginProviderConfig,
  deleteUserData,
  disconnectPluginConnection,
  getAccountPrefs,
  getDefaultTenant,
  getPluginConnection,
  getPluginProviderConfig,
  getPluginSecret,
  getInstanceConfig,
  getPlatformSetting,
  listPluginConnections,
  listAllPluginProviderConfigs,
  listPluginSecrets,
  listUserPluginConnectionRefs,
  listUserPluginSecretRefs,
  markPluginConnectionError,
  markPluginConnectionUsed,
  markPluginProviderConfigChecked,
  markPluginSecretUsed,
  listAdminActivity,
  listDisabledPluginIds,
  listPluginStatus,
  listUserActivity,
  recordActivity,
  setAccountPrefs,
  setInstanceConfig,
  setPlatformSetting,
  setPluginEnabled,
  setTenantName,
  updatePluginConnection,
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
