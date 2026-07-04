import { describe, expect, it } from 'vitest';
import { createClient } from '../client';
import {
  DEFAULT_TENANT_ID,
  DEFAULT_ROOT_PLUGIN_ID,
  bootstrapPlatformDb,
  getAccountPrefs,
  getDefaultTenant,
  getInstanceConfig,
  getPlatformSetting,
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
