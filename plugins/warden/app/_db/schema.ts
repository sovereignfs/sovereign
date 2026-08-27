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

export type WardenConversationRow = typeof wardenConversation.$inferSelect;
export type WardenMessageRow = typeof wardenMessages.$inferSelect;
