import { sqliteTimestampMs } from '@sovereignfs/database';
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

/**
 * Core's tables on sqld and a SQLite file. Every table is written twice, here and in
 * `postgres.ts`, and the two are kept a pair by `schema-parity.test.ts`. Change both, then
 * `pnpm --filter core db:generate`.
 */

/**
 * Settings an operator changed in the Console. A row is a saved value; no row means the
 * environment variable, or the built-in default, applies. A secret is stored as the
 * encrypted envelope, with `encrypted` set.
 */
export const instanceSettings = sqliteTable('instance_settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  /** 1 when `value` is an encrypted envelope. A plain integer, so every dialect agrees. */
  encrypted: integer('encrypted').notNull().default(0),
  updatedAt: sqliteTimestampMs('updated_at').notNull(),
  /** The account that saved it, when known. */
  updatedBy: text('updated_by'),
});
