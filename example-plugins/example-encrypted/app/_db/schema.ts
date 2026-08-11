import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { blindIndex, encryptedText } from '@sovereignfs/sdk/drizzle';

/**
 * The classification happens HERE, in the schema, where reviewers can see it
 * (RFC 0092). Three deliberate choices this example demonstrates:
 *
 * - `label` is encrypted AND exact-match searchable — it gets a
 *   `blindIndex()` companion. `source` names the encrypted column's JS key.
 * - `body` is encrypted but NOT searchable — no index. Only give a field a
 *   blind index when you genuinely query it by exact match; every index is
 *   a deterministic fingerprint an operator can see repeat.
 * - `createdAt` and the ids stay plaintext on purpose — filter/sort
 *   metadata. Encrypt what's sensitive, not everything.
 *
 * Whether these fields are actually encrypted is the operator's decision
 * (`SOVEREIGN_ENCRYPT_CLASSES`) — this plugin's code is identical either way.
 *
 * Plugins query through this sqlite-core schema on either live dialect; the
 * Postgres twin (`schema.postgres.ts`) exists only for migration generation.
 */
export const encryptedNotes = sqliteTable('example_encrypted_notes', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull(),
  ownerUserId: text('owner_user_id').notNull(),
  /** Encrypted + exact-match searchable (class: sensitive). */
  label: encryptedText('label', { sensitivity: 'sensitive' }),
  labelIdx: blindIndex('label_bidx', { source: 'label' }),
  /** Encrypted, display-only — no index, deliberately. */
  body: encryptedText('body', { sensitivity: 'sensitive' }),
  /** Plaintext metadata — sortable without decrypting anything. */
  createdAt: integer('created_at').notNull(),
});

export type EncryptedNoteRow = typeof encryptedNotes.$inferSelect;
