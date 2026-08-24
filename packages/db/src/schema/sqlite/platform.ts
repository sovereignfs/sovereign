import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';

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
  /** 'everyone' | 'admins' | 'selected_users' | 'selected_groups' | 'disabled' (RFC 0065). */
  accessPolicy: text('access_policy').notNull().default('everyone'),
  /** Only meaningful for selected_users/selected_groups — lets an eligible user self-grant (RFC 0065). */
  selfService: integer('self_service', { mode: 'boolean' }).notNull().default(false),
  updatedAt: integer('updated_at').notNull(),
});

/**
 * Direct per-user plugin access grants (RFC 0065) — used by the `selected_users`
 * access policy and by self-service opt-in. Composite PK — a user holds a grant
 * for a given plugin at most once.
 */
export const pluginAccessUsers = sqliteTable(
  'plugin_access_users',
  {
    tenantId: text('tenant_id').notNull(),
    pluginId: text('plugin_id').notNull(),
    userId: text('user_id').notNull(),
    /** The user themselves for a self-service grant. */
    grantedByUserId: text('granted_by_user_id').notNull(),
    grantedAt: integer('granted_at').notNull(),
  },
  (table) => [primaryKey({ columns: [table.pluginId, table.userId] })],
);

/**
 * Group-based plugin access grants (RFC 0065) — used by the `selected_groups`
 * access policy. Composite PK — a group holds a grant for a given plugin at
 * most once.
 */
export const pluginAccessGroups = sqliteTable(
  'plugin_access_groups',
  {
    tenantId: text('tenant_id').notNull(),
    pluginId: text('plugin_id').notNull(),
    groupId: text('group_id').notNull(),
    grantedByUserId: text('granted_by_user_id').notNull(),
    grantedAt: integer('granted_at').notNull(),
  },
  (table) => [primaryKey({ columns: [table.pluginId, table.groupId] })],
);

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
  textSize: text('text_size').notNull().default('default'), // 'default' | 'large' | 'larger'
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

/**
 * Web Push delivery diagnostics (RFC 0016, epic task 4.6) — mirrors
 * `emailDeliveryLog`'s shape. One row per send attempt (per subscribed
 * device once subscriptions are known; one row for the whole user when a
 * send never reaches a device, e.g. no subscriptions or a muted category).
 * `pushService` stores only the push endpoint's host, never the full
 * per-device capability URL.
 */
export const pushDeliveryLog = sqliteTable('push_delivery_log', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull(),
  createdAt: integer('created_at').notNull(),
  userId: text('user_id').notNull(),
  pushService: text('push_service'),
  status: text('status').notNull(), // 'skipped' | 'sent' | 'failed' | 'pruned'
  errorCode: text('error_code'),
  category: text('category'),
  source: text('source'),
});

/**
 * Plugin-scoped file storage metadata (RFC 0044). Bytes live on disk under
 * `data/plugins/<pluginId>/storage/<id>` (opaque physical filename — the
 * plugin-facing `key` never touches the filesystem, so there is no path
 * traversal surface); this table is the only place `key` is resolved to a
 * physical object.
 */
export const pluginStorageObjects = sqliteTable('plugin_storage_objects', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull(),
  pluginId: text('plugin_id').notNull(),
  ownerUserId: text('owner_user_id'),
  key: text('key').notNull(),
  contentType: text('content_type').notNull(),
  size: integer('size').notNull(),
  checksum: text('checksum').notNull(),
  metadata: text('metadata'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

/**
 * Client-side encryption profile (RFC 0060) — one row per user tracking
 * setup state and algorithm metadata. Never holds the Client Master Key
 * (CMK) itself, plaintext or otherwise — only wrapped copies live in
 * `e2eeRecoveryWrappers`/`e2eeDeviceEnrollments`.
 */
export const e2eeProfiles = sqliteTable(
  'e2ee_profiles',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id').notNull(),
    userId: text('user_id').notNull(),
    status: text('status').notNull().default('active'),
    cmkAlgorithm: text('cmk_algorithm').notNull(),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (table) => [uniqueIndex('e2ee_profiles_tenant_user_idx').on(table.tenantId, table.userId)],
);

/**
 * The CMK wrapped by a key derived (KDF) from the user's recovery secret.
 * One row per user — rotating the recovery secret replaces this row rather
 * than accumulating history.
 */
export const e2eeRecoveryWrappers = sqliteTable(
  'e2ee_recovery_wrappers',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id').notNull(),
    userId: text('user_id').notNull(),
    wrappedCmk: text('wrapped_cmk').notNull(),
    kdfAlgorithm: text('kdf_algorithm').notNull(),
    kdfParams: text('kdf_params').notNull(),
    kdfSalt: text('kdf_salt').notNull(),
    algorithmVersion: text('algorithm_version').notNull(),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (table) => [
    uniqueIndex('e2ee_recovery_wrappers_tenant_user_idx').on(table.tenantId, table.userId),
  ],
);

/**
 * The CMK wrapped by one enrolled device's own key. Many rows per user (one
 * per enrolled device); `revokedAt` marks a removed device without deleting
 * its history.
 */
export const e2eeDeviceEnrollments = sqliteTable('e2ee_device_enrollments', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull(),
  userId: text('user_id').notNull(),
  deviceId: text('device_id').notNull(),
  deviceLabel: text('device_label'),
  wrappedCmk: text('wrapped_cmk').notNull(),
  algorithmVersion: text('algorithm_version').notNull(),
  createdAt: integer('created_at').notNull(),
  lastUsedAt: integer('last_used_at'),
  revokedAt: integer('revoked_at'),
});

/**
 * Platform-managed vault for runtime-created plugin secrets (RFC 0043).
 * `ciphertext` is opaque encrypted material; `metadata` is JSON without secret values.
 */
export const pluginSecrets = sqliteTable('plugin_secrets', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull(),
  pluginId: text('plugin_id').notNull(),
  scope: text('scope').notNull(),
  userId: text('user_id'),
  label: text('label').notNull(),
  ciphertext: text('ciphertext').notNull(),
  metadata: text('metadata'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
  lastUsedAt: integer('last_used_at'),
  deletedAt: integer('deleted_at'),
});

/**
 * Platform-owned metadata for plugin-managed external service connections
 * (RFC 0049). Credential material lives in `plugin_secrets`; this table stores
 * only labels, status, provider IDs, sanitized metadata, and secret references.
 */
export const pluginConnections = sqliteTable('plugin_connections', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull(),
  pluginId: text('plugin_id').notNull(),
  scope: text('scope').notNull(),
  userId: text('user_id'),
  provider: text('provider').notNull(),
  label: text('label').notNull(),
  status: text('status').notNull(),
  secretRef: text('secret_ref'),
  metadata: text('metadata'),
  lastCheckedAt: integer('last_checked_at'),
  lastUsedAt: integer('last_used_at'),
  lastError: text('last_error'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
  disconnectedAt: integer('disconnected_at'),
});

/**
 * Instance-level external provider configuration managed by admins (Task 3.27).
 * Secret field values live in `plugin_secrets`; this table stores non-secret
 * public values, callback/scopes metadata, status, and the vault reference.
 */
export const pluginProviderConfigs = sqliteTable('plugin_provider_configs', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull(),
  pluginId: text('plugin_id').notNull(),
  provider: text('provider').notNull(),
  label: text('label').notNull(),
  publicConfig: text('public_config'),
  secretRef: text('secret_ref'),
  callbackUrl: text('callback_url'),
  scopes: text('scopes'),
  status: text('status').notNull(),
  lastCheckedAt: integer('last_checked_at'),
  lastError: text('last_error'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
  deletedAt: integer('deleted_at'),
});

export type AccountPrefs = typeof accountPrefs.$inferSelect;
export type NewAccountPrefs = typeof accountPrefs.$inferInsert;

/**
 * Platform-managed user groups (RFC 0065) — reusable admin-defined audiences for
 * plugin access policies and future operator workflows. Groups are platform
 * audiences, not plugin-domain roles (RFC 0054) or plugin-scoped grants.
 */
export const userGroups = sqliteTable('user_groups', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull(),
  name: text('name').notNull(),
  slug: text('slug').notNull(),
  description: text('description'),
  createdByUserId: text('created_by_user_id').notNull(),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

/** Membership rows for `user_groups`. Composite PK — a user belongs to a group at most once. */
export const userGroupMembers = sqliteTable(
  'user_group_members',
  {
    tenantId: text('tenant_id').notNull(),
    groupId: text('group_id').notNull(),
    userId: text('user_id').notNull(),
    addedByUserId: text('added_by_user_id').notNull(),
    addedAt: integer('added_at').notNull(),
  },
  (table) => [primaryKey({ columns: [table.groupId, table.userId] })],
);

export type UserGroup = typeof userGroups.$inferSelect;
export type NewUserGroup = typeof userGroups.$inferInsert;
export type UserGroupMember = typeof userGroupMembers.$inferSelect;
export type NewUserGroupMember = typeof userGroupMembers.$inferInsert;

/**
 * Per-user capability grants (RFC 0070) — an allowlisted capability granted to
 * one user on top of their role preset. Composite PK — a user holds a given
 * grantable capability at most once.
 */
export const userCapabilityGrants = sqliteTable(
  'user_capability_grants',
  {
    tenantId: text('tenant_id').notNull(),
    userId: text('user_id').notNull(),
    capability: text('capability').notNull(),
    grantedByUserId: text('granted_by_user_id').notNull(),
    grantedAt: integer('granted_at').notNull(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.capability] })],
);

export type UserCapabilityGrant = typeof userCapabilityGrants.$inferSelect;
export type NewUserCapabilityGrant = typeof userCapabilityGrants.$inferInsert;

/**
 * Per-user, per-plugin, per-capability device-bridge consent grants (RFC
 * 0083, workstream 0003 leg 2). Mirrors `user_capability_grants`'s shape
 * (compound primary key, hard delete on revoke), not `consent_grants`'s
 * (single `id` PK, soft-delete via `revoked_at`) — RFC 0083's own open
 * question 1 leans "reuse the *pattern*, not the table," since the subject
 * here is a device capability the user granted a specific plugin, not a
 * cross-plugin data contract. `plugin_id` is self-declared by the calling
 * plugin's own client-side code (device-client.ts is browser-only, so
 * there is no server-injected `x-sovereign-plugin-id` header to trust here)
 * — this table is therefore review-time/consent-prompt bookkeeping for
 * Account UI transparency and revocation, not an enforcement boundary. See
 * RFC 0083 §5 and `docs/architecture-rules.md`.
 */
export const deviceConsentGrants = sqliteTable(
  'device_consent_grants',
  {
    tenantId: text('tenant_id').notNull(),
    userId: text('user_id').notNull(),
    pluginId: text('plugin_id').notNull(),
    capability: text('capability').notNull(),
    grantedAt: integer('granted_at').notNull(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.pluginId, table.capability] })],
);

export type DeviceConsentGrant = typeof deviceConsentGrants.$inferSelect;
export type NewDeviceConsentGrant = typeof deviceConsentGrants.$inferInsert;

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
 * Native mobile (APNs/FCM) device tokens (RFC 0087, workstream 0005 leg 1).
 * Structurally distinct from `push_subscriptions` — a `deviceToken` is not a
 * `PushSubscription` shape, and delivery goes through the Sovereign Relay
 * (`apps/relay`), not directly to a push service.
 *
 * `relayUrl` is captured from the instance's Console-configured relay
 * setting **at registration time** and stored on the row itself, not read
 * fresh from config at send time — see RFC 0087's "Device-token schema"
 * section: changing the configured relay must not silently break
 * already-registered devices before they re-register.
 */
export const pushDeviceTokens = sqliteTable('push_device_tokens', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull(),
  userId: text('user_id').notNull(),
  /** `'ios' | 'android' | 'macos' | 'windows'` — see RFC 0087's "Desktop
   *  native push" addendum for the latter two. */
  platform: text('platform').notNull(),
  /** The raw APNs device token, FCM registration token, or (for
   *  `'windows'`) the WNS channel URI itself — see RFC 0087's addendum for
   *  why WNS has no separate opaque-token concept. */
  deviceToken: text('device_token').notNull().unique(),
  /** Base64-encoded device public key (ECDH P-256) — the encryption target. */
  publicKey: text('public_key').notNull(),
  /** The relay this token was registered against — see doc comment above. */
  relayUrl: text('relay_url').notNull(),
  createdAt: integer('created_at').notNull(),
  /** Unix seconds of the last successful delivery to this token; null until then. */
  lastUsedAt: integer('last_used_at'),
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
  /** Corner-radius intensity preset overriding --sv-radius-scale (RFC 0077). One of 'none' | 'xs' | 's' | 'm' | 'l'. */
  instanceRadius: text('brand_radius'),
  /** Theme preset overriding the design system's full token bundle (RFC 0094/0095). One of 'default' | 'neobrutalism'. Null = 'default'. */
  instanceThemePreset: text('brand_theme_preset'),
  /** Sender display name for outbound email, e.g. "Acme Support". */
  emailFromName: text('email_from_name'),
  /** Publicly reachable URL for the instance logo used in HTML email bodies. */
  emailLogo: text('email_logo'),
  updatedAt: integer('updated_at').notNull(),
});

/**
 * Wrapped field-encryption keys (RFC 0092, epic task 8.31). One row per
 * (sensitivity class × plugin): a Data Encryption Key and a blind-index HMAC
 * key, each wrapped under `SOVEREIGN_FIELD_KEK` (`svfk1:` envelopes — see
 * `../../field-encryption.ts`). Key material is never stored unwrapped;
 * `kek_fingerprint` (non-secret sha256 prefix) records which KEK wraps the
 * row so `sv keys rotate-field-kek` can resume an interrupted rotation.
 */
export const fieldEncryptionKeys = sqliteTable(
  'field_encryption_keys',
  {
    id: text('id').primaryKey(),
    pluginId: text('plugin_id').notNull(),
    /** Sensitivity class (`pii`, `health`, …) — enum enforced at the SDK layer (task 8.32). */
    class: text('class').notNull(),
    wrappedDek: text('wrapped_dek').notNull(),
    wrappedHmacKey: text('wrapped_hmac_key').notNull(),
    /**
     * The outgoing HMAC key during a blind-index rotation window (RFC 0092
     * gate B). Non-null iff a rotation is in progress; queries dual-read
     * old+new until the re-seal completes and clears it.
     */
    wrappedHmacKeyPrevious: text('wrapped_hmac_key_previous'),
    /** Unix seconds when the current rotation window opened; null when none. */
    hmacRotationStartedAt: integer('hmac_rotation_started_at'),
    kekFingerprint: text('kek_fingerprint').notNull(),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (table) => [
    uniqueIndex('field_encryption_keys_plugin_class_idx').on(table.pluginId, table.class),
  ],
);

/**
 * Persisted classified-table registrations (RFC 0092 gate B). Written by
 * `sdk.crypto.registerTables()` from the runtime (idempotent upsert); read by
 * the CLI re-seal walker (`sv db encrypt-fields`, `sv keys
 * rotate-blind-index`), which runs in a separate process where plugin code
 * is not loaded — persistence is what makes operator tooling independent of
 * lazy plugin module loading. `metadata` is JSON: pk columns + classified
 * column descriptors (name, kind, class, blind-index source).
 */
export const fieldTableRegistrations = sqliteTable(
  'field_table_registrations',
  {
    id: text('id').primaryKey(),
    pluginId: text('plugin_id').notNull(),
    tableName: text('table_name').notNull(),
    metadata: text('metadata').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (table) => [
    uniqueIndex('field_table_registrations_plugin_table_idx').on(table.pluginId, table.tableName),
  ],
);

/**
 * Re-seal walker checkpoints (RFC 0092 gate B) — one row per
 * (job × plugin × table), holding the last processed primary key so an
 * interrupted `sv db encrypt-fields` / `sv keys rotate-blind-index` run
 * resumes instead of restarting. Deleted when the table completes.
 */
export const fieldResealCheckpoints = sqliteTable(
  'field_reseal_checkpoints',
  {
    id: text('id').primaryKey(),
    /** `backfill` or `rotate-index`. */
    job: text('job').notNull(),
    pluginId: text('plugin_id').notNull(),
    tableName: text('table_name').notNull(),
    lastPk: text('last_pk').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (table) => [
    uniqueIndex('field_reseal_checkpoints_job_table_idx').on(
      table.job,
      table.pluginId,
      table.tableName,
    ),
  ],
);

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
export type PushDeliveryLog = typeof pushDeliveryLog.$inferSelect;
export type NewPushDeliveryLog = typeof pushDeliveryLog.$inferInsert;
export type PluginStorageObject = typeof pluginStorageObjects.$inferSelect;
export type NewPluginStorageObject = typeof pluginStorageObjects.$inferInsert;
export type E2eeProfile = typeof e2eeProfiles.$inferSelect;
export type NewE2eeProfile = typeof e2eeProfiles.$inferInsert;
export type E2eeRecoveryWrapper = typeof e2eeRecoveryWrappers.$inferSelect;
export type NewE2eeRecoveryWrapper = typeof e2eeRecoveryWrappers.$inferInsert;
export type E2eeDeviceEnrollment = typeof e2eeDeviceEnrollments.$inferSelect;
export type NewE2eeDeviceEnrollment = typeof e2eeDeviceEnrollments.$inferInsert;
export type PluginSecret = typeof pluginSecrets.$inferSelect;
export type NewPluginSecret = typeof pluginSecrets.$inferInsert;
export type PluginConnection = typeof pluginConnections.$inferSelect;
export type NewPluginConnection = typeof pluginConnections.$inferInsert;
export type PluginProviderConfig = typeof pluginProviderConfigs.$inferSelect;
export type NewPluginProviderConfig = typeof pluginProviderConfigs.$inferInsert;
export type Entitlement = typeof entitlements.$inferSelect;
export type NewEntitlement = typeof entitlements.$inferInsert;
export type InstanceConfigRow = typeof instanceConfig.$inferSelect;
export type NewInstanceConfigRow = typeof instanceConfig.$inferInsert;
export type FieldEncryptionKey = typeof fieldEncryptionKeys.$inferSelect;
export type NewFieldEncryptionKey = typeof fieldEncryptionKeys.$inferInsert;
export type FieldTableRegistration = typeof fieldTableRegistrations.$inferSelect;
export type NewFieldTableRegistration = typeof fieldTableRegistrations.$inferInsert;
export type FieldResealCheckpoint = typeof fieldResealCheckpoints.$inferSelect;
export type NewFieldResealCheckpoint = typeof fieldResealCheckpoints.$inferInsert;

/**
 * Webhook replay-protection claims (RFC 0050). One row per
 * (plugin × provider × event) the platform has seen — `sdk.webhooks.checkReplay()`
 * atomically claims a row via `INSERT ... ON CONFLICT DO NOTHING`; a
 * conflict means the event was already processed. `expires_at` bounds how
 * long a claim blocks reprocessing — a row past its expiry is deleted (not
 * reused in place) before a fresh claim attempt, so an old, expired event id
 * can be legitimately reprocessed rather than permanently blocked.
 */
export const webhookReplays = sqliteTable(
  'webhook_replays',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id').notNull(),
    pluginId: text('plugin_id').notNull(),
    provider: text('provider').notNull(),
    eventId: text('event_id').notNull(),
    receivedAt: integer('received_at').notNull(),
    expiresAt: integer('expires_at').notNull(),
  },
  (table) => [
    uniqueIndex('webhook_replays_plugin_provider_event_idx').on(
      table.pluginId,
      table.provider,
      table.eventId,
    ),
  ],
);

export type WebhookReplay = typeof webhookReplays.$inferSelect;
export type NewWebhookReplay = typeof webhookReplays.$inferInsert;

/**
 * Plugin flow handoffs (RFC 0053). One row per handoff a source plugin
 * created for a provider plugin to consume — the payload lives here
 * server-side (the RFC's own stated preference over embedding it in the
 * signed token); the token itself carries only this row's `id`.
 *
 * `consumed_at` is the single-use claim: `consumePluginHandoff()` sets it
 * atomically via `UPDATE ... WHERE consumed_at IS NULL RETURNING`, the same
 * idiom `checkWebhookReplay` above uses for its own atomic claim. A
 * non-single-use handoff (`single_use = false`) is never claimed this way —
 * it may be consumed more than once within its expiry window, per RFC
 * 0053's "optionally single-use."
 */
export const pluginHandoffs = sqliteTable('plugin_handoffs', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull(),
  sourcePluginId: text('source_plugin_id').notNull(),
  providerId: text('provider_id').notNull(),
  name: text('name').notNull(),
  mode: text('mode').notNull(), // 'authenticated' | 'public'
  actorUserId: text('actor_user_id'),
  payload: text('payload').notNull(), // JSON-encoded
  returnUrl: text('return_url'),
  singleUse: integer('single_use', { mode: 'boolean' }).notNull(),
  consumedAt: integer('consumed_at'),
  createdAt: integer('created_at').notNull(),
  expiresAt: integer('expires_at').notNull(),
});

export type PluginHandoff = typeof pluginHandoffs.$inferSelect;
export type NewPluginHandoff = typeof pluginHandoffs.$inferInsert;

/**
 * Platform-managed background jobs and schedules (RFC 0046). Full
 * queued/scheduled/running/succeeded/failed/cancelled lifecycle — distinct
 * from the RFC 0046 "Phase 1 subset" manifest `schedules` field (interval-only,
 * no persistence, see `runtime/src/scheduler.ts`), which this table does not
 * replace; the two mechanisms coexist (see `docs/rfcs/0046-plugin-jobs.md`).
 * `type` is plugin-local (e.g. `"sync.remote"`) — the runtime namespaces it to
 * `<pluginId>:<type>` when resolving a handler, never stored pre-namespaced.
 * `run_at` doubles as "next eligible run" for both one-off and recurring
 * (`cron` non-null) rows. `progress`/`progress_message` let long-running
 * handlers report status without a request staying open.
 */
export const pluginJobs = sqliteTable(
  'plugin_jobs',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id').notNull(),
    pluginId: text('plugin_id').notNull(),
    type: text('type').notNull(),
    status: text('status').notNull(),
    payload: text('payload'),
    runAt: integer('run_at').notNull(),
    cron: text('cron'),
    timezone: text('timezone'),
    dedupeKey: text('dedupe_key'),
    attempts: integer('attempts').notNull().default(0),
    maxAttempts: integer('max_attempts').notNull().default(3),
    lastError: text('last_error'),
    progress: integer('progress'),
    progressMessage: text('progress_message'),
    createdBy: text('created_by'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
    startedAt: integer('started_at'),
    completedAt: integer('completed_at'),
    cancelledAt: integer('cancelled_at'),
  },
  (table) => [
    index('plugin_jobs_status_run_at_idx').on(table.status, table.runAt),
    index('plugin_jobs_plugin_dedupe_idx').on(table.pluginId, table.dedupeKey),
  ],
);

export type PluginJob = typeof pluginJobs.$inferSelect;
export type NewPluginJob = typeof pluginJobs.$inferInsert;

/**
 * Platform-owned backup job records (RFC 0084, epic task 8.16). Tenant-scoped;
 * `scope` distinguishes instance-level (`'instance'`) from user-level (`'user'`)
 * backups. `status` tracks queued → running → complete/failed lifecycle;
 * `optionsJson` holds CLI flags (e.g. `--exclude-plugin`); `archivePath` is the
 * absolute filesystem path to the archive (matches `bin/helpers.ts`'s
 * `<workspace root>/backups/sovereign-backup-...` — deliberately not under
 * `data/`, which is the SQLite/avatar volume, not the backups one); `sizeBytes`
 * is the physical archive size; `errorMessage` holds the failure reason if
 * `status = 'failed'`. `expiresAt` bounds how long an archive file survives
 * before the worker sweeps it. The worker claims jobs via
 * `UPDATE ... WHERE status = 'queued' RETURNING` and marks `complete`/`failed`
 * with timestamps; expired jobs' archives are removed from disk.
 */
export const backupJobs = sqliteTable(
  'backup_jobs',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id').notNull(),
    scope: text('scope').notNull(), // 'instance' | 'user'
    requestedByUserId: text('requested_by_user_id'),
    status: text('status').notNull(), // 'queued' | 'running' | 'complete' | 'failed'
    optionsJson: text('options_json'),
    archivePath: text('archive_path').notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    errorMessage: text('error_message'),
    createdAt: integer('created_at').notNull(),
    startedAt: integer('started_at'),
    completedAt: integer('completed_at'),
    expiresAt: integer('expires_at').notNull(),
  },
  (table) => [
    index('backup_jobs_status_idx').on(table.status),
    index('backup_jobs_tenant_scope_idx').on(table.tenantId, table.scope),
  ],
);

export type BackupJob = typeof backupJobs.$inferSelect;
export type NewBackupJob = typeof backupJobs.$inferInsert;
