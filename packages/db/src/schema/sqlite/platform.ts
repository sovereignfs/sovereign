import { integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core';

/**
 * Platform schema (SQLite dialect).
 *
 * Conventions (shared with plugin schemas):
 * - IDs are ULIDs stored as `text`.
 * - Timestamps are Unix epoch seconds stored as `integer`.
 * - Booleans are stored as `integer` 0/1 (Drizzle `mode: 'boolean'`).
 * - `tenant_id` is present on all user-scoped tables from day one for future
 *   multi-tenancy, even though v1 is single-tenant (SRS §3.1).
 *
 * Defaults are limited to dialect-portable literals — no SQLite-specific SQL
 * (e.g. `unixepoch()`), so the schema stays dialect-agnostic. Callers supply
 * timestamps.
 */

export const tenants = sqliteTable('tenants', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id')
    .notNull()
    .references(() => tenants.id),
  email: text('email').notNull().unique(),
  emailVerified: integer('email_verified', { mode: 'boolean' }).notNull().default(false),
  name: text('name'),
  image: text('image'),
  role: text('role').notNull().default('platform:user'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

export const sessions = sqliteTable('sessions', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id),
  token: text('token').notNull().unique(),
  expiresAt: integer('expires_at').notNull(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

/**
 * Per-plugin enable/disable state. Rows are only inserted when a plugin is
 * explicitly toggled — absence means enabled (the default). Scoped by
 * tenant_id for future multi-tenancy even though v1 is single-tenant.
 */
export const pluginStatus = sqliteTable('plugin_status', {
  pluginId: text('plugin_id').primaryKey(),
  tenantId: text('tenant_id').notNull(),
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  updatedAt: integer('updated_at').notNull(),
});

/**
 * Key-value platform configuration scoped by tenant (SRS PLT-15). Initial
 * keys: `root_plugin_id` (seeded on first run, PLT-14) and `invite_only`
 * (written by the Console toggle, CON-10).
 */
export const platformSettings = sqliteTable(
  'platform_settings',
  {
    key: text('key').notNull(),
    tenantId: text('tenant_id').notNull(),
    value: text('value').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (table) => [primaryKey({ columns: [table.key, table.tenantId] })],
);

/**
 * Per-user Account-plugin preferences (SRS ACC-07/08, `docs/plugins/account.md`).
 * Plugin-owned (`account_` prefix) but lives in the shared platform schema —
 * the runtime reads/writes it on the plugin's behalf until `sdk.db` lands
 * (Task 0.5.05). One row per user, upserted on any preference change.
 */
export const accountPrefs = sqliteTable('account_prefs', {
  userId: text('user_id').primaryKey(),
  tenantId: text('tenant_id').notNull(),
  timezone: text('timezone').notNull().default('UTC'),
  theme: text('theme').notNull().default('system'), // 'system' | 'light' | 'dark'
  updatedAt: integer('updated_at').notNull(),
});

export type Tenant = typeof tenants.$inferSelect;
export type NewTenant = typeof tenants.$inferInsert;
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;
export type PluginStatus = typeof pluginStatus.$inferSelect;
export type NewPluginStatus = typeof pluginStatus.$inferInsert;
export type PlatformSetting = typeof platformSettings.$inferSelect;
export type NewPlatformSetting = typeof platformSettings.$inferInsert;
/**
 * User consent grants for cross-plugin data sharing (RFC 0002). A grant allows
 * `consumer_id` to read `contract` data from `provider_id` on behalf of `user_id`.
 * Revoked grants set `revoked_at`; active grants have `revoked_at` = null.
 */
export const consentGrants = sqliteTable('consent_grants', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull(),
  userId: text('user_id').notNull(),
  consumerId: text('consumer_id').notNull(),
  providerId: text('provider_id').notNull(),
  contract: text('contract').notNull(),
  version: integer('version').notNull(),
  grantedAt: integer('granted_at').notNull(),
  revokedAt: integer('revoked_at'),
});

/**
 * Immutable audit log for every cross-plugin data access (RFC 0002). Written
 * when a provider resolver is successfully invoked; never deleted.
 */
export const dataAccessLog = sqliteTable('data_access_log', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull(),
  userId: text('user_id').notNull(),
  consumerId: text('consumer_id').notNull(),
  providerId: text('provider_id').notNull(),
  contract: text('contract').notNull(),
  version: integer('version').notNull(),
  accessedAt: integer('accessed_at').notNull(),
  rowCount: integer('row_count').notNull(),
});

/**
 * Platform-wide durable audit log (RFC 0005). Append-only — never updated or
 * deleted by application code. Each row captures one actor performing one
 * action, with a visibility flag that controls whether the event appears in
 * the personal user feed (`'user'`) or only in the admin console feed (`'admin'`).
 *
 * Indexes (created by bootstrap DDL):
 *   (tenant_id, created_at DESC) — feed queries
 *   (actor_id) — filter by actor
 *   (subject_user_id) — personal-feed query (`WHERE subject_user_id = :self OR actor_id = :self`)
 */
export const activityLog = sqliteTable('activity_log', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull(),
  actorId: text('actor_id'),
  actorType: text('actor_type').notNull(), // 'user' | 'system' | 'plugin'
  action: text('action').notNull(),
  subjectUserId: text('subject_user_id'),
  targetType: text('target_type'),
  targetId: text('target_id'),
  pluginId: text('plugin_id'),
  visibility: text('visibility').notNull(), // 'admin' | 'user'
  summary: text('summary'),
  metadata: text('metadata'), // JSON string or null
  createdAt: integer('created_at').notNull(),
});

export type AccountPrefs = typeof accountPrefs.$inferSelect;
export type NewAccountPrefs = typeof accountPrefs.$inferInsert;
export type ConsentGrant = typeof consentGrants.$inferSelect;
export type NewConsentGrant = typeof consentGrants.$inferInsert;
export type DataAccessLogEntry = typeof dataAccessLog.$inferSelect;
export type NewDataAccessLogEntry = typeof dataAccessLog.$inferInsert;
export type ActivityLog = typeof activityLog.$inferSelect;
export type NewActivityLog = typeof activityLog.$inferInsert;
