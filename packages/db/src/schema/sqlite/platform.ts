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
  /** JSON-serialised Array<{ id: string; hidden: boolean }>; null = use default order. */
  sidebarPlugins: text('sidebar_plugins'),
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

/**
 * Non-secret email delivery diagnostics (RFC 0062). Stores metadata needed for
 * operator health/audit without raw recipients, message bodies, reset tokens, or invite tokens.
 */
export const emailDeliveryLog = sqliteTable('email_delivery_log', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull(),
  createdAt: integer('created_at').notNull(),
  deliveryClass: text('delivery_class').notNull(),
  templateId: text('template_id').notNull(),
  source: text('source').notNull(),
  recipientUserId: text('recipient_user_id'),
  recipientEmailHash: text('recipient_email_hash'),
  actorUserId: text('actor_user_id'),
  status: text('status').notNull(),
  providerMessageId: text('provider_message_id'),
  errorCode: text('error_code'),
  metadata: text('metadata'),
});

export type AccountPrefs = typeof accountPrefs.$inferSelect;
export type NewAccountPrefs = typeof accountPrefs.$inferInsert;

/**
 * Per-user notification inbox (RFC 0015). Tenant-scoped; mutable lifecycle
 * (read / dismissed by the recipient). Distinct from `activity_log` which is
 * append-only audit trail.
 *
 * Indexes (bootstrap DDL):
 *   (tenant_id, recipient_user_id, created_at DESC) — user inbox feed
 *   (tenant_id, recipient_user_id, read_at)         — unread count
 */
export const notifications = sqliteTable('notifications', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull(),
  recipientUserId: text('recipient_user_id').notNull(),
  /** Plugin id, `'platform'`, or `'admin'`. Set by the runtime, not forgeable by plugins. */
  source: text('source').notNull(),
  /** `'plugin'` | `'platform'` | `'admin'` */
  sourceType: text('source_type').notNull(),
  title: text('title').notNull(),
  body: text('body'),
  /** In-app route the user is taken to when they click the notification. */
  url: text('url'),
  /** Drives mute prefs: `'info'` | `'announcement'` | `'security'` | custom. */
  category: text('category').notNull().default('info'),
  /** Optional `<Icon>` name override. */
  icon: text('icon'),
  /** Unix seconds when the recipient read it; null = unread. */
  readAt: integer('read_at'),
  /** Unix seconds when the recipient dismissed it; null = not dismissed. */
  dismissedAt: integer('dismissed_at'),
  createdAt: integer('created_at').notNull(),
});

/**
 * Per-user notification preferences (RFC 0015).
 * One row per user; upserted on change.
 */
export const notificationPrefs = sqliteTable('notification_prefs', {
  userId: text('user_id').primaryKey(),
  tenantId: text('tenant_id').notNull(),
  /** JSON array of category strings the user has muted, e.g. `["announcement"]`. */
  mutedCategories: text('muted_categories').notNull().default('[]'),
  /** Client poll interval in seconds (15 / 30 / 60). Ignored in SSE mode. */
  pollIntervalSecs: integer('poll_interval_secs').notNull().default(30),
  updatedAt: integer('updated_at').notNull(),
});

/**
 * Browser Web Push subscriptions (RFC 0016). One row per device per user.
 * Endpoint is unique — re-subscription from the same device upserts.
 * Rows are pruned when the push service returns 410 (Gone).
 */
export const pushSubscriptions = sqliteTable('push_subscriptions', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull(),
  userId: text('user_id').notNull(),
  /** The push service endpoint URL (unique per browser/device). */
  endpoint: text('endpoint').notNull().unique(),
  /** ECDH public key (base64url) for payload encryption. */
  p256dh: text('p256dh').notNull(),
  /** HMAC auth secret (base64url). */
  auth: text('auth').notNull(),
  createdAt: integer('created_at').notNull(),
});

/**
 * Plugin entitlements (RFC 0003). Tracks signed licenses imported by users.
 * The runtime middleware gates paid plugin routes by checking for an active,
 * unexpired row here. License tokens are verified offline against the plugin
 * author's Ed25519 public key declared in the manifest.
 */
export const entitlements = sqliteTable('entitlements', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull(),
  /** The user who holds this entitlement. */
  userId: text('user_id').notNull(),
  /** Plugin ID (e.g. `com.acme.myplugin`). */
  pluginId: text('plugin_id').notNull(),
  /** Tier ID (e.g. `"pro"`), or null for single-tier plugins. */
  tierId: text('tier_id'),
  /** `active` — currently valid. `expired` — past `expiresAt`. `cancelled` — revoked. */
  status: text('status').notNull().default('active'),
  /**
   * How the entitlement was acquired: `manual` (license token imported by user),
   * `stripe` (Stripe webhook), `paypal` (PayPal webhook).
   */
  source: text('source').notNull().default('manual'),
  /** The raw signed license token as received from the author's billing service. */
  licenseToken: text('license_token').notNull(),
  /** Unix epoch seconds when the license was issued by the author. */
  issuedAt: integer('issued_at').notNull(),
  /** Unix epoch seconds when the entitlement expires (`null` = perpetual). */
  expiresAt: integer('expires_at'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

/**
 * Per-instance identity config (RFC 0027, Phase 1 / RFC 0032 rename).
 * One row per tenant; upserted via setInstanceConfig(). A null column means
 * "use the env-var default" so the helper always merges over INSTANCE_* env vars.
 */
export const instanceConfig = sqliteTable('instance_config', {
  tenantId: text('tenant_id').notNull().primaryKey(),
  /** Display name of the instance, e.g. "Acme Workspace". Falls back to INSTANCE_NAME env. */
  instanceName: text('brand_name'),
  /** Path-relative URL of the light-theme logo, e.g. `/api/instance/logo`. */
  instanceLogo: text('brand_logo'),
  /** Path-relative URL of the dark-theme logo. Falls back to instanceLogo. */
  instanceLogoDark: text('brand_logo_dark'),
  /** Path-relative URL of the branded favicon. */
  instanceFavicon: text('brand_favicon'),
  /** Validated hex colour overriding --sv-color-accent, e.g. "#3b82f6". */
  instancePrimary: text('brand_primary'),
  /** Sender display name for outbound email, e.g. "Acme Support". */
  emailFromName: text('email_from_name'),
  /** Publicly reachable URL for the instance logo used in HTML email bodies. */
  emailLogo: text('email_logo'),
  updatedAt: integer('updated_at').notNull(),
});

export type Notification = typeof notifications.$inferSelect;
export type NewNotification = typeof notifications.$inferInsert;
export type NotificationPrefs = typeof notificationPrefs.$inferSelect;
export type NewNotificationPrefs = typeof notificationPrefs.$inferInsert;
export type PushSubscription = typeof pushSubscriptions.$inferSelect;
export type NewPushSubscription = typeof pushSubscriptions.$inferInsert;
export type ConsentGrant = typeof consentGrants.$inferSelect;
export type NewConsentGrant = typeof consentGrants.$inferInsert;
export type DataAccessLogEntry = typeof dataAccessLog.$inferSelect;
export type NewDataAccessLogEntry = typeof dataAccessLog.$inferInsert;
export type ActivityLog = typeof activityLog.$inferSelect;
export type NewActivityLog = typeof activityLog.$inferInsert;
export type EmailDeliveryLog = typeof emailDeliveryLog.$inferSelect;
export type NewEmailDeliveryLog = typeof emailDeliveryLog.$inferInsert;
export type Entitlement = typeof entitlements.$inferSelect;
export type NewEntitlement = typeof entitlements.$inferInsert;
export type InstanceConfigRow = typeof instanceConfig.$inferSelect;
export type NewInstanceConfigRow = typeof instanceConfig.$inferInsert;
