import { postgresTimestampMs } from '@sovereignfs/database';
import { integer, pgTable, text } from 'drizzle-orm/pg-core';

/** The PostgreSQL half of the pair in `sqlite.ts`; see there. */

export const instanceSettings = pgTable('instance_settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  encrypted: integer('encrypted').notNull().default(0),
  updatedAt: postgresTimestampMs('updated_at').notNull(),
  updatedBy: text('updated_by'),
});
