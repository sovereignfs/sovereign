/**
 * The database interface against a real database: the one the CI leg started
 * (SV_DB_DIALECT, with its URL variables). The same assertions run on sqld, a SQLite
 * file and PostgreSQL, which is the point: the interface behaves the same on all three.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MigrationError, migrate, readMigrations } from '../index.js';
import type { Database, Migration } from '../index.js';
import { postgresSchema, sqliteSchema } from './fixtures/schema.js';
import { createTestDatabase, testDialect as dialect } from '../testing.js';
import type { TestDatabase } from '../testing.js';

const DIALECTS = ['sqld', 'sqlite', 'postgres'];

it('SV_DB_DIALECT names a supported dialect', () => {
  expect(DIALECTS, 'SV_DB_DIALECT must be one of these').toContain(dialect);
});

const here = path.dirname(fileURLToPath(import.meta.url));
const folder = path.join(
  here,
  'fixtures/migrations',
  dialect === 'postgres' ? 'postgres' : 'sqlite',
);
const MS = 1_761_580_000_123; // a 13-digit millisecond timestamp, which overflows a 32-bit integer

describe.skipIf(!DIALECTS.includes(dialect ?? ''))(`the database interface (${dialect})`, () => {
  let target: TestDatabase;
  let db: Database;
  const opened: Database[] = [];

  async function open(): Promise<Database> {
    const database = await target.open();
    opened.push(database);
    return database;
  }

  beforeAll(async () => {
    target = await createTestDatabase();
    db = await open();
  });

  afterAll(async () => {
    for (const database of opened) await database.close().catch(() => undefined);
    await target.cleanup();
  });

  describe('connection', () => {
    it('is the dialect it was asked for', () => {
      expect(db.dialect).toBe(dialect);
      expect(db.family).toBe(dialect === 'postgres' ? 'postgres' : 'sqlite');
    });

    it('answers a ping', async () => {
      await expect(db.ping()).resolves.toBeUndefined();
    });
  });

  describe('run', () => {
    it('returns plain rows, binds ? placeholders and keeps a ? inside a string', async () => {
      const { rows } = await db.run(
        "select cast(? as integer) as a, cast(? as text) as b, '?' as c",
        [1, 'two'],
      );
      expect(rows).toEqual([{ a: 1, b: 'two', c: '?' }]);
    });

    it('returns integers as numbers, count(*) and bigint included', async () => {
      const { rows } = await db.run('select count(*) as n');
      expect(rows[0]?.n).toBe(1);
      expect(typeof rows[0]?.n).toBe('number');
    });

    it('throws for an integer too large to be exact, instead of losing digits', async () => {
      await expect(db.run('select 9007199254740993 as big')).rejects.toThrow();
    });

    it('is async everywhere: a rejected statement rejects the promise', async () => {
      await expect(db.run('select * from no_such_table')).rejects.toThrow();
    });
  });

  describe('transactions', () => {
    beforeAll(async () => {
      await db.run('create table tx_probe (id integer primary key, value text not null)');
    });

    it('commits when the function returns', async () => {
      await db.transaction(async (tx) => {
        await tx.run('insert into tx_probe (id, value) values (?, ?)', [1, 'kept']);
      });
      expect((await db.run('select value from tx_probe where id = 1')).rows).toEqual([
        { value: 'kept' },
      ]);
    });

    it('rolls back when the function throws, and rethrows', async () => {
      await expect(
        db.transaction(async (tx) => {
          await tx.run('insert into tx_probe (id, value) values (?, ?)', [2, 'discarded']);
          throw new Error('boom');
        }),
      ).rejects.toThrow('boom');
      expect((await db.run('select id from tx_probe where id = 2')).rows).toEqual([]);
    });

    it('rolls back everything when a later statement fails', async () => {
      await expect(
        db.transaction(async (tx) => {
          await tx.run('insert into tx_probe (id, value) values (?, ?)', [3, 'discarded']);
          await tx.run('insert into tx_probe (id, value) values (?, ?)', [3, 'duplicate key']);
        }),
      ).rejects.toThrow();
      expect((await db.run('select id from tx_probe where id = 3')).rows).toEqual([]);
    });
  });

  describe('using the database inside a transaction or session', () => {
    it('fails the same way on every dialect, instead of using another connection or hanging', async () => {
      await expect(db.transaction(() => db.run('select 1'))).rejects.toThrow(
        /use the executor the callback is given/,
      );
      await expect(db.session(() => db.run('select 1'))).rejects.toThrow(
        /use the executor the callback is given/,
      );
      await expect(
        db.transaction((tx) => db.transaction(() => tx.run('select 1'))),
      ).rejects.toThrow(/use the executor/);
    });

    it('still works afterwards', async () => {
      await expect(db.run('select 1 as one')).resolves.toMatchObject({ rows: [{ one: 1 }] });
    });
  });

  describe.skipIf(dialect !== 'postgres')('a session (one pinned connection)', () => {
    it('keeps a session-scoped advisory lock on its own connection', async () => {
      const postgres = db;
      if (postgres.family !== 'postgres') return;
      const key = 9_100_001;
      const tryLock = async () =>
        (await postgres.pool.query('select pg_try_advisory_lock($1::bigint) as got', [key]))
          .rows[0] as {
          got: boolean;
        };
      await db.session(async (holder) => {
        await holder.run('select pg_advisory_lock(?::bigint)', [key]);
        try {
          // Another connection cannot take it while this one holds it.
          expect((await tryLock()).got).toBe(false);
        } finally {
          await holder.run('select pg_advisory_unlock(?::bigint)', [key]);
        }
      });
      // Released, so the next connection can take it (and gives it back).
      expect((await tryLock()).got).toBe(true);
      await postgres.pool.query('select pg_advisory_unlock_all()');
    });
  });

  describe('migrations', () => {
    const migrations = () => readMigrations(folder);

    it('applies from empty, in order, and records what ran', async () => {
      const fresh = await createTestDatabase();
      const database = await fresh.open();
      try {
        const result = await migrate(database, migrations());
        expect(result.applied).toEqual(['0000_create_notes', '0001_add_note_tag']);
        expect(result.alreadyApplied).toEqual([]);
        const recorded = await database.run(
          'select name, applied_at from sv_migrations order by name',
        );
        expect(recorded.rows.map((r) => r.name)).toEqual([
          '0000_create_notes',
          '0001_add_note_tag',
        ]);
        expect(typeof recorded.rows[0]?.applied_at).toBe('number');
      } finally {
        await database.close();
        await fresh.cleanup();
      }
    });

    it('does nothing the second time', async () => {
      await migrate(db, migrations());
      const again = await migrate(db, migrations());
      expect(again.applied).toEqual([]);
      expect(again.alreadyApplied).toEqual(['0000_create_notes', '0001_add_note_tag']);
    });

    it('creates the tables the paired schemas describe, usable through drizzle on this dialect', async () => {
      await migrate(db, migrations());
      if (db.family === 'postgres') {
        const { notes } = postgresSchema;
        await db.drizzle.insert(notes).values({ id: 'a', title: 'first', createdAt: MS });
        const rows = await db.drizzle.select().from(notes).where(eq(notes.id, 'a'));
        expect(rows).toEqual([{ id: 'a', title: 'first', done: false, createdAt: MS, tag: null }]);
      } else {
        const { notes } = sqliteSchema;
        await db.drizzle.insert(notes).values({ id: 'a', title: 'first', createdAt: MS });
        const rows = await db.drizzle.select().from(notes).where(eq(notes.id, 'a'));
        expect(rows).toEqual([{ id: 'a', title: 'first', done: false, createdAt: MS, tag: null }]);
      }
    });

    it('stores a millisecond timestamp exactly and reads it back as the same number', async () => {
      await migrate(db, migrations());
      await db.run('insert into notes (id, title, created_at) values (?, ?, ?)', ['ms', 'ms', MS]);
      const { rows } = await db.run('select created_at from notes where id = ?', ['ms']);
      expect(rows).toEqual([{ created_at: MS }]);
    });

    it('refuses a migration that was changed after it ran', async () => {
      await migrate(db, migrations());
      const edited: Migration[] = migrations().map((m) =>
        m.name === '0001_add_note_tag' ? { ...m, sql: `${m.sql}\n-- edited` } : m,
      );
      await expect(migrate(db, edited)).rejects.toThrow(MigrationError);
      await expect(migrate(db, edited)).rejects.toThrow(/changed after it ran/);
    });

    it('refuses a folder that lost a migration that already ran', async () => {
      await migrate(db, migrations());
      await expect(migrate(db, migrations().slice(0, 1))).rejects.toThrow(
        /no longer in the migrations folder/,
      );
    });

    it('refuses a new migration numbered before one that already ran', async () => {
      const fresh = await createTestDatabase();
      const database = await fresh.open();
      try {
        const first: Migration = { name: '0000_a', sql: 'create table a (id integer primary key)' };
        const second: Migration = {
          name: '0001_b',
          sql: 'create table b (id integer primary key)',
        };
        await migrate(database, [second]);
        await expect(migrate(database, [first, second])).rejects.toThrow(/numbered before/);
      } finally {
        await database.close();
        await fresh.cleanup();
      }
    });

    it('leaves nothing behind when a migration fails half way', async () => {
      const fresh = await createTestDatabase();
      const database = await fresh.open();
      try {
        const broken: Migration = {
          name: '0000_half',
          sql: 'create table half_done (id integer primary key)\n--> statement-breakpoint\ninsert into no_such_table values (1)',
        };
        await expect(migrate(database, [broken])).rejects.toThrow();
        const tables = await database.run(
          dialect === 'postgres'
            ? "select table_name as name from information_schema.tables where table_schema = current_schema() and table_name = 'half_done'"
            : "select name from sqlite_master where name = 'half_done'",
        );
        expect(tables.rows, 'the first statement was rolled back').toEqual([]);
        const recorded = await database.run('select name from sv_migrations');
        expect(recorded.rows, 'and the migration was not recorded').toEqual([]);
      } finally {
        await database.close();
        await fresh.cleanup();
      }
    });

    it('applies each migration exactly once when several instances start together', async () => {
      const fresh = await createTestDatabase();
      const instances = await Promise.all(Array.from({ length: 5 }, () => fresh.open()));
      try {
        const results = await Promise.all(
          instances.map((database) => migrate(database, migrations())),
        );
        const applied = results.flatMap((r) => r.applied).sort();
        expect(applied).toEqual(['0000_create_notes', '0001_add_note_tag']);
        const recorded = await instances[0]?.run('select count(*) as n from sv_migrations');
        expect(recorded?.rows[0]?.n).toBe(2);
      } finally {
        for (const database of instances) await database.close();
        await fresh.cleanup();
      }
    });
  });
});
