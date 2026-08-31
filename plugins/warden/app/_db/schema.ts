import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

/**
 * Warden's persisted chat (RFC 0063 §3/§10, epic task 22.8). Multiple named,
 * pinnable sessions per user — replaces the phase-1 `warden_conversation`
 * table's "exactly one row per user" invariant with a real multi-row
 * entity. This is a clean-slate replacement, not an in-place migration: per
 * direct developer instruction, existing `warden_conversation` rows are not
 * carried forward (see the migration itself and workstream 0021's Decisions
 * locked) — negligible real usage exists this early to be worth backfilling
 * synthetic `title`/`lastActiveAt` values for.
 *
 * Deliberately plain, unencrypted columns — RFC 0063's Alternatives already
 * settled that provider credentials go through `sdk.secrets`/`sdk.connections`,
 * not a new mechanism; conversation content has no equivalent existing
 * mechanism and isn't classified as sensitive here (same posture as any
 * other plugin's free-text user content, e.g. a notes app).
 */
export const wardenSessions = sqliteTable('warden_sessions', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull(),
  userId: text('user_id').notNull(),
  // Null until an LLM-generated title lands after the first exchange, or
  // the user renames the session manually — see _lib/sessions.ts.
  title: text('title'),
  // Null = unpinned. Non-null = pinned, and sorts the pinned group (most
  // recently pinned first) — see _lib/sessions.ts's pin-cap enforcement.
  pinnedAt: integer('pinned_at'),
  // Bumped only when a message is actually sent in this session — never on
  // merely opening/viewing it. The sidebar's "recent" sort key.
  lastActiveAt: integer('last_active_at').notNull(),
  createdAt: integer('created_at').notNull(),
});

export const wardenMessages = sqliteTable('warden_messages', {
  id: text('id').primaryKey(),
  sessionId: text('session_id').notNull(),
  role: text('role').notNull(), // 'user' | 'assistant'
  content: text('content').notNull(),
  // The sdk.connections id that answered this message, or null for the
  // local apps/harness model. Not a DB foreign key — connections live in
  // the platform-owned plugin_connections table, a separate mechanism.
  providerId: text('provider_id'),
  model: text('model').notNull(),
  createdAt: integer('created_at').notNull(),
});

/**
 * Per-user model visibility (provider/model curation). Every model key has
 * a *computed default* — `isVisibleByDefault()` in `model-visibility.ts`
 * (currently: `'local'` is visible by default, every provider-sourced model
 * is hidden by default, since a single provider's catalog can easily run
 * into the hundreds). A row here means "flip this key away from its own
 * computed default for this user" — for `'local'` a row means hidden, for a
 * provider model a row means shown. This keeps the table an exceptions-only
 * table either way: a newly discovered model (a provider just added, or an
 * existing provider's catalog grew) needs zero bookkeeping, since its
 * default already applies until a user explicitly overrides it.
 *
 * `modelKey` matches `DiscoveredModel.key` from `model-discovery.ts` exactly
 * (`'local'`, or `${providerId}:${modelId}`) — reusing that format means
 * overriding never needs to parse or reconstruct a provider/model pair.
 */
export const wardenModelVisibilityOverrides = sqliteTable('warden_model_visibility_overrides', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull(),
  userId: text('user_id').notNull(),
  modelKey: text('model_key').notNull(),
  createdAt: integer('created_at').notNull(),
});

/**
 * Per-user Warden preferences (RFC 0063 §11, epic task 22.9) — currently
 * just the default model for a brand-new session. One row per user,
 * get-or-create like the old single-conversation table used to be;
 * `defaultModelKey` is nullable — no row (or a null value) means "no
 * explicit default, fall back to the first visible model."
 */
export const wardenUserSettings = sqliteTable('warden_user_settings', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull(),
  userId: text('user_id').notNull(),
  defaultModelKey: text('default_model_key'),
  createdAt: integer('created_at').notNull(),
});

export type WardenSessionRow = typeof wardenSessions.$inferSelect;
export type WardenMessageRow = typeof wardenMessages.$inferSelect;
export type WardenModelVisibilityOverrideRow = typeof wardenModelVisibilityOverrides.$inferSelect;
export type WardenUserSettingsRow = typeof wardenUserSettings.$inferSelect;
