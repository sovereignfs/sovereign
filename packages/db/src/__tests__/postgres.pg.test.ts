import { sql } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'vitest';
import { type PlatformDb, createClient } from '../client';
import { dbRun } from '../exec';
import {
  DEFAULT_ROOT_PLUGIN_ID,
  bootstrapPlatformDb,
  getAccountPrefs,
  getDefaultTenant,
  getPlatformSetting,
  listDisabledPluginIds,
  listPluginStatus,
  pingDb,
  setAccountPrefs,
  setPlatformSetting,
  setPluginEnabled,
  setTenantName,
} from '../platform-db';

/**
 * Live Postgres parity for the platform data layer. Skipped unless
 * TEST_DATABASE_URL points at a Postgres instance, so the default `pnpm test`
 * stays Docker-free. CI wires a Postgres service in Task 0.5.07.
 *
 *   TEST_DATABASE_URL=postgres://user:pass@localhost:5432/db pnpm test
 *
 * Asserts the dialect-divergence traps the query builder normalises: `enabled`
 * comes back as a real JS boolean (not 0/1) and the seeds/upserts behave the
 * same as on SQLite.
 */
const PG_URL = process.env.TEST_DATABASE_URL;

describe.skipIf(!PG_URL)('platform-db on Postgres', () => {
  let pdb: PlatformDb;

  beforeAll(async () => {
    pdb = createClient({ url: PG_URL });
    // Clean slate — the platform tables only (auth tables live elsewhere).
    for (const table of ['account_prefs', 'platform_settings', 'plugin_status', 'tenants']) {
      await dbRun(pdb, sql.raw(`DROP TABLE IF EXISTS ${table} CASCADE`));
    }
    await bootstrapPlatformDb(pdb);
  });

  it('connects with the postgres dialect', () => {
    expect(pdb.dialect).toBe('postgres');
  });

  it('pings without error', async () => {
    await expect(pingDb(pdb)).resolves.toBeUndefined();
  });

  it('seeds the default tenant and root plugin', async () => {
    expect((await getDefaultTenant(pdb)).name).toBe('Sovereign');
    expect(await getPlatformSetting(pdb, 'root_plugin_id')).toBe(DEFAULT_ROOT_PLUGIN_ID);
  });

  it('renames the tenant and upserts settings', async () => {
    await setTenantName(pdb, 'Acme');
    expect((await getDefaultTenant(pdb)).name).toBe('Acme');
    await setPlatformSetting(pdb, 'invite_only', 'true');
    await setPlatformSetting(pdb, 'invite_only', 'false');
    expect(await getPlatformSetting(pdb, 'invite_only')).toBe('false');
  });

  it('maps the plugin_status boolean to a JS boolean and upserts', async () => {
    await setPluginEnabled(pdb, 'fs.test.alpha', false);
    await setPluginEnabled(pdb, 'fs.test.alpha', false); // upsert, not a duplicate
    const rows = await listPluginStatus(pdb);
    expect(rows).toContainEqual({ pluginId: 'fs.test.alpha', enabled: false });
    expect(rows.every((r) => typeof r.enabled === 'boolean')).toBe(true);
    expect(await listDisabledPluginIds(pdb)).toContain('fs.test.alpha');

    await setPluginEnabled(pdb, 'fs.test.alpha', true);
    expect(await listDisabledPluginIds(pdb)).not.toContain('fs.test.alpha');
  });

  it('round-trips account preferences', async () => {
    expect(await getAccountPrefs(pdb, 'u1')).toEqual({
      timezone: 'UTC',
      theme: 'system',
      sidebarPlugins: null,
    });
    await setAccountPrefs(pdb, 'u1', { theme: 'dark' });
    expect(await getAccountPrefs(pdb, 'u1')).toEqual({
      timezone: 'UTC',
      theme: 'dark',
      sidebarPlugins: null,
    });
  });
});
