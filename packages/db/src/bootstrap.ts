import type { Dialect } from './dialect';

/**
 * Interim DDL bootstrap for platform tables, applied with
 * CREATE TABLE IF NOT EXISTS by `bootstrapPlatformDb()` at startup. Replaced by
 * drizzle-kit migrations later (0.5.05+).
 *
 * Must stay in sync with ./schema/{sqlite,postgres}/platform.ts — the Drizzle
 * schemas are the source of truth for shape (a parity test guards that the two
 * dialects match); this DDL only exists because migrations are not wired yet.
 * Statements are pure DDL (no seeding); seed rows are inserted separately with
 * caller-supplied timestamps.
 *
 * Dialect differences: timestamps are `INTEGER` (SQLite) vs `BIGINT` (Postgres,
 * to avoid the 2038 32-bit overflow); booleans are `INTEGER` 0/1 (SQLite) vs
 * native `BOOLEAN` (Postgres).
 */
export function platformBootstrapStatements(dialect: Dialect): readonly string[] {
  const ts = dialect === 'postgres' ? 'BIGINT' : 'INTEGER';
  const bool = dialect === 'postgres' ? 'BOOLEAN' : 'INTEGER';
  const boolTrue = dialect === 'postgres' ? 'TRUE' : '1';

  return [
    `CREATE TABLE IF NOT EXISTS tenants (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      created_at ${ts} NOT NULL,
      updated_at ${ts} NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS plugin_status (
      plugin_id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      enabled ${bool} NOT NULL DEFAULT ${boolTrue},
      updated_at ${ts} NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS platform_settings (
      key TEXT NOT NULL,
      tenant_id TEXT NOT NULL,
      value TEXT NOT NULL,
      updated_at ${ts} NOT NULL,
      PRIMARY KEY (key, tenant_id)
    )`,
    `CREATE TABLE IF NOT EXISTS account_prefs (
      user_id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      timezone TEXT NOT NULL DEFAULT 'UTC',
      theme TEXT NOT NULL DEFAULT 'system',
      updated_at ${ts} NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS consent_grants (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      consumer_id TEXT NOT NULL,
      provider_id TEXT NOT NULL,
      contract TEXT NOT NULL,
      version INTEGER NOT NULL,
      granted_at ${ts} NOT NULL,
      revoked_at ${ts}
    )`,
    `CREATE TABLE IF NOT EXISTS data_access_log (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      consumer_id TEXT NOT NULL,
      provider_id TEXT NOT NULL,
      contract TEXT NOT NULL,
      version INTEGER NOT NULL,
      accessed_at ${ts} NOT NULL,
      row_count INTEGER NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS activity_log (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      actor_id TEXT,
      actor_type TEXT NOT NULL,
      action TEXT NOT NULL,
      subject_user_id TEXT,
      target_type TEXT,
      target_id TEXT,
      plugin_id TEXT,
      visibility TEXT NOT NULL,
      summary TEXT,
      metadata TEXT,
      created_at ${ts} NOT NULL
    )`,
    `CREATE INDEX IF NOT EXISTS activity_log_tenant_created
       ON activity_log (tenant_id, created_at DESC)`,
    `CREATE INDEX IF NOT EXISTS activity_log_actor
       ON activity_log (actor_id)`,
    `CREATE INDEX IF NOT EXISTS activity_log_subject
       ON activity_log (subject_user_id)`,
  ];
}
