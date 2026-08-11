import { bigint, pgTable, text } from 'drizzle-orm/pg-core';

/**
 * Postgres migration-generation twin of `schema.ts` — same tables and column
 * names, plain `text()` for the classified columns (they store ordinary
 * strings; the crypto lives in the app tier). Never queried through, so it
 * needs neither the field-encryption metadata nor the tripwire
 * (docs/plugin-development.md, "Adopting field encryption").
 */
export const encryptedNotes = pgTable('example_encrypted_notes', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull(),
  ownerUserId: text('owner_user_id').notNull(),
  label: text('label'),
  labelIdx: text('label_bidx'),
  body: text('body'),
  createdAt: bigint('created_at', { mode: 'number' }).notNull(),
});
