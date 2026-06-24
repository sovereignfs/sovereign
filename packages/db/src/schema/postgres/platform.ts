import { bigint, boolean, integer, pgTable, primaryKey, text } from 'drizzle-orm/pg-core';

/**
 * Platform schema (Postgres dialect). A 1:1 mirror of `../sqlite/platform.ts` —
 * same table and column names — so the platform data layer is dialect-agnostic
 * (SRS §3.7, NFR-03). A parity test (`./schema-parity.test.ts`) asserts the two
 * dialect schemas stay structurally identical.
 *
 * Dialect mapping vs SQLite:
 * - Timestamps are Unix epoch **seconds** stored as `bigint` (SQLite uses
 *   `integer`). Postgres `INTEGER` is 32-bit and overflows in 2038; `bigint`
 *   avoids the Y2038 cliff. `mode: 'number'` keeps the JS-side type a `number`,
 *   matching SQLite (seconds fit safely within 2^53).
 * - Booleans are native `boolean` (SQLite stores 0/1 via `mode: 'boolean'`).
 *
 * Defaults stay dialect-portable literals; callers supply timestamps.
 */

export const tenants = pgTable('tenants', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  createdAt: bigint('created_at', { mode: 'number' }).notNull(),
  updatedAt: bigint('updated_at', { mode: 'number' }).notNull(),
});

export const users = pgTable('users', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id')
    .notNull()
    .references(() => tenants.id),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').notNull().default(false),
  name: text('name'),
  image: text('image'),
  role: text('role').notNull().default('platform:user'),
  createdAt: bigint('created_at', { mode: 'number' }).notNull(),
  updatedAt: bigint('updated_at', { mode: 'number' }).notNull(),
});

export const sessions = pgTable('sessions', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id),
  token: text('token').notNull().unique(),
  expiresAt: bigint('expires_at', { mode: 'number' }).notNull(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  createdAt: bigint('created_at', { mode: 'number' }).notNull(),
  updatedAt: bigint('updated_at', { mode: 'number' }).notNull(),
});

export const pluginStatus = pgTable('plugin_status', {
  pluginId: text('plugin_id').primaryKey(),
  tenantId: text('tenant_id').notNull(),
  enabled: boolean('enabled').notNull().default(true),
  updatedAt: bigint('updated_at', { mode: 'number' }).notNull(),
});

export const platformSettings = pgTable(
  'platform_settings',
  {
    key: text('key').notNull(),
    tenantId: text('tenant_id').notNull(),
    value: text('value').notNull(),
    updatedAt: bigint('updated_at', { mode: 'number' }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.key, table.tenantId] })],
);

export const accountPrefs = pgTable('account_prefs', {
  userId: text('user_id').primaryKey(),
  tenantId: text('tenant_id').notNull(),
  timezone: text('timezone').notNull().default('UTC'),
  theme: text('theme').notNull().default('system'), // 'system' | 'light' | 'dark'
  /** JSON-serialised Array<{ id: string; hidden: boolean }>; null = use default order. */
  sidebarPlugins: text('sidebar_plugins'),
  updatedAt: bigint('updated_at', { mode: 'number' }).notNull(),
});

export const consentGrants = pgTable('consent_grants', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull(),
  userId: text('user_id').notNull(),
  consumerId: text('consumer_id').notNull(),
  providerId: text('provider_id').notNull(),
  contract: text('contract').notNull(),
  version: integer('version').notNull(),
  grantedAt: bigint('granted_at', { mode: 'number' }).notNull(),
  revokedAt: bigint('revoked_at', { mode: 'number' }),
});

export const dataAccessLog = pgTable('data_access_log', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull(),
  userId: text('user_id').notNull(),
  consumerId: text('consumer_id').notNull(),
  providerId: text('provider_id').notNull(),
  contract: text('contract').notNull(),
  version: integer('version').notNull(),
  accessedAt: bigint('accessed_at', { mode: 'number' }).notNull(),
  rowCount: integer('row_count').notNull(),
});

export const notifications = pgTable('notifications', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull(),
  recipientUserId: text('recipient_user_id').notNull(),
  source: text('source').notNull(),
  sourceType: text('source_type').notNull(),
  title: text('title').notNull(),
  body: text('body'),
  url: text('url'),
  category: text('category').notNull().default('info'),
  icon: text('icon'),
  readAt: bigint('read_at', { mode: 'number' }),
  dismissedAt: bigint('dismissed_at', { mode: 'number' }),
  createdAt: bigint('created_at', { mode: 'number' }).notNull(),
});

export const notificationPrefs = pgTable('notification_prefs', {
  userId: text('user_id').primaryKey(),
  tenantId: text('tenant_id').notNull(),
  mutedCategories: text('muted_categories').notNull().default('[]'),
  pollIntervalSecs: integer('poll_interval_secs').notNull().default(30),
  updatedAt: bigint('updated_at', { mode: 'number' }).notNull(),
});

export const activityLog = pgTable('activity_log', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull(),
  actorId: text('actor_id'),
  actorType: text('actor_type').notNull(),
  action: text('action').notNull(),
  subjectUserId: text('subject_user_id'),
  targetType: text('target_type'),
  targetId: text('target_id'),
  pluginId: text('plugin_id'),
  visibility: text('visibility').notNull(),
  summary: text('summary'),
  metadata: text('metadata'),
  createdAt: bigint('created_at', { mode: 'number' }).notNull(),
});

/** Browser Web Push subscriptions (RFC 0016). Mirror of SQLite schema. */
export const pushSubscriptions = pgTable('push_subscriptions', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull(),
  userId: text('user_id').notNull(),
  endpoint: text('endpoint').notNull().unique(),
  p256dh: text('p256dh').notNull(),
  auth: text('auth').notNull(),
  createdAt: bigint('created_at', { mode: 'number' }).notNull(),
});

/** Plugin entitlements (RFC 0003). Mirror of SQLite schema. */
export const entitlements = pgTable('entitlements', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull(),
  userId: text('user_id').notNull(),
  pluginId: text('plugin_id').notNull(),
  tierId: text('tier_id'),
  status: text('status').notNull().default('active'),
  source: text('source').notNull().default('manual'),
  licenseToken: text('license_token').notNull(),
  issuedAt: bigint('issued_at', { mode: 'number' }).notNull(),
  expiresAt: bigint('expires_at', { mode: 'number' }),
  createdAt: bigint('created_at', { mode: 'number' }).notNull(),
  updatedAt: bigint('updated_at', { mode: 'number' }).notNull(),
});

/** Per-instance identity config (RFC 0027 / RFC 0032 rename). Mirror of SQLite schema. */
export const instanceConfig = pgTable('instance_config', {
  tenantId: text('tenant_id').notNull().primaryKey(),
  instanceName: text('brand_name'),
  instanceLogo: text('brand_logo'),
  instanceLogoDark: text('brand_logo_dark'),
  instanceFavicon: text('brand_favicon'),
  instancePrimary: text('brand_primary'),
  emailFromName: text('email_from_name'),
  emailLogo: text('email_logo'),
  updatedAt: bigint('updated_at', { mode: 'number' }).notNull(),
});
