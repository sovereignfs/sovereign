/**
 * A populated better-auth store, captured as plain rows so a later better-auth can be tried against
 * what an earlier one wrote. Each file in `fixtures/auth-store` is one capture: a person, their
 * password hash, and a live session with its signed cookie, as the named version made them.
 */
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Database } from '@sovereignfs/database';

export const FIXTURES = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'fixtures/auth-store',
);

/** Tables in the order rows can be inserted (a row's parent first). */
export const STORE_TABLES = ['users', 'accounts', 'sessions'] as const;

export type Row = Record<string, string | number | boolean | null>;

export type StoreFixture = {
  /** The better-auth version that wrote these rows. */
  betterAuth: string;
  secret: string;
  email: string;
  password: string;
  /** The `Cookie` header a browser would send for the captured session. */
  cookie: string;
  tables: Record<(typeof STORE_TABLES)[number], Row[]>;
};

export function readFixtures(): { file: string; fixture: StoreFixture }[] {
  return readdirSync(FIXTURES)
    .filter((file) => file.endsWith('.json'))
    .sort()
    .map((file) => ({
      file,
      fixture: JSON.parse(readFileSync(path.join(FIXTURES, file), 'utf8')) as StoreFixture,
    }));
}

const isTime = (column: string) => column.endsWith('_at');
const isFlag = (column: string) => column === 'email_verified';

/** Writes a fixture's rows into an empty store, in whatever types this dialect keeps them. */
export async function loadFixture(db: Database, fixture: StoreFixture): Promise<void> {
  for (const table of STORE_TABLES) {
    for (const row of fixture.tables[table]) {
      const columns = Object.keys(row);
      const values = columns.map((column) => {
        const value = row[column] ?? null;
        if (value === null) return null;
        if (isTime(column))
          return db.family === 'postgres' ? new Date(Number(value)) : Number(value);
        if (isFlag(column))
          return db.family === 'postgres' ? Boolean(value) : Number(Boolean(value));
        return value;
      });
      await db.run(
        `insert into ${table} (${columns.join(', ')}) values (${columns.map(() => '?').join(', ')})`,
        values,
      );
    }
  }
}

/** Reads a store's rows back as fixture rows: times as milliseconds, flags as booleans. */
export async function readStore(db: Database): Promise<StoreFixture['tables']> {
  const tables = {} as StoreFixture['tables'];
  for (const table of STORE_TABLES) {
    const { rows } = await db.run(`select * from ${table}`);
    tables[table] = rows.map((raw) => {
      const row: Row = {};
      for (const [column, value] of Object.entries(raw)) {
        if (value === null || value === undefined) row[column] = null;
        else if (isTime(column)) row[column] = new Date(value as string | number | Date).getTime();
        else if (isFlag(column)) row[column] = Boolean(value);
        else row[column] = value as string | number;
      }
      return row;
    });
  }
  return tables;
}
