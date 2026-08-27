import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

/**
 * Warden's persisted chat (RFC 0063 §3, epic task 22.5). One conversation
 * row per user in this phase — modeled as a real entity (not a bare
 * messages table keyed by userId) so a future multi-thread UI is "add more
 * rows plus a picker," not a migration.
 *
 * Deliberately plain, unencrypted columns — RFC 0063's Alternatives already
 * settled that provider credentials go through `sdk.secrets`/`sdk.connections`,
 * not a new mechanism; conversation content has no equivalent existing
 * mechanism and isn't classified as sensitive here (same posture as any
 * other plugin's free-text user content, e.g. a notes app).
 */
export const wardenConversation = sqliteTable('warden_conversation', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull(),
  userId: text('user_id').notNull(),
  createdAt: integer('created_at').notNull(),
});

export const wardenMessages = sqliteTable('warden_messages', {
  id: text('id').primaryKey(),
  conversationId: text('conversation_id').notNull(),
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

export type WardenConversationRow = typeof wardenConversation.$inferSelect;
export type WardenMessageRow = typeof wardenMessages.$inferSelect;
export type WardenModelVisibilityOverrideRow = typeof wardenModelVisibilityOverrides.$inferSelect;
