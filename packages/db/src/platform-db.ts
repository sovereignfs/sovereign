import { eq, sql } from 'drizzle-orm';
import { platformBootstrapStatements } from './bootstrap';
import { type PlatformDb, createClient } from './client';
import { dbAll, dbGet, dbRun } from './exec';
import * as pg from './schema/postgres';
import * as sqlite from './schema/sqlite';

export type { PlatformDb };

/** v1 is single-tenant; every tenant-scoped row uses this id (SRS §3.1). */
export const DEFAULT_TENANT_ID = 'default';

/** Default root plugin (SRS PLT-14). */
export const DEFAULT_ROOT_PLUGIN_ID = 'fs.sovereign.launcher';

const DEFAULT_TENANT_NAME = 'Sovereign';

/**
 * Apply the interim DDL bootstrap and seed rows. Idempotent — CREATE TABLE IF
 * NOT EXISTS plus conflict-ignoring inserts. Dialect-agnostic: the DDL is
 * dialect-aware (see ./bootstrap) and the seeds are standard `INSERT … ON
 * CONFLICT DO NOTHING`, supported identically by SQLite and Postgres. Exported
 * separately from the singleton so tests can run it against `:memory:`.
 */
export async function bootstrapPlatformDb(pdb: PlatformDb): Promise<void> {
  for (const statement of platformBootstrapStatements(pdb.dialect)) {
    await dbRun(pdb, sql.raw(statement));
  }

  const now = Math.floor(Date.now() / 1000);

  await dbRun(
    pdb,
    sql`INSERT INTO tenants (id, name, created_at, updated_at)
        VALUES (${DEFAULT_TENANT_ID}, ${DEFAULT_TENANT_NAME}, ${now}, ${now})
        ON CONFLICT (id) DO NOTHING`,
  );
  await dbRun(
    pdb,
    sql`INSERT INTO platform_settings (key, tenant_id, value, updated_at)
        VALUES ('root_plugin_id', ${DEFAULT_TENANT_ID}, ${DEFAULT_ROOT_PLUGIN_ID}, ${now})
        ON CONFLICT (key, tenant_id) DO NOTHING`,
  );
}

let _dbPromise: Promise<PlatformDb> | null = null;

/**
 * The platform database, initialised once per process from the environment
 * (DATABASE_URL / DB_DIALECT) with tables bootstrapped and seed rows present.
 * The initialisation promise is memoised so bootstrap runs exactly once even
 * under concurrent first calls.
 */
export function getPlatformDb(): Promise<PlatformDb> {
  if (!_dbPromise) {
    _dbPromise = (async () => {
      const pdb = createClient();
      await bootstrapPlatformDb(pdb);
      return pdb;
    })();
  }
  return _dbPromise;
}

/** Liveness check — throws if the database is unreachable. */
export async function pingDb(pdb: PlatformDb): Promise<void> {
  await dbGet(pdb, sql`SELECT 1`);
}

/** Read a platform setting for the default tenant. Returns null when unset. */
export async function getPlatformSetting(pdb: PlatformDb, key: string): Promise<string | null> {
  const row = await dbGet<{ value: string }>(
    pdb,
    sql`SELECT value FROM platform_settings WHERE key = ${key} AND tenant_id = ${DEFAULT_TENANT_ID}`,
  );
  return row?.value ?? null;
}

/** Upsert a platform setting for the default tenant. */
export async function setPlatformSetting(
  pdb: PlatformDb,
  key: string,
  value: string,
): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  await dbRun(
    pdb,
    sql`INSERT INTO platform_settings (key, tenant_id, value, updated_at)
        VALUES (${key}, ${DEFAULT_TENANT_ID}, ${value}, ${now})
        ON CONFLICT (key, tenant_id)
        DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
  );
}

/** The default tenant's name. Always present after bootstrap. */
export async function getDefaultTenant(pdb: PlatformDb): Promise<{ name: string }> {
  const row = await dbGet<{ name: string }>(
    pdb,
    sql`SELECT name FROM tenants WHERE id = ${DEFAULT_TENANT_ID}`,
  );
  if (!row) {
    throw new Error('Default tenant missing — was bootstrapPlatformDb() run?');
  }
  return row;
}

/** Rename the default tenant (CON-08). */
export async function setTenantName(pdb: PlatformDb, name: string): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  await dbRun(
    pdb,
    sql`UPDATE tenants SET name = ${name}, updated_at = ${now} WHERE id = ${DEFAULT_TENANT_ID}`,
  );
}

/**
 * Per-plugin enable/disable state (absence of a row = enabled). The `enabled`
 * column is a boolean, which SQLite stores as 0/1 and Postgres natively — so
 * these go through the Drizzle query builder (which maps both to a JS boolean)
 * rather than raw SQL.
 */
export async function listPluginStatus(
  pdb: PlatformDb,
): Promise<{ pluginId: string; enabled: boolean }[]> {
  if (pdb.dialect === 'sqlite') {
    return pdb.db
      .select({ pluginId: sqlite.pluginStatus.pluginId, enabled: sqlite.pluginStatus.enabled })
      .from(sqlite.pluginStatus)
      .all();
  }
  return pdb.db
    .select({ pluginId: pg.pluginStatus.pluginId, enabled: pg.pluginStatus.enabled })
    .from(pg.pluginStatus);
}

/** IDs of explicitly-disabled plugins (consumed by the middleware gate). */
export async function listDisabledPluginIds(pdb: PlatformDb): Promise<string[]> {
  if (pdb.dialect === 'sqlite') {
    const rows = pdb.db
      .select({ pluginId: sqlite.pluginStatus.pluginId })
      .from(sqlite.pluginStatus)
      .where(eq(sqlite.pluginStatus.enabled, false))
      .all();
    return rows.map((r) => r.pluginId);
  }
  const rows = await pdb.db
    .select({ pluginId: pg.pluginStatus.pluginId })
    .from(pg.pluginStatus)
    .where(eq(pg.pluginStatus.enabled, false));
  return rows.map((r) => r.pluginId);
}

/** Enable or disable a plugin (upsert on plugin_id) — CON-07. */
export async function setPluginEnabled(
  pdb: PlatformDb,
  pluginId: string,
  enabled: boolean,
): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  if (pdb.dialect === 'sqlite') {
    pdb.db
      .insert(sqlite.pluginStatus)
      .values({ pluginId, tenantId: DEFAULT_TENANT_ID, enabled, updatedAt: now })
      .onConflictDoUpdate({
        target: sqlite.pluginStatus.pluginId,
        set: { enabled, updatedAt: now },
      })
      .run();
    return;
  }
  await pdb.db
    .insert(pg.pluginStatus)
    .values({ pluginId, tenantId: DEFAULT_TENANT_ID, enabled, updatedAt: now })
    .onConflictDoUpdate({ target: pg.pluginStatus.pluginId, set: { enabled, updatedAt: now } });
}

// ─── Cross-plugin data sharing helpers (RFC 0002) ────────────────────────────

export interface ConsentGrantRow {
  id: string;
  userId: string;
  consumerId: string;
  providerId: string;
  contract: string;
  version: number;
  grantedAt: number;
  revokedAt: number | null;
}

/**
 * Find the active consent grant for a (user, consumer, provider, contract, version) tuple.
 * Returns undefined when no active grant exists.
 */
export async function getConsentGrant(
  pdb: PlatformDb,
  userId: string,
  consumerId: string,
  providerId: string,
  contract: string,
  version: number,
): Promise<ConsentGrantRow | undefined> {
  return dbGet<ConsentGrantRow>(
    pdb,
    sql`SELECT id, user_id AS "userId", consumer_id AS "consumerId",
               provider_id AS "providerId", contract, version,
               granted_at AS "grantedAt", revoked_at AS "revokedAt"
        FROM consent_grants
        WHERE user_id = ${userId}
          AND consumer_id = ${consumerId}
          AND provider_id = ${providerId}
          AND contract = ${contract}
          AND version = ${version}
          AND revoked_at IS NULL
        LIMIT 1`,
  );
}

/** List all active consent grants for a user. */
export async function listConsentGrants(
  pdb: PlatformDb,
  userId: string,
): Promise<ConsentGrantRow[]> {
  return dbAll<ConsentGrantRow>(
    pdb,
    sql`SELECT id, user_id AS "userId", consumer_id AS "consumerId",
               provider_id AS "providerId", contract, version,
               granted_at AS "grantedAt", revoked_at AS "revokedAt"
        FROM consent_grants
        WHERE user_id = ${userId}
          AND revoked_at IS NULL
        ORDER BY granted_at DESC`,
  );
}

/** List all active consent grants across all users (admin view). */
export async function listAllConsentGrants(pdb: PlatformDb): Promise<ConsentGrantRow[]> {
  return dbAll<ConsentGrantRow>(
    pdb,
    sql`SELECT id, user_id AS "userId", consumer_id AS "consumerId",
               provider_id AS "providerId", contract, version,
               granted_at AS "grantedAt", revoked_at AS "revokedAt"
        FROM consent_grants
        WHERE revoked_at IS NULL
        ORDER BY granted_at DESC`,
  );
}

/** Create a new consent grant (idempotent — does nothing if an active grant already exists). */
export async function createConsentGrant(
  pdb: PlatformDb,
  id: string,
  userId: string,
  consumerId: string,
  providerId: string,
  contract: string,
  version: number,
): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  await dbRun(
    pdb,
    sql`INSERT INTO consent_grants
          (id, tenant_id, user_id, consumer_id, provider_id, contract, version, granted_at)
        VALUES
          (${id}, ${DEFAULT_TENANT_ID}, ${userId}, ${consumerId}, ${providerId},
           ${contract}, ${version}, ${now})
        ON CONFLICT (id) DO NOTHING`,
  );
}

/** Soft-delete a consent grant by setting revoked_at. No-op if already revoked. */
export async function revokeConsentGrant(
  pdb: PlatformDb,
  id: string,
  userId: string,
): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  await dbRun(
    pdb,
    sql`UPDATE consent_grants
        SET revoked_at = ${now}
        WHERE id = ${id}
          AND user_id = ${userId}
          AND revoked_at IS NULL`,
  );
}

/** Append an immutable data-access audit log entry (RFC 0002). */
export async function logDataAccess(
  pdb: PlatformDb,
  id: string,
  userId: string,
  consumerId: string,
  providerId: string,
  contract: string,
  version: number,
  rowCount: number,
): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  await dbRun(
    pdb,
    sql`INSERT INTO data_access_log
          (id, tenant_id, user_id, consumer_id, provider_id, contract, version, accessed_at, row_count)
        VALUES
          (${id}, ${DEFAULT_TENANT_ID}, ${userId}, ${consumerId}, ${providerId},
           ${contract}, ${version}, ${now}, ${rowCount})`,
  );
}

// ─────────────────────────────────────────────────────────────────────────────

/** Account-plugin preferences with their defaults (SRS ACC-07/08). */
export interface AccountPrefsValue {
  timezone: string;
  theme: string;
}

const DEFAULT_ACCOUNT_PREFS: AccountPrefsValue = { timezone: 'UTC', theme: 'system' };

/** A user's Account preferences, falling back to defaults when no row exists. */
export async function getAccountPrefs(pdb: PlatformDb, userId: string): Promise<AccountPrefsValue> {
  const row = await dbGet<AccountPrefsValue>(
    pdb,
    sql`SELECT timezone, theme FROM account_prefs WHERE user_id = ${userId}`,
  );
  return row ?? DEFAULT_ACCOUNT_PREFS;
}

/** Upsert a user's Account preferences (one row per user). */
export async function setAccountPrefs(
  pdb: PlatformDb,
  userId: string,
  prefs: Partial<AccountPrefsValue>,
): Promise<AccountPrefsValue> {
  const current = await getAccountPrefs(pdb, userId);
  const next = { ...current, ...prefs };
  const now = Math.floor(Date.now() / 1000);
  await dbRun(
    pdb,
    sql`INSERT INTO account_prefs (user_id, tenant_id, timezone, theme, updated_at)
        VALUES (${userId}, ${DEFAULT_TENANT_ID}, ${next.timezone}, ${next.theme}, ${now})
        ON CONFLICT (user_id)
        DO UPDATE SET timezone = excluded.timezone, theme = excluded.theme, updated_at = excluded.updated_at`,
  );
  return next;
}
