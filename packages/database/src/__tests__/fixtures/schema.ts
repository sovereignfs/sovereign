import {
  bigint as pgBigint,
  boolean as pgBoolean,
  index as pgIndex,
  pgTable,
  text as pgText,
} from 'drizzle-orm/pg-core';
import {
  index as sqliteIndex,
  integer,
  sqliteTable,
  text as sqliteText,
} from 'drizzle-orm/sqlite-core';

/** A pair of schemas, written the way a real one is: once per dialect. */
export const sqliteSchema = {
  notes: sqliteTable(
    'notes',
    {
      id: sqliteText('id').primaryKey(),
      title: sqliteText('title').notNull(),
      done: integer('done', { mode: 'boolean' }).notNull().default(false),
      createdAt: integer('created_at').notNull(),
      tag: sqliteText('tag'),
    },
    (table) => [sqliteIndex('notes_created_at_idx').on(table.createdAt)],
  ),
};

export const postgresSchema = {
  notes: pgTable(
    'notes',
    {
      id: pgText('id').primaryKey(),
      title: pgText('title').notNull(),
      done: pgBoolean('done').notNull().default(false),
      createdAt: pgBigint('created_at', { mode: 'number' }).notNull(),
      tag: pgText('tag'),
    },
    (table) => [pgIndex('notes_created_at_idx').on(table.createdAt)],
  ),
};
