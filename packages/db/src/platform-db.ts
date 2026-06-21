import { eq, sql } from 'drizzle-orm';
import { platformBootstrapStatements } from './bootstrap';
import { type PlatformDb, createClient } from './client';
import { dbAll, dbGet, dbRun } from './exec';
import { runMigrations, type MigrationResult } from './migrate';
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
let _migrationResult: MigrationResult | null = null;

/**
 * The result of the last `runMigrations()` call. Null until the first call to
 * `getPlatformDb()` resolves. Used by the admin health route to surface
 * downgrade warnings.
 */
export function getLastMigrationResult(): MigrationResult | null {
  return _migrationResult;
}

/**
 * The platform database, migrated and seeded, memoised per process.
 *
 * `runMigrations()` is the load-bearing startup path: it applies all pending
 * drizzle-kit migrations, then inserts required seed rows. `bootstrapPlatformDb()`
 * is retained for direct use in tests (which operate on `:memory:` databases
 * and call it explicitly rather than going through this singleton).
 *
 * The promise is memoised so migrations run exactly once even under concurrent
 * first calls.
 */
export function getPlatformDb(): Promise<PlatformDb> {
  if (!_dbPromise) {
    _dbPromise = (async () => {
      const pdb = createClient();
      _migrationResult = await runMigrations(pdb);
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

/** Delete a platform setting for the default tenant. No-op if the key does not exist. */
export async function deletePlatformSetting(pdb: PlatformDb, key: string): Promise<void> {
  await dbRun(
    pdb,
    sql`DELETE FROM platform_settings WHERE key = ${key} AND tenant_id = ${DEFAULT_TENANT_ID}`,
  );
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

/**
 * Insert a plugin_status row with the given default enabled state, but only if
 * no row exists yet. Used at startup to seed example plugins as disabled without
 * overriding explicit operator choices.
 */
export async function insertPluginStatusIfAbsent(
  pdb: PlatformDb,
  pluginId: string,
  enabled: boolean,
): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  if (pdb.dialect === 'sqlite') {
    pdb.db
      .insert(sqlite.pluginStatus)
      .values({ pluginId, tenantId: DEFAULT_TENANT_ID, enabled, updatedAt: now })
      .onConflictDoNothing()
      .run();
    return;
  }
  await pdb.db
    .insert(pg.pluginStatus)
    .values({ pluginId, tenantId: DEFAULT_TENANT_ID, enabled, updatedAt: now })
    .onConflictDoNothing();
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

// ─── Activity log helpers (RFC 0005) ─────────────────────────────────────────

export interface ActivityLogRow {
  id: string;
  tenantId: string;
  actorId: string | null;
  actorType: string;
  action: string;
  subjectUserId: string | null;
  targetType: string | null;
  targetId: string | null;
  pluginId: string | null;
  visibility: string;
  summary: string | null;
  metadata: string | null;
  createdAt: number;
}

export interface RecordActivityInput {
  id: string;
  actorId?: string | null;
  actorType: 'user' | 'system' | 'plugin';
  action: string;
  subjectUserId?: string | null;
  targetType?: string | null;
  targetId?: string | null;
  pluginId?: string | null;
  visibility: 'admin' | 'user';
  summary?: string | null;
  metadata?: Record<string, unknown> | null;
}

/** Append one row to the activity log. Stamps `created_at` and `tenant_id`. */
export async function recordActivity(pdb: PlatformDb, input: RecordActivityInput): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  const meta = input.metadata != null ? JSON.stringify(input.metadata) : null;
  await dbRun(
    pdb,
    sql`INSERT INTO activity_log
          (id, tenant_id, actor_id, actor_type, action,
           subject_user_id, target_type, target_id, plugin_id,
           visibility, summary, metadata, created_at)
        VALUES
          (${input.id}, ${DEFAULT_TENANT_ID}, ${input.actorId ?? null},
           ${input.actorType}, ${input.action},
           ${input.subjectUserId ?? null}, ${input.targetType ?? null},
           ${input.targetId ?? null}, ${input.pluginId ?? null},
           ${input.visibility}, ${input.summary ?? null}, ${meta}, ${now})`,
  );
}

/**
 * Personal activity feed — events where the given user is actor or subject,
 * visibility = 'user'. Newest-first, limited to `limit` rows.
 */
export async function listUserActivity(
  pdb: PlatformDb,
  userId: string,
  limit = 50,
): Promise<ActivityLogRow[]> {
  return dbAll<ActivityLogRow>(
    pdb,
    sql`SELECT id, tenant_id AS "tenantId", actor_id AS "actorId",
               actor_type AS "actorType", action,
               subject_user_id AS "subjectUserId", target_type AS "targetType",
               target_id AS "targetId", plugin_id AS "pluginId",
               visibility, summary, metadata, created_at AS "createdAt"
        FROM activity_log
        WHERE tenant_id = ${DEFAULT_TENANT_ID}
          AND visibility = 'user'
          AND (actor_id = ${userId} OR subject_user_id = ${userId})
        ORDER BY created_at DESC
        LIMIT ${limit}`,
  );
}

/**
 * Admin (platform-wide) activity feed — all rows for the tenant, newest-first,
 * limited to `limit` rows. Optionally filtered by `actorId` or `action`.
 */
export async function listAdminActivity(
  pdb: PlatformDb,
  options: { actorId?: string; action?: string; limit?: number } = {},
): Promise<ActivityLogRow[]> {
  const limit = options.limit ?? 100;
  const actorFilter = options.actorId ?? null;
  const actionFilter = options.action ?? null;
  return dbAll<ActivityLogRow>(
    pdb,
    sql`SELECT id, tenant_id AS "tenantId", actor_id AS "actorId",
               actor_type AS "actorType", action,
               subject_user_id AS "subjectUserId", target_type AS "targetType",
               target_id AS "targetId", plugin_id AS "pluginId",
               visibility, summary, metadata, created_at AS "createdAt"
        FROM activity_log
        WHERE tenant_id = ${DEFAULT_TENANT_ID}
          AND (${actorFilter} IS NULL OR actor_id = ${actorFilter})
          AND (${actionFilter} IS NULL OR action = ${actionFilter})
        ORDER BY created_at DESC
        LIMIT ${limit}`,
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

// ─────────────────────────────────────────────────────────────────────────────
// Notifications (RFC 0015)
// ─────────────────────────────────────────────────────────────────────────────

/** A notification row as returned to callers. */
export interface NotificationRow {
  id: string;
  tenantId: string;
  recipientUserId: string;
  source: string;
  sourceType: string;
  title: string;
  body: string | null;
  url: string | null;
  category: string;
  icon: string | null;
  readAt: number | null;
  dismissedAt: number | null;
  createdAt: number;
}

export interface SendNotificationInput {
  id: string;
  recipientUserId: string;
  source: string;
  sourceType: 'plugin' | 'platform' | 'admin';
  title: string;
  body?: string;
  url?: string;
  category?: string;
  icon?: string;
}

/** Insert a new notification row. */
export async function sendNotification(
  pdb: PlatformDb,
  input: SendNotificationInput,
): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  await dbRun(
    pdb,
    sql`INSERT INTO notifications
          (id, tenant_id, recipient_user_id, source, source_type,
           title, body, url, category, icon, created_at)
        VALUES
          (${input.id}, ${DEFAULT_TENANT_ID}, ${input.recipientUserId},
           ${input.source}, ${input.sourceType},
           ${input.title}, ${input.body ?? null}, ${input.url ?? null},
           ${input.category ?? 'info'}, ${input.icon ?? null}, ${now})`,
  );
}

const NOTIF_SELECT = sql.raw(`
  SELECT id, tenant_id AS "tenantId", recipient_user_id AS "recipientUserId",
         source, source_type AS "sourceType", title, body, url, category, icon,
         read_at AS "readAt", dismissed_at AS "dismissedAt", created_at AS "createdAt"
  FROM notifications
`);

/**
 * List notifications for a user (newest first). Excludes dismissed rows by
 * default. Limit is capped at 100.
 */
export async function listUserNotifications(
  pdb: PlatformDb,
  userId: string,
  options: { includeDismissed?: boolean; limit?: number } = {},
): Promise<NotificationRow[]> {
  const limit = Math.min(options.limit ?? 50, 100);
  const includeDismissed = options.includeDismissed ?? false;
  return dbAll<NotificationRow>(
    pdb,
    sql`${NOTIF_SELECT}
        WHERE tenant_id = ${DEFAULT_TENANT_ID}
          AND recipient_user_id = ${userId}
          ${includeDismissed ? sql.raw('') : sql`AND dismissed_at IS NULL`}
        ORDER BY created_at DESC
        LIMIT ${limit}`,
  );
}

/** Count unread (non-dismissed) notifications for a user. */
export async function countUnreadNotifications(pdb: PlatformDb, userId: string): Promise<number> {
  const row = await dbGet<{ n: number }>(
    pdb,
    sql`SELECT COUNT(*) AS n FROM notifications
        WHERE tenant_id = ${DEFAULT_TENANT_ID}
          AND recipient_user_id = ${userId}
          AND read_at IS NULL
          AND dismissed_at IS NULL`,
  );
  return row?.n ?? 0;
}

/** Mark a single notification as read. No-op if already read or not owned by user. */
export async function markNotificationRead(
  pdb: PlatformDb,
  id: string,
  userId: string,
): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  await dbRun(
    pdb,
    sql`UPDATE notifications
        SET read_at = ${now}
        WHERE id = ${id}
          AND recipient_user_id = ${userId}
          AND read_at IS NULL`,
  );
}

/** Mark all unread non-dismissed notifications for a user as read. */
export async function markAllNotificationsRead(pdb: PlatformDb, userId: string): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  await dbRun(
    pdb,
    sql`UPDATE notifications
        SET read_at = ${now}
        WHERE tenant_id = ${DEFAULT_TENANT_ID}
          AND recipient_user_id = ${userId}
          AND read_at IS NULL
          AND dismissed_at IS NULL`,
  );
}

/** Dismiss a notification (hide from inbox). No-op if not owned by user. */
export async function dismissNotification(
  pdb: PlatformDb,
  id: string,
  userId: string,
): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  await dbRun(
    pdb,
    sql`UPDATE notifications
        SET dismissed_at = ${now},
            read_at = COALESCE(read_at, ${now})
        WHERE id = ${id}
          AND recipient_user_id = ${userId}
          AND dismissed_at IS NULL`,
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Notification prefs (RFC 0015)
// ─────────────────────────────────────────────────────────────────────────────

export interface NotificationPrefsValue {
  mutedCategories: string[];
  pollIntervalSecs: number;
}

const DEFAULT_NOTIFICATION_PREFS: NotificationPrefsValue = {
  mutedCategories: [],
  pollIntervalSecs: 30,
};

/** Get a user's notification preferences, falling back to defaults. */
export async function getNotificationPrefs(
  pdb: PlatformDb,
  userId: string,
): Promise<NotificationPrefsValue> {
  const row = await dbGet<{ mutedCategories: string; pollIntervalSecs: number }>(
    pdb,
    sql`SELECT muted_categories AS "mutedCategories", poll_interval_secs AS "pollIntervalSecs"
        FROM notification_prefs WHERE user_id = ${userId}`,
  );
  if (!row) return DEFAULT_NOTIFICATION_PREFS;
  return {
    mutedCategories: JSON.parse(row.mutedCategories) as string[],
    pollIntervalSecs: row.pollIntervalSecs,
  };
}

/** Upsert a user's notification preferences. */
export async function setNotificationPrefs(
  pdb: PlatformDb,
  userId: string,
  prefs: Partial<NotificationPrefsValue>,
): Promise<NotificationPrefsValue> {
  const current = await getNotificationPrefs(pdb, userId);
  const next: NotificationPrefsValue = {
    mutedCategories: prefs.mutedCategories ?? current.mutedCategories,
    pollIntervalSecs: prefs.pollIntervalSecs ?? current.pollIntervalSecs,
  };
  const now = Math.floor(Date.now() / 1000);
  await dbRun(
    pdb,
    sql`INSERT INTO notification_prefs (user_id, tenant_id, muted_categories, poll_interval_secs, updated_at)
        VALUES (${userId}, ${DEFAULT_TENANT_ID}, ${JSON.stringify(next.mutedCategories)}, ${next.pollIntervalSecs}, ${now})
        ON CONFLICT (user_id)
        DO UPDATE SET muted_categories = excluded.muted_categories,
                      poll_interval_secs = excluded.poll_interval_secs,
                      updated_at = excluded.updated_at`,
  );
  return next;
}

// ── Web Push subscriptions (RFC 0016) ────────────────────────────────────────

export interface PushSubscriptionRow {
  id: string;
  userId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  createdAt: number;
}

/** Upsert a Web Push subscription. Re-subscribing the same endpoint updates keys. */
export async function savePushSubscription(
  pdb: PlatformDb,
  input: { id: string; userId: string; endpoint: string; p256dh: string; auth: string },
): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  await dbRun(
    pdb,
    sql`INSERT INTO push_subscriptions (id, tenant_id, user_id, endpoint, p256dh, auth, created_at)
        VALUES (${input.id}, ${DEFAULT_TENANT_ID}, ${input.userId}, ${input.endpoint}, ${input.p256dh}, ${input.auth}, ${now})
        ON CONFLICT (endpoint)
        DO UPDATE SET user_id = excluded.user_id,
                      p256dh  = excluded.p256dh,
                      auth    = excluded.auth`,
  );
}

/** Return all active push subscriptions for a user. */
export async function getPushSubscriptionsForUser(
  pdb: PlatformDb,
  userId: string,
): Promise<PushSubscriptionRow[]> {
  return dbAll<PushSubscriptionRow>(
    pdb,
    sql`SELECT id, user_id AS "userId", endpoint, p256dh, auth, created_at AS "createdAt"
        FROM push_subscriptions
        WHERE tenant_id = ${DEFAULT_TENANT_ID}
          AND user_id = ${userId}`,
  );
}

/** Return push subscriptions for a list of user IDs (used by broadcast fan-out). */
export async function getPushSubscriptionsByUsers(
  pdb: PlatformDb,
  userIds: string[],
): Promise<PushSubscriptionRow[]> {
  if (userIds.length === 0) return [];
  const placeholders = userIds.map((id) => sql`${id}`).reduce((a, b) => sql`${a}, ${b}`);
  return dbAll<PushSubscriptionRow>(
    pdb,
    sql`SELECT id, user_id AS "userId", endpoint, p256dh, auth, created_at AS "createdAt"
        FROM push_subscriptions
        WHERE tenant_id = ${DEFAULT_TENANT_ID}
          AND user_id IN (${placeholders})`,
  );
}

/** Delete a push subscription by endpoint (called on 410 Gone or user unsubscribe). */
export async function deletePushSubscription(pdb: PlatformDb, endpoint: string): Promise<void> {
  await dbRun(pdb, sql`DELETE FROM push_subscriptions WHERE endpoint = ${endpoint}`);
}

/** Delete all push subscriptions for a user (e.g. when the user opts out). */
export async function deleteUserPushSubscriptions(pdb: PlatformDb, userId: string): Promise<void> {
  await dbRun(
    pdb,
    sql`DELETE FROM push_subscriptions
        WHERE tenant_id = ${DEFAULT_TENANT_ID} AND user_id = ${userId}`,
  );
}

/** Return true if the user has at least one active push subscription. */
export async function hasPushSubscription(pdb: PlatformDb, userId: string): Promise<boolean> {
  const row = await dbGet<{ n: number }>(
    pdb,
    sql`SELECT COUNT(*) AS n FROM push_subscriptions
        WHERE tenant_id = ${DEFAULT_TENANT_ID} AND user_id = ${userId}`,
  );
  return (row?.n ?? 0) > 0;
}

// ─── Entitlements (RFC 0003) ───────────────────────────────────────────────

export interface EntitlementRow {
  id: string;
  tenantId: string;
  userId: string;
  pluginId: string;
  tierId: string | null;
  status: string;
  source: string;
  licenseToken: string;
  issuedAt: number;
  expiresAt: number | null;
  createdAt: number;
  updatedAt: number;
}

/** Return the most-recent active (non-expired) entitlement for a user+plugin, or null. */
export async function getActiveEntitlement(
  pdb: PlatformDb,
  userId: string,
  pluginId: string,
): Promise<EntitlementRow | null> {
  const now = Math.floor(Date.now() / 1000);
  const row = await dbGet<EntitlementRow>(
    pdb,
    sql`SELECT id, tenant_id AS "tenantId", user_id AS "userId", plugin_id AS "pluginId",
               tier_id AS "tierId", status, source, license_token AS "licenseToken",
               issued_at AS "issuedAt", expires_at AS "expiresAt",
               created_at AS "createdAt", updated_at AS "updatedAt"
        FROM entitlements
        WHERE tenant_id = ${DEFAULT_TENANT_ID}
          AND user_id = ${userId}
          AND plugin_id = ${pluginId}
          AND status = 'active'
          AND (expires_at IS NULL OR expires_at > ${now})
        ORDER BY created_at DESC
        LIMIT 1`,
  );
  return row ?? null;
}

/** Return all entitlements (all statuses) for a user, newest first. */
export async function listUserEntitlements(
  pdb: PlatformDb,
  userId: string,
): Promise<EntitlementRow[]> {
  return dbAll<EntitlementRow>(
    pdb,
    sql`SELECT id, tenant_id AS "tenantId", user_id AS "userId", plugin_id AS "pluginId",
               tier_id AS "tierId", status, source, license_token AS "licenseToken",
               issued_at AS "issuedAt", expires_at AS "expiresAt",
               created_at AS "createdAt", updated_at AS "updatedAt"
        FROM entitlements
        WHERE tenant_id = ${DEFAULT_TENANT_ID} AND user_id = ${userId}
        ORDER BY created_at DESC`,
  );
}

/** Return all entitlements for a plugin (admin view), newest first. */
export async function listPluginEntitlements(
  pdb: PlatformDb,
  pluginId: string,
): Promise<EntitlementRow[]> {
  return dbAll<EntitlementRow>(
    pdb,
    sql`SELECT id, tenant_id AS "tenantId", user_id AS "userId", plugin_id AS "pluginId",
               tier_id AS "tierId", status, source, license_token AS "licenseToken",
               issued_at AS "issuedAt", expires_at AS "expiresAt",
               created_at AS "createdAt", updated_at AS "updatedAt"
        FROM entitlements
        WHERE tenant_id = ${DEFAULT_TENANT_ID} AND plugin_id = ${pluginId}
        ORDER BY created_at DESC`,
  );
}

/** Return all entitlements across all plugins (admin overview), newest first. */
export async function listAllEntitlements(pdb: PlatformDb): Promise<EntitlementRow[]> {
  return dbAll<EntitlementRow>(
    pdb,
    sql`SELECT id, tenant_id AS "tenantId", user_id AS "userId", plugin_id AS "pluginId",
               tier_id AS "tierId", status, source, license_token AS "licenseToken",
               issued_at AS "issuedAt", expires_at AS "expiresAt",
               created_at AS "createdAt", updated_at AS "updatedAt"
        FROM entitlements
        WHERE tenant_id = ${DEFAULT_TENANT_ID}
        ORDER BY created_at DESC`,
  );
}

/** Insert or update an entitlement row. Uses UPSERT on (user_id, plugin_id). */
export async function saveEntitlement(
  pdb: PlatformDb,
  row: Omit<EntitlementRow, 'tenantId'>,
): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  await dbRun(
    pdb,
    sql`INSERT INTO entitlements
          (id, tenant_id, user_id, plugin_id, tier_id, status, source,
           license_token, issued_at, expires_at, created_at, updated_at)
        VALUES
          (${row.id}, ${DEFAULT_TENANT_ID}, ${row.userId}, ${row.pluginId},
           ${row.tierId ?? null}, ${row.status}, ${row.source},
           ${row.licenseToken}, ${row.issuedAt}, ${row.expiresAt ?? null},
           ${now}, ${now})
        ON CONFLICT(id) DO UPDATE SET
          tier_id       = excluded.tier_id,
          status        = excluded.status,
          source        = excluded.source,
          license_token = excluded.license_token,
          issued_at     = excluded.issued_at,
          expires_at    = excluded.expires_at,
          updated_at    = ${now}`,
  );
}

/** Mark an entitlement as cancelled by ID. */
export async function cancelEntitlement(pdb: PlatformDb, id: string): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  await dbRun(
    pdb,
    sql`UPDATE entitlements
        SET status = 'cancelled', updated_at = ${now}
        WHERE id = ${id} AND tenant_id = ${DEFAULT_TENANT_ID}`,
  );
}

// ── Tenant branding (RFC 0027) ─────────────────────────────────────────────

const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;

export interface TenantBrandingValue {
  brandName: string;
  brandLogo: string | null;
  brandLogoDark: string | null;
  brandFavicon: string | null;
  brandPrimary: string | null;
  emailFromName: string | null;
  emailLogo: string | null;
}

/**
 * Read tenant branding, merging DB values over BRAND_* env-var defaults.
 * Always returns a complete object — null fields mean "no override set".
 */
export async function getTenantBranding(
  pdb: PlatformDb,
  tenantId: string,
): Promise<TenantBrandingValue> {
  const row = await dbGet<{
    brandName: string | null;
    brandLogo: string | null;
    brandLogoDark: string | null;
    brandFavicon: string | null;
    brandPrimary: string | null;
    emailFromName: string | null;
    emailLogo: string | null;
  }>(
    pdb,
    sql`SELECT brand_name AS "brandName",
               brand_logo AS "brandLogo",
               brand_logo_dark AS "brandLogoDark",
               brand_favicon AS "brandFavicon",
               brand_primary AS "brandPrimary",
               email_from_name AS "emailFromName",
               email_logo AS "emailLogo"
        FROM tenant_branding WHERE tenant_id = ${tenantId}`,
  );
  return {
    brandName: row?.brandName ?? process.env.BRAND_NAME ?? 'Sovereign',
    brandLogo: row?.brandLogo ?? process.env.BRAND_LOGO ?? null,
    brandLogoDark: row?.brandLogoDark ?? process.env.BRAND_LOGO_DARK ?? null,
    brandFavicon: row?.brandFavicon ?? process.env.BRAND_FAVICON ?? null,
    brandPrimary:
      (row?.brandPrimary ?? process.env.BRAND_PRIMARY_COLOR ?? null) &&
      HEX_COLOR_RE.test(row?.brandPrimary ?? process.env.BRAND_PRIMARY_COLOR ?? '')
        ? (row?.brandPrimary ?? process.env.BRAND_PRIMARY_COLOR ?? null)
        : null,
    emailFromName: row?.emailFromName ?? process.env.BRAND_EMAIL_FROM_NAME ?? null,
    emailLogo: row?.emailLogo ?? process.env.BRAND_EMAIL_LOGO ?? null,
  };
}

/**
 * Upsert tenant branding. Callers read the current state via getTenantBranding,
 * mutate fields, then write the full merged value back.
 * brand_primary is validated as a 6-digit hex colour before persisting —
 * raw user input must never reach a <style> block unchecked (CSS injection).
 */
export async function setTenantBranding(
  pdb: PlatformDb,
  tenantId: string,
  values: Omit<TenantBrandingValue, 'brandName'> & { brandName: string | null },
): Promise<void> {
  if (values.brandPrimary !== null) {
    if (!HEX_COLOR_RE.test(values.brandPrimary)) {
      throw new Error(
        `Invalid brandPrimary: "${values.brandPrimary}". Must be a 6-digit hex colour (#rrggbb).`,
      );
    }
  }
  const now = Math.floor(Date.now() / 1000);
  await dbRun(
    pdb,
    sql`INSERT INTO tenant_branding
          (tenant_id, brand_name, brand_logo, brand_logo_dark, brand_favicon,
           brand_primary, email_from_name, email_logo, updated_at)
        VALUES
          (${tenantId}, ${values.brandName}, ${values.brandLogo}, ${values.brandLogoDark},
           ${values.brandFavicon}, ${values.brandPrimary}, ${values.emailFromName},
           ${values.emailLogo}, ${now})
        ON CONFLICT (tenant_id) DO UPDATE SET
          brand_name      = excluded.brand_name,
          brand_logo      = excluded.brand_logo,
          brand_logo_dark = excluded.brand_logo_dark,
          brand_favicon   = excluded.brand_favicon,
          brand_primary   = excluded.brand_primary,
          email_from_name = excluded.email_from_name,
          email_logo      = excluded.email_logo,
          updated_at      = excluded.updated_at`,
  );
}

/**
 * Return IDs of plugins that require an entitlement (non-free model) and
 * for which the given user currently has NO active entitlement.
 * Used by the middleware to determine which plugins are paywalled for this user.
 */
export async function getPaidPluginsWithoutEntitlement(
  pdb: PlatformDb,
  userId: string,
  paidPluginIds: string[],
): Promise<string[]> {
  if (paidPluginIds.length === 0) return [];
  const now = Math.floor(Date.now() / 1000);
  const rows = await dbAll<{ pluginId: string }>(
    pdb,
    sql`SELECT plugin_id AS "pluginId"
        FROM entitlements
        WHERE tenant_id = ${DEFAULT_TENANT_ID}
          AND user_id = ${userId}
          AND status = 'active'
          AND (expires_at IS NULL OR expires_at > ${now})
          AND plugin_id IN (${sql.join(
            paidPluginIds.map((id) => sql`${id}`),
            sql`, `,
          )})`,
  );
  const entitled = new Set(rows.map((r) => r.pluginId));
  return paidPluginIds.filter((id) => !entitled.has(id));
}
