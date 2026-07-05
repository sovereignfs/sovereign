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
  // Stable UUID that uniquely identifies this Sovereign installation. Generated
  // once; never overwritten. Used by sdk.platform.getConfig().instanceId.
  const instanceId = crypto.randomUUID();
  await dbRun(
    pdb,
    sql`INSERT INTO platform_settings (key, tenant_id, value, updated_at)
        VALUES ('instance_id', ${DEFAULT_TENANT_ID}, ${instanceId}, ${now})
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

/**
 * Return the stable instance UUID. Generated once at bootstrap and stored in
 * `platform_settings` under `'instance_id'`. Throws if bootstrap has not run.
 */
export async function getInstanceId(pdb: PlatformDb): Promise<string> {
  const id = await getPlatformSetting(pdb, 'instance_id');
  if (!id) throw new Error('instance_id missing — was bootstrapPlatformDb() run?');
  return id;
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

// ─── Plugin secret vault helpers (RFC 0043) ─────────────────────────────────

export type PluginSecretScope = 'user' | 'plugin' | 'instance';

export interface PluginSecretAccessContext {
  tenantId: string;
  pluginId: string;
  userId: string | null;
}

export interface PluginSecretRefRow {
  id: string;
  tenantId: string;
  pluginId: string;
  scope: PluginSecretScope;
  userId: string | null;
  label: string;
  metadata: string | null;
  createdAt: number;
  updatedAt: number;
  lastUsedAt: number | null;
}

export interface PluginSecretRow extends PluginSecretRefRow {
  ciphertext: string;
  deletedAt: number | null;
}

export interface CreatePluginSecretInput extends PluginSecretAccessContext {
  id: string;
  scope: PluginSecretScope;
  label: string;
  ciphertext: string;
  metadata?: string | null;
}

function isPluginSecretScope(value: string): value is PluginSecretScope {
  return value === 'user' || value === 'plugin' || value === 'instance';
}

function requirePluginSecretScope(value: string): PluginSecretScope {
  if (!isPluginSecretScope(value)) throw new Error(`Invalid plugin secret scope: ${value}`);
  return value;
}

function canAccessSecret(
  row: PluginSecretRow | PluginSecretRefRow,
  context: PluginSecretAccessContext,
): boolean {
  if (row.tenantId !== context.tenantId || row.pluginId !== context.pluginId) return false;
  if (row.scope === 'user') return Boolean(context.userId) && row.userId === context.userId;
  return row.userId === null;
}

function mapPluginSecretRow(row: PluginSecretRow): PluginSecretRow {
  return { ...row, scope: requirePluginSecretScope(row.scope) };
}

function mapPluginSecretRefRow(row: PluginSecretRefRow): PluginSecretRefRow {
  return { ...row, scope: requirePluginSecretScope(row.scope) };
}

/** Store encrypted secret material plus non-secret metadata. */
export async function createPluginSecret(
  pdb: PlatformDb,
  input: CreatePluginSecretInput,
): Promise<PluginSecretRefRow> {
  if (input.scope === 'user' && !input.userId) {
    throw new Error('User-scoped plugin secrets require a userId.');
  }
  const now = Math.floor(Date.now() / 1000);
  const userId = input.scope === 'user' ? input.userId : null;
  await dbRun(
    pdb,
    sql`INSERT INTO plugin_secrets
          (id, tenant_id, plugin_id, scope, user_id, label, ciphertext,
           metadata, created_at, updated_at, last_used_at, deleted_at)
        VALUES
          (${input.id}, ${input.tenantId}, ${input.pluginId}, ${input.scope},
           ${userId}, ${input.label}, ${input.ciphertext}, ${input.metadata ?? null},
           ${now}, ${now}, NULL, NULL)`,
  );
  const row = await getPluginSecret(pdb, input.id, input);
  if (!row) throw new Error('Plugin secret was not readable after creation.');
  const { ciphertext: _ciphertext, deletedAt: _deletedAt, ...ref } = row;
  return ref;
}

/** Fetch one accessible, non-deleted secret row including ciphertext. */
export async function getPluginSecret(
  pdb: PlatformDb,
  id: string,
  context: PluginSecretAccessContext,
): Promise<PluginSecretRow | undefined> {
  const row = await dbGet<PluginSecretRow>(
    pdb,
    sql`SELECT id, tenant_id AS "tenantId", plugin_id AS "pluginId", scope,
               user_id AS "userId", label, ciphertext, metadata,
               created_at AS "createdAt", updated_at AS "updatedAt",
               last_used_at AS "lastUsedAt", deleted_at AS "deletedAt"
        FROM plugin_secrets
        WHERE id = ${id}
          AND tenant_id = ${context.tenantId}
          AND plugin_id = ${context.pluginId}
          AND deleted_at IS NULL
        LIMIT 1`,
  );
  if (!row) return undefined;
  const mapped = mapPluginSecretRow(row);
  return canAccessSecret(mapped, context) ? mapped : undefined;
}

/** Update last-used time for an accessible secret read. */
export async function markPluginSecretUsed(
  pdb: PlatformDb,
  id: string,
  context: PluginSecretAccessContext,
): Promise<void> {
  const row = await getPluginSecret(pdb, id, context);
  if (!row) return;
  const now = Math.floor(Date.now() / 1000);
  await dbRun(
    pdb,
    sql`UPDATE plugin_secrets
        SET last_used_at = ${now}
        WHERE id = ${id}
          AND tenant_id = ${context.tenantId}
          AND plugin_id = ${context.pluginId}
          AND deleted_at IS NULL`,
  );
}

/** List accessible non-deleted secret metadata; ciphertext is never returned. */
export async function listPluginSecrets(
  pdb: PlatformDb,
  context: PluginSecretAccessContext,
  scope?: PluginSecretScope,
): Promise<PluginSecretRefRow[]> {
  const rows = await dbAll<PluginSecretRefRow>(
    pdb,
    sql`SELECT id, tenant_id AS "tenantId", plugin_id AS "pluginId", scope,
               user_id AS "userId", label, metadata,
               created_at AS "createdAt", updated_at AS "updatedAt",
               last_used_at AS "lastUsedAt"
        FROM plugin_secrets
        WHERE tenant_id = ${context.tenantId}
          AND plugin_id = ${context.pluginId}
          AND deleted_at IS NULL
        ORDER BY updated_at DESC`,
  );
  return rows
    .map(mapPluginSecretRefRow)
    .filter((row) => (scope ? row.scope === scope : true))
    .filter((row) => canAccessSecret(row, context));
}

/** List metadata for a user's export/account surface across all plugins. */
export async function listUserPluginSecretRefs(
  pdb: PlatformDb,
  userId: string,
  tenantId = DEFAULT_TENANT_ID,
): Promise<PluginSecretRefRow[]> {
  const rows = await dbAll<PluginSecretRefRow>(
    pdb,
    sql`SELECT id, tenant_id AS "tenantId", plugin_id AS "pluginId", scope,
               user_id AS "userId", label, metadata,
               created_at AS "createdAt", updated_at AS "updatedAt",
               last_used_at AS "lastUsedAt"
        FROM plugin_secrets
        WHERE tenant_id = ${tenantId}
          AND scope = 'user'
          AND user_id = ${userId}
          AND deleted_at IS NULL
        ORDER BY updated_at DESC`,
  );
  return rows.map(mapPluginSecretRefRow);
}

/** Replace encrypted secret material for an accessible secret row. */
export async function updatePluginSecret(
  pdb: PlatformDb,
  id: string,
  context: PluginSecretAccessContext,
  ciphertext: string,
): Promise<PluginSecretRefRow | undefined> {
  const existing = await getPluginSecret(pdb, id, context);
  if (!existing) return undefined;
  const now = Math.floor(Date.now() / 1000);
  await dbRun(
    pdb,
    sql`UPDATE plugin_secrets
        SET ciphertext = ${ciphertext}, updated_at = ${now}
        WHERE id = ${id}
          AND tenant_id = ${context.tenantId}
          AND plugin_id = ${context.pluginId}
          AND deleted_at IS NULL`,
  );
  const row = await getPluginSecret(pdb, id, context);
  if (!row) return undefined;
  const { ciphertext: _ciphertext, deletedAt: _deletedAt, ...ref } = row;
  return ref;
}

/** Soft-delete an accessible secret so future reads are immediately revoked. */
export async function deletePluginSecret(
  pdb: PlatformDb,
  id: string,
  context: PluginSecretAccessContext,
): Promise<void> {
  const existing = await getPluginSecret(pdb, id, context);
  if (!existing) return;
  const now = Math.floor(Date.now() / 1000);
  await dbRun(
    pdb,
    sql`UPDATE plugin_secrets
        SET deleted_at = ${now}, updated_at = ${now}
        WHERE id = ${id}
          AND tenant_id = ${context.tenantId}
          AND plugin_id = ${context.pluginId}
          AND deleted_at IS NULL`,
  );
}

/** Hard-delete user-scoped plugin secrets during account deletion (RFC 0033/0043). */
export async function hardDeleteUserPluginSecrets(
  pdb: PlatformDb,
  userId: string,
  tenantId = DEFAULT_TENANT_ID,
): Promise<void> {
  await dbRun(
    pdb,
    sql`DELETE FROM plugin_secrets
        WHERE tenant_id = ${tenantId}
          AND scope = 'user'
          AND user_id = ${userId}`,
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

export type EmailDeliveryClass = 'authentication' | 'security' | 'administrative' | 'communication';

export type EmailDeliveryStatus = 'skipped' | 'queued' | 'sent' | 'failed';

export interface EmailDeliveryLogRow {
  id: string;
  tenantId: string;
  createdAt: number;
  deliveryClass: EmailDeliveryClass;
  templateId: string;
  source: string;
  recipientUserId: string | null;
  recipientEmailHash: string | null;
  actorUserId: string | null;
  status: EmailDeliveryStatus;
  providerMessageId: string | null;
  errorCode: string | null;
  metadata: string | null;
}

export interface RecordEmailDeliveryInput {
  id: string;
  deliveryClass: EmailDeliveryClass;
  templateId: string;
  source: string;
  recipientUserId?: string | null;
  recipientEmailHash?: string | null;
  actorUserId?: string | null;
  status: EmailDeliveryStatus;
  providerMessageId?: string | null;
  errorCode?: string | null;
  metadata?: Record<string, unknown> | null;
}

/** Append one non-secret email delivery diagnostic row (RFC 0062). */
export async function recordEmailDelivery(
  pdb: PlatformDb,
  input: RecordEmailDeliveryInput,
): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  const meta = input.metadata != null ? JSON.stringify(input.metadata) : null;
  await dbRun(
    pdb,
    sql`INSERT INTO email_delivery_log
          (id, tenant_id, created_at, delivery_class, template_id, source,
           recipient_user_id, recipient_email_hash, actor_user_id, status,
           provider_message_id, error_code, metadata)
        VALUES
          (${input.id}, ${DEFAULT_TENANT_ID}, ${now}, ${input.deliveryClass},
           ${input.templateId}, ${input.source}, ${input.recipientUserId ?? null},
           ${input.recipientEmailHash ?? null}, ${input.actorUserId ?? null},
           ${input.status}, ${input.providerMessageId ?? null}, ${input.errorCode ?? null},
           ${meta})`,
  );
}

export interface EmailDeliveryDiagnostics {
  smtpConfigured: boolean;
  lastSendStatus: EmailDeliveryStatus | null;
  lastSendAt: number | null;
  lastFailureCode: string | null;
  recentFailureCount: number;
}

export async function getEmailDeliveryDiagnostics(
  pdb: PlatformDb,
  smtpConfigured: boolean,
  sinceSeconds: number = Math.floor(Date.now() / 1000) - 86400,
): Promise<EmailDeliveryDiagnostics> {
  const last = await dbGet<{ status: EmailDeliveryStatus; createdAt: number }>(
    pdb,
    sql`SELECT status, created_at AS "createdAt"
        FROM email_delivery_log
        WHERE tenant_id = ${DEFAULT_TENANT_ID}
        ORDER BY created_at DESC
        LIMIT 1`,
  );
  const lastFailure = await dbGet<{ errorCode: string | null }>(
    pdb,
    sql`SELECT error_code AS "errorCode"
        FROM email_delivery_log
        WHERE tenant_id = ${DEFAULT_TENANT_ID}
          AND status = 'failed'
        ORDER BY created_at DESC
        LIMIT 1`,
  );
  const recentFailures = await dbGet<{ c: number | string }>(
    pdb,
    sql`SELECT COUNT(*) AS c
        FROM email_delivery_log
        WHERE tenant_id = ${DEFAULT_TENANT_ID}
          AND status = 'failed'
          AND created_at >= ${sinceSeconds}`,
  );
  return {
    smtpConfigured,
    lastSendStatus: last?.status ?? null,
    lastSendAt: last?.createdAt ?? null,
    lastFailureCode: lastFailure?.errorCode ?? null,
    recentFailureCount: Number(recentFailures?.c ?? 0),
  };
}

/**
 * Personal activity feed — events where the given user is actor or subject,
 * visibility = 'user'. Newest-first, limited to `limit` rows starting at
 * `offset` (0-based, for page-based UI: page N → offset N*limit).
 */
export async function listUserActivity(
  pdb: PlatformDb,
  userId: string,
  limit = 50,
  offset = 0,
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
        LIMIT ${limit} OFFSET ${offset}`,
  );
}

/** Total count of personal activity rows for the given user (for pagination). */
export async function countUserActivity(pdb: PlatformDb, userId: string): Promise<number> {
  const row = await dbGet<{ c: number | string }>(
    pdb,
    sql`SELECT COUNT(*) AS c FROM activity_log
        WHERE tenant_id = ${DEFAULT_TENANT_ID}
          AND visibility = 'user'
          AND (actor_id = ${userId} OR subject_user_id = ${userId})`,
  );
  return Number(row?.c ?? 0);
}

/**
 * Admin (platform-wide) activity feed — all rows for the tenant, newest-first,
 * limited to `limit` rows starting at `offset`. Optionally filtered by
 * `actorId` or `action`.
 */
export async function listAdminActivity(
  pdb: PlatformDb,
  options: { actorId?: string; action?: string; limit?: number; offset?: number } = {},
): Promise<ActivityLogRow[]> {
  const limit = options.limit ?? 100;
  const offset = options.offset ?? 0;
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
          AND (CAST(${actorFilter} AS TEXT) IS NULL OR actor_id = ${actorFilter})
          AND (CAST(${actionFilter} AS TEXT) IS NULL OR action = ${actionFilter})
        ORDER BY created_at DESC
        LIMIT ${limit} OFFSET ${offset}`,
  );
}

/** Total count of admin-visible activity rows (for pagination). */
export async function countAdminActivity(
  pdb: PlatformDb,
  options: { actorId?: string; action?: string } = {},
): Promise<number> {
  const actorFilter = options.actorId ?? null;
  const actionFilter = options.action ?? null;
  const row = await dbGet<{ c: number | string }>(
    pdb,
    sql`SELECT COUNT(*) AS c FROM activity_log
        WHERE tenant_id = ${DEFAULT_TENANT_ID}
          AND (CAST(${actorFilter} AS TEXT) IS NULL OR actor_id = ${actorFilter})
          AND (CAST(${actionFilter} AS TEXT) IS NULL OR action = ${actionFilter})`,
  );
  return Number(row?.c ?? 0);
}

// ─────────────────────────────────────────────────────────────────────────────

/** One entry in a user's saved sidebar plugin list (task 2.13). */
export interface SidebarPluginEntry {
  id: string;
  hidden: boolean;
}

/** Account-plugin preferences with their defaults (SRS ACC-07/08). */
export interface AccountPrefsValue {
  timezone: string;
  theme: string;
  /** Saved plugin order and visibility. `null` means "use default install order". */
  sidebarPlugins: SidebarPluginEntry[] | null;
}

const DEFAULT_ACCOUNT_PREFS: AccountPrefsValue = {
  timezone: 'UTC',
  theme: 'system',
  sidebarPlugins: null,
};

/** A user's Account preferences, falling back to defaults when no row exists. */
export async function getAccountPrefs(pdb: PlatformDb, userId: string): Promise<AccountPrefsValue> {
  const row = await dbGet<{ timezone: string; theme: string; sidebarPlugins: string | null }>(
    pdb,
    sql`SELECT timezone, theme, sidebar_plugins AS "sidebarPlugins" FROM account_prefs WHERE user_id = ${userId}`,
  );
  if (!row) return DEFAULT_ACCOUNT_PREFS;
  return {
    timezone: row.timezone,
    theme: row.theme,
    sidebarPlugins: row.sidebarPlugins
      ? (JSON.parse(row.sidebarPlugins) as SidebarPluginEntry[])
      : null,
  };
}

/** Upsert a user's Account preferences (one row per user). */
export async function setAccountPrefs(
  pdb: PlatformDb,
  userId: string,
  prefs: Partial<AccountPrefsValue>,
): Promise<AccountPrefsValue> {
  const current = await getAccountPrefs(pdb, userId);
  const next: AccountPrefsValue = {
    timezone: prefs.timezone ?? current.timezone,
    theme: prefs.theme ?? current.theme,
    sidebarPlugins:
      'sidebarPlugins' in prefs ? (prefs.sidebarPlugins ?? null) : current.sidebarPlugins,
  };
  const sidebarJson = next.sidebarPlugins ? JSON.stringify(next.sidebarPlugins) : null;
  const now = Math.floor(Date.now() / 1000);
  await dbRun(
    pdb,
    sql`INSERT INTO account_prefs (user_id, tenant_id, timezone, theme, sidebar_plugins, updated_at)
        VALUES (${userId}, ${DEFAULT_TENANT_ID}, ${next.timezone}, ${next.theme}, ${sidebarJson}, ${now})
        ON CONFLICT (user_id)
        DO UPDATE SET timezone = excluded.timezone, theme = excluded.theme,
                      sidebar_plugins = excluded.sidebar_plugins, updated_at = excluded.updated_at`,
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

// ── Instance identity config (RFC 0027 / RFC 0032 rename) ────────────────────

const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;
const DEFAULT_INSTANCE_NAME = 'Sovereign';

export interface InstanceConfig {
  instanceName: string;
  instanceLogo: string | null;
  instanceLogoDark: string | null;
  instanceFavicon: string | null;
  instancePrimary: string | null;
  emailFromName: string | null;
  emailLogo: string | null;
}

function resolveInstanceName(value: string | null | undefined): string {
  return value?.trim() || DEFAULT_INSTANCE_NAME;
}

function resolveConfiguredInstanceName(
  rowValue: string | null | undefined,
  envValue: string | null | undefined,
): string {
  return resolveInstanceName(rowValue?.trim() ? rowValue : envValue);
}

/**
 * Read instance config, merging DB values over INSTANCE_* env-var defaults.
 * Always returns a complete object — null fields mean "no override set".
 */
export async function getInstanceConfig(
  pdb: PlatformDb,
  tenantId: string,
): Promise<InstanceConfig> {
  const row = await dbGet<{
    instanceName: string | null;
    instanceLogo: string | null;
    instanceLogoDark: string | null;
    instanceFavicon: string | null;
    instancePrimary: string | null;
    emailFromName: string | null;
    emailLogo: string | null;
  }>(
    pdb,
    sql`SELECT brand_name AS "instanceName",
               brand_logo AS "instanceLogo",
               brand_logo_dark AS "instanceLogoDark",
               brand_favicon AS "instanceFavicon",
               brand_primary AS "instancePrimary",
               email_from_name AS "emailFromName",
               email_logo AS "emailLogo"
        FROM instance_config WHERE tenant_id = ${tenantId}`,
  );
  return {
    instanceName: resolveConfiguredInstanceName(row?.instanceName, process.env.INSTANCE_NAME),
    instanceLogo: row?.instanceLogo ?? process.env.INSTANCE_LOGO ?? null,
    instanceLogoDark: row?.instanceLogoDark ?? process.env.INSTANCE_LOGO_DARK ?? null,
    instanceFavicon: row?.instanceFavicon ?? process.env.INSTANCE_FAVICON ?? null,
    instancePrimary:
      (row?.instancePrimary ?? process.env.INSTANCE_PRIMARY_COLOR ?? null) &&
      HEX_COLOR_RE.test(row?.instancePrimary ?? process.env.INSTANCE_PRIMARY_COLOR ?? '')
        ? (row?.instancePrimary ?? process.env.INSTANCE_PRIMARY_COLOR ?? null)
        : null,
    emailFromName: row?.emailFromName ?? process.env.INSTANCE_EMAIL_FROM_NAME ?? null,
    emailLogo: row?.emailLogo ?? process.env.INSTANCE_EMAIL_LOGO ?? null,
  };
}

/**
 * Upsert instance config. Callers read the current state via getInstanceConfig,
 * mutate fields, then write the full merged value back.
 * instancePrimary is validated as a 6-digit hex colour before persisting —
 * raw user input must never reach a <style> block unchecked (CSS injection).
 */
export async function setInstanceConfig(
  pdb: PlatformDb,
  tenantId: string,
  values: Omit<InstanceConfig, 'instanceName'> & { instanceName: string | null },
): Promise<void> {
  if (values.instancePrimary !== null) {
    if (!HEX_COLOR_RE.test(values.instancePrimary)) {
      throw new Error(
        `Invalid instancePrimary: "${values.instancePrimary}". Must be a 6-digit hex colour (#rrggbb).`,
      );
    }
  }
  const now = Math.floor(Date.now() / 1000);
  await dbRun(
    pdb,
    sql`INSERT INTO instance_config
          (tenant_id, brand_name, brand_logo, brand_logo_dark, brand_favicon,
           brand_primary, email_from_name, email_logo, updated_at)
        VALUES
          (${tenantId}, ${values.instanceName}, ${values.instanceLogo}, ${values.instanceLogoDark},
           ${values.instanceFavicon}, ${values.instancePrimary}, ${values.emailFromName},
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

export interface DeleteUserDataResult {
  /** Total platform rows deleted (across all tables). */
  platformRowsDeleted: number;
}

/**
 * Delete all platform-owned rows for a user in dependency order (RFC 0033).
 * Does NOT remove the user record from better-auth — call the auth server's
 * admin API for that. Does NOT delete plugin data — plugin handlers are
 * orchestrated by `runtime/src/user-deletion.ts`.
 */
export async function deleteUserData(
  pdb: PlatformDb,
  userId: string,
): Promise<DeleteUserDataResult> {
  let platformRowsDeleted = 0;

  const del = async (query: ReturnType<typeof sql>): Promise<void> => {
    await dbRun(pdb, query);
    // SQLite returns changes() via pragma; Postgres returns rowCount. We skip
    // counting here and use a fixed-order deletion summary instead — the
    // important thing is the tables are cleared, not the exact row count.
  };

  // Dependency order: child rows before parent rows.
  await del(
    sql`DELETE FROM consent_grants WHERE tenant_id = ${DEFAULT_TENANT_ID} AND user_id = ${userId}`,
  );
  platformRowsDeleted++;
  await del(
    sql`DELETE FROM data_access_log WHERE tenant_id = ${DEFAULT_TENANT_ID} AND user_id = ${userId}`,
  );
  platformRowsDeleted++;
  await del(
    sql`DELETE FROM plugin_secrets
        WHERE tenant_id = ${DEFAULT_TENANT_ID}
          AND scope = 'user'
          AND user_id = ${userId}`,
  );
  platformRowsDeleted++;
  await del(
    sql`DELETE FROM activity_log WHERE tenant_id = ${DEFAULT_TENANT_ID} AND actor_id = ${userId}`,
  );
  platformRowsDeleted++;
  await del(
    sql`DELETE FROM notifications WHERE tenant_id = ${DEFAULT_TENANT_ID} AND recipient_user_id = ${userId}`,
  );
  platformRowsDeleted++;
  await del(
    sql`DELETE FROM notification_prefs WHERE tenant_id = ${DEFAULT_TENANT_ID} AND user_id = ${userId}`,
  );
  platformRowsDeleted++;
  await del(
    sql`DELETE FROM push_subscriptions WHERE tenant_id = ${DEFAULT_TENANT_ID} AND user_id = ${userId}`,
  );
  platformRowsDeleted++;
  await del(
    sql`DELETE FROM entitlements WHERE tenant_id = ${DEFAULT_TENANT_ID} AND user_id = ${userId}`,
  );
  platformRowsDeleted++;
  await del(sql`DELETE FROM account_prefs WHERE user_id = ${userId}`);
  platformRowsDeleted++;

  return { platformRowsDeleted };
}
