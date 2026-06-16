import { getTableColumns, getTableName, isTable } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import * as pg from '../postgres';
import * as sqlite from '../sqlite';

/**
 * The SQLite and Postgres platform schemas must stay structurally identical so
 * the platform data layer is dialect-agnostic (SRS §3.7, NFR-03). This guards
 * against drift: same set of tables, and for each table the same column set
 * mapped to the same database column names.
 */

function tableMap(mod: Record<string, unknown>): Map<string, Record<string, { name: string }>> {
  const map = new Map<string, Record<string, { name: string }>>();
  for (const value of Object.values(mod)) {
    if (isTable(value)) {
      map.set(getTableName(value), getTableColumns(value));
    }
  }
  return map;
}

describe('schema parity (sqlite ↔ postgres)', () => {
  const sqliteTables = tableMap(sqlite);
  const pgTables = tableMap(pg);

  it('defines the same set of tables in both dialects', () => {
    expect([...pgTables.keys()].sort()).toEqual([...sqliteTables.keys()].sort());
  });

  it('defines the same columns (and DB column names) per table', () => {
    for (const [table, sqliteCols] of sqliteTables) {
      const pgCols = pgTables.get(table);
      expect(pgCols, `postgres missing table ${table}`).toBeDefined();
      if (!pgCols) continue;

      const sqliteNames = Object.values(sqliteCols)
        .map((c) => c.name)
        .sort();
      const pgNames = Object.values(pgCols)
        .map((c) => c.name)
        .sort();
      expect(pgNames, `column mismatch on ${table}`).toEqual(sqliteNames);
    }
  });
});
