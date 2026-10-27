import {
  bigint,
  boolean,
  index,
  integer as pgInteger,
  pgTable,
  text,
  unique,
} from 'drizzle-orm/pg-core';
import { integer, sqliteTable, text as sqliteText } from 'drizzle-orm/sqlite-core';
import { describe, expect, it } from 'vitest';
import { assertSchemaParity, schemaDifferences } from '../testing.js';
import { postgresSchema, sqliteSchema } from './fixtures/schema.js';

describe('schema parity', () => {
  it('finds no difference in a true pair', () => {
    expect(schemaDifferences(sqliteSchema, postgresSchema)).toEqual([]);
    expect(() => assertSchemaParity(sqliteSchema, postgresSchema)).not.toThrow();
  });

  it('fails when a column exists in one dialect only', () => {
    const extra = {
      notes: pgTable('notes', {
        id: text('id').primaryKey(),
        title: text('title').notNull(),
        done: boolean('done').notNull().default(false),
        createdAt: bigint('created_at', { mode: 'number' }).notNull(),
        tag: text('tag'),
        archived: boolean('archived'),
      }),
    };
    expect(schemaDifferences(sqliteSchema, extra)).toContain(
      'table "notes": column "archived" exists in PostgreSQL only',
    );
    expect(() => assertSchemaParity(sqliteSchema, extra)).toThrow(/archived/);
  });

  it('fails when a column is missing from PostgreSQL', () => {
    const missing = {
      notes: pgTable('notes', { id: text('id').primaryKey(), title: text('title').notNull() }),
    };
    const found = schemaDifferences(sqliteSchema, missing);
    expect(found).toContain('table "notes": column "tag" exists in SQLite only');
    expect(found).toContain('table "notes": column "created_at" exists in SQLite only');
  });

  it('fails when a table exists in one dialect only', () => {
    const more = {
      ...sqliteSchema,
      audit: sqliteTable('audit', { id: sqliteText('id').primaryKey() }),
    };
    expect(schemaDifferences(more, postgresSchema)).toEqual([
      'table "audit" exists in SQLite only',
    ]);
    const other = { ...postgresSchema, audit: pgTable('audit', { id: text('id').primaryKey() }) };
    expect(schemaDifferences(sqliteSchema, other)).toEqual([
      'table "audit" exists in PostgreSQL only',
    ]);
  });

  it('fails when the logical type, nullability or primary key differs', () => {
    const changed = {
      notes: pgTable('notes', {
        id: text('id').primaryKey(),
        title: text('title'),
        done: text('done').notNull(),
        createdAt: bigint('created_at', { mode: 'number' }).notNull(),
        tag: text('tag'),
      }),
    };
    const found = schemaDifferences(sqliteSchema, changed);
    expect(found.some((line) => line.includes('column "title" differs'))).toBe(true);
    expect(found.some((line) => line.includes('column "done" differs'))).toBe(true);
  });

  it('accepts a different physical type for the same logical one', () => {
    const a = { t: sqliteTable('t', { at: integer('at').notNull() }) };
    const b = { t: pgTable('t', { at: bigint('at', { mode: 'number' }).notNull() }) };
    expect(schemaDifferences(a, b)).toEqual([]);
    const narrow = { t: pgTable('t', { at: pgInteger('at').notNull() }) };
    expect(schemaDifferences(a, narrow)).toEqual([]);
  });

  it('fails when an index or a unique constraint exists in one dialect only', () => {
    const noIndex = {
      notes: pgTable('notes', {
        id: text('id').primaryKey(),
        title: text('title').notNull(),
        done: boolean('done').notNull().default(false),
        createdAt: bigint('created_at', { mode: 'number' }).notNull(),
        tag: text('tag'),
      }),
    };
    expect(schemaDifferences(sqliteSchema, noIndex)).toContain(
      'table "notes": index "notes_created_at_idx" exists in SQLite only',
    );

    const withUnique = {
      notes: pgTable(
        'notes',
        {
          id: text('id').primaryKey(),
          title: text('title').notNull(),
          done: boolean('done').notNull().default(false),
          createdAt: bigint('created_at', { mode: 'number' }).notNull(),
          tag: text('tag'),
        },
        (t) => [
          index('notes_created_at_idx').on(t.createdAt),
          unique('notes_title_unique').on(t.title),
        ],
      ),
    };
    expect(schemaDifferences(sqliteSchema, withUnique)).toContain(
      'table "notes": unique constraint (title) exists in PostgreSQL only',
    );
  });

  it('flags an identifier PostgreSQL would truncate', () => {
    const long = 'c'.repeat(64);
    const a = { t: sqliteTable('t', { [long]: sqliteText(long) }) };
    const b = { t: pgTable('t', { [long]: text(long) }) };
    expect(schemaDifferences(a, b).some((line) => line.includes('longer than 63 bytes'))).toBe(
      true,
    );
  });
});
