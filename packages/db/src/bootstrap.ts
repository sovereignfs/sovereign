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
      sidebar_plugins TEXT,
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
    `CREATE TABLE IF NOT EXISTS email_delivery_log (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      created_at ${ts} NOT NULL,
      delivery_class TEXT NOT NULL,
      template_id TEXT NOT NULL,
      source TEXT NOT NULL,
      recipient_user_id TEXT,
      recipient_email_hash TEXT,
      actor_user_id TEXT,
      status TEXT NOT NULL,
      provider_message_id TEXT,
      error_code TEXT,
      metadata TEXT
    )`,
    `CREATE INDEX IF NOT EXISTS email_delivery_log_tenant_created
       ON email_delivery_log (tenant_id, created_at DESC)`,
    `CREATE INDEX IF NOT EXISTS email_delivery_log_status_created
       ON email_delivery_log (status, created_at DESC)`,
    // RFC 0043 — Plugin secret vault. `ciphertext` is encrypted by runtime code;
    // this package stores opaque bytes plus non-secret metadata only.
    `CREATE TABLE IF NOT EXISTS plugin_secrets (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      plugin_id TEXT NOT NULL,
      scope TEXT NOT NULL,
      user_id TEXT,
      label TEXT NOT NULL,
      ciphertext TEXT NOT NULL,
      metadata TEXT,
      created_at ${ts} NOT NULL,
      updated_at ${ts} NOT NULL,
      last_used_at ${ts},
      deleted_at ${ts}
    )`,
    `CREATE INDEX IF NOT EXISTS plugin_secrets_plugin_scope_idx
       ON plugin_secrets (tenant_id, plugin_id, scope, deleted_at)`,
    `CREATE INDEX IF NOT EXISTS plugin_secrets_user_idx
       ON plugin_secrets (tenant_id, user_id, deleted_at)`,
    // RFC 0049 — External connection metadata. Secrets are referenced by id
    // only and stay in `plugin_secrets`.
    `CREATE TABLE IF NOT EXISTS plugin_connections (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      plugin_id TEXT NOT NULL,
      scope TEXT NOT NULL,
      user_id TEXT,
      provider TEXT NOT NULL,
      label TEXT NOT NULL,
      status TEXT NOT NULL,
      secret_ref TEXT,
      metadata TEXT,
      last_checked_at ${ts},
      last_used_at ${ts},
      last_error TEXT,
      created_at ${ts} NOT NULL,
      updated_at ${ts} NOT NULL,
      disconnected_at ${ts}
    )`,
    `CREATE INDEX IF NOT EXISTS plugin_connections_plugin_provider_idx
       ON plugin_connections (tenant_id, plugin_id, provider, status)`,
    `CREATE INDEX IF NOT EXISTS plugin_connections_user_idx
       ON plugin_connections (tenant_id, user_id, status)`,
    // Task 3.27 — Admin-managed external provider configuration.
    // Secret field values are stored through plugin_secrets and referenced here.
    `CREATE TABLE IF NOT EXISTS plugin_provider_configs (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      plugin_id TEXT NOT NULL,
      provider TEXT NOT NULL,
      label TEXT NOT NULL,
      public_config TEXT,
      secret_ref TEXT,
      callback_url TEXT,
      scopes TEXT,
      status TEXT NOT NULL,
      last_checked_at ${ts},
      last_error TEXT,
      created_at ${ts} NOT NULL,
      updated_at ${ts} NOT NULL,
      deleted_at ${ts}
    )`,
    `CREATE INDEX IF NOT EXISTS plugin_provider_configs_active_idx
       ON plugin_provider_configs (tenant_id, plugin_id, provider, deleted_at)`,
    `CREATE INDEX IF NOT EXISTS plugin_provider_configs_plugin_idx
       ON plugin_provider_configs (tenant_id, plugin_id, deleted_at)`,
    // RFC 0015 — Notification Center
    `CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      recipient_user_id TEXT NOT NULL,
      source TEXT NOT NULL,
      source_type TEXT NOT NULL,
      title TEXT NOT NULL,
      body TEXT,
      url TEXT,
      category TEXT NOT NULL DEFAULT 'info',
      icon TEXT,
      read_at ${ts},
      dismissed_at ${ts},
      created_at ${ts} NOT NULL
    )`,
    `CREATE INDEX IF NOT EXISTS notifications_user_feed
       ON notifications (tenant_id, recipient_user_id, created_at DESC)`,
    `CREATE INDEX IF NOT EXISTS notifications_unread
       ON notifications (tenant_id, recipient_user_id, read_at)`,
    `CREATE TABLE IF NOT EXISTS notification_prefs (
      user_id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      muted_categories TEXT NOT NULL DEFAULT '[]',
      poll_interval_secs INTEGER NOT NULL DEFAULT 30,
      updated_at ${ts} NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS push_subscriptions (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      endpoint TEXT NOT NULL UNIQUE,
      p256dh TEXT NOT NULL,
      auth TEXT NOT NULL,
      created_at ${ts} NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS entitlements (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      plugin_id TEXT NOT NULL,
      tier_id TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      source TEXT NOT NULL DEFAULT 'manual',
      license_token TEXT NOT NULL,
      issued_at ${ts} NOT NULL,
      expires_at ${ts},
      created_at ${ts} NOT NULL,
      updated_at ${ts} NOT NULL
    )`,
    `CREATE INDEX IF NOT EXISTS entitlements_user_plugin_idx
       ON entitlements (user_id, plugin_id)`,
    // RFC 0027 / RFC 0032 — instance identity config
    `CREATE TABLE IF NOT EXISTS instance_config (
      tenant_id TEXT NOT NULL PRIMARY KEY,
      brand_name TEXT,
      brand_logo TEXT,
      brand_logo_dark TEXT,
      brand_favicon TEXT,
      brand_primary TEXT,
      email_from_name TEXT,
      email_logo TEXT,
      updated_at ${ts} NOT NULL
    )`,
  ];
}
