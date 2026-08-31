import { pgTable, text, bigint } from 'drizzle-orm/pg-core';

/**
 * Postgres migration-generation twin of `schema.ts` — never queried
 * through directly (application code queries the sqlite-core schema on
 * either dialect, per `docs/plugin-database.md`). Plain `text`/`bigint` for
 * every column since this table's application code isn't dialect-aware.
 */
export const wardenSessions = pgTable('warden_sessions', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull(),
  userId: text('user_id').notNull(),
  title: text('title'),
  pinnedAt: bigint('pinned_at', { mode: 'number' }),
  lastActiveAt: bigint('last_active_at', { mode: 'number' }).notNull(),
  createdAt: bigint('created_at', { mode: 'number' }).notNull(),
});

export const wardenMessages = pgTable('warden_messages', {
  id: text('id').primaryKey(),
  sessionId: text('session_id').notNull(),
  role: text('role').notNull(),
  content: text('content').notNull(),
  providerId: text('provider_id'),
  model: text('model').notNull(),
  createdAt: bigint('created_at', { mode: 'number' }).notNull(),
});

export const wardenModelVisibilityOverrides = pgTable('warden_model_visibility_overrides', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull(),
  userId: text('user_id').notNull(),
  modelKey: text('model_key').notNull(),
  createdAt: bigint('created_at', { mode: 'number' }).notNull(),
});

export const wardenUserSettings = pgTable('warden_user_settings', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull(),
  userId: text('user_id').notNull(),
  defaultModelKey: text('default_model_key'),
  createdAt: bigint('created_at', { mode: 'number' }).notNull(),
});
