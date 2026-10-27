import { is } from 'drizzle-orm';
import { PgTable, getTableConfig as pgTableConfig } from 'drizzle-orm/pg-core';
import { SQLiteTable, getTableConfig as sqliteTableConfig } from 'drizzle-orm/sqlite-core';
import { MAX_IDENTIFIER_BYTES } from './identifiers.js';

/**
 * Every schema change is made for every dialect: the SQLite and PostgreSQL schemas are
 * written as a pair, and this finds where they disagree. Call it from a test with the two
 * schema modules (`import * as sqlite from './schema/sqlite'`):
 *
 *   expect(schemaDifferences(sqlite, postgres)).toEqual([]);
 *
 * It compares what the two dialects must agree on: the tables, each table's columns (name,
 * logical type, nullability, primary key), indexes, unique constraints, primary keys and
 * foreign keys. It does not compare physical types, which differ on purpose (`bigint` and
 * `integer` for a millisecond timestamp), and it flags any identifier PostgreSQL would
 * truncate.
 */

type TableShape = {
  columns: Map<string, string>;
  indexes: Map<string, string>;
  uniques: Set<string>;
  primaryKey: string;
  foreignKeys: Set<string>;
  names: string[];
};

type AnyColumn = { name: string; dataType: string; notNull: boolean; primary: boolean };

function describeColumns(columns: readonly AnyColumn[]): Map<string, string> {
  return new Map(
    columns.map((c) => [
      c.name,
      `${c.dataType}${c.notNull ? ' not null' : ''}${c.primary ? ' primary key' : ''}`,
    ]),
  );
}

const listColumns = (columns: readonly { name: string }[]): string =>
  columns.map((c) => c.name).join(', ');

function sqliteShape(table: SQLiteTable): [string, TableShape] {
  const config = sqliteTableConfig(table);
  return [
    config.name,
    {
      columns: describeColumns(config.columns as unknown as AnyColumn[]),
      indexes: new Map(
        config.indexes.map((i) => [
          i.config.name,
          `${i.config.unique ? 'unique ' : ''}(${i.config.columns.map((c) => ('name' in c ? c.name : '?')).join(', ')})`,
        ]),
      ),
      uniques: new Set(config.uniqueConstraints.map((u) => `(${listColumns(u.columns)})`)),
      primaryKey: config.primaryKeys.map((k) => `(${listColumns(k.columns)})`).join(''),
      foreignKeys: new Set(
        config.foreignKeys.map((f) => {
          const reference = f.reference();
          return `(${listColumns(reference.columns)}) -> ${sqliteTableConfig(reference.foreignTable as SQLiteTable).name}(${listColumns(reference.foreignColumns)})`;
        }),
      ),
      names: [
        config.name,
        ...config.columns.map((c) => c.name),
        ...config.indexes.map((i) => i.config.name),
      ],
    },
  ];
}

function postgresShape(table: PgTable): [string, TableShape] {
  const config = pgTableConfig(table);
  return [
    config.name,
    {
      columns: describeColumns(config.columns as unknown as AnyColumn[]),
      indexes: new Map(
        config.indexes.map((i) => [
          i.config.name ?? '(unnamed)',
          `${i.config.unique ? 'unique ' : ''}(${i.config.columns.map((c) => ('name' in c ? c.name : '?')).join(', ')})`,
        ]),
      ),
      uniques: new Set(config.uniqueConstraints.map((u) => `(${listColumns(u.columns)})`)),
      primaryKey: config.primaryKeys.map((k) => `(${listColumns(k.columns)})`).join(''),
      foreignKeys: new Set(
        config.foreignKeys.map((f) => {
          const reference = f.reference();
          return `(${listColumns(reference.columns)}) -> ${pgTableConfig(reference.foreignTable as PgTable).name}(${listColumns(reference.foreignColumns)})`;
        }),
      ),
      names: [
        config.name,
        ...config.columns.map((c) => c.name),
        ...config.indexes.map((i) => i.config.name ?? ''),
      ],
    },
  ];
}

function tablesOf(
  schema: Record<string, unknown>,
  kind: 'sqlite' | 'postgres',
): Map<string, TableShape> {
  const tables = new Map<string, TableShape>();
  for (const value of Object.values(schema)) {
    if (kind === 'sqlite' && is(value, SQLiteTable)) {
      const [name, shape] = sqliteShape(value);
      tables.set(name, shape);
    } else if (kind === 'postgres' && is(value, PgTable)) {
      const [name, shape] = postgresShape(value);
      tables.set(name, shape);
    }
  }
  return tables;
}

function compareMaps(
  label: string,
  a: Map<string, string>,
  b: Map<string, string>,
  out: string[],
): void {
  for (const [name, shape] of a) {
    const other = b.get(name);
    if (other === undefined) out.push(`${label} "${name}" exists in SQLite only`);
    else if (other !== shape)
      out.push(`${label} "${name}" differs: SQLite has "${shape}", PostgreSQL has "${other}"`);
  }
  for (const name of b.keys())
    if (!a.has(name)) out.push(`${label} "${name}" exists in PostgreSQL only`);
}

function compareSets(label: string, a: Set<string>, b: Set<string>, out: string[]): void {
  for (const item of a) if (!b.has(item)) out.push(`${label} ${item} exists in SQLite only`);
  for (const item of b) if (!a.has(item)) out.push(`${label} ${item} exists in PostgreSQL only`);
}

/** What the two schemas disagree on, one line each; empty when they are a true pair. */
export function schemaDifferences(
  sqliteSchema: Record<string, unknown>,
  postgresSchema: Record<string, unknown>,
): string[] {
  const sqlite = tablesOf(sqliteSchema, 'sqlite');
  const postgres = tablesOf(postgresSchema, 'postgres');
  const out: string[] = [];

  for (const [name, a] of sqlite) {
    const b = postgres.get(name);
    if (!b) {
      out.push(`table "${name}" exists in SQLite only`);
      continue;
    }
    compareMaps(`table "${name}": column`, a.columns, b.columns, out);
    compareMaps(`table "${name}": index`, a.indexes, b.indexes, out);
    compareSets(`table "${name}": unique constraint`, a.uniques, b.uniques, out);
    compareSets(`table "${name}": foreign key`, a.foreignKeys, b.foreignKeys, out);
    if (a.primaryKey !== b.primaryKey) {
      out.push(
        `table "${name}": composite primary key differs: SQLite "${a.primaryKey}", PostgreSQL "${b.primaryKey}"`,
      );
    }
  }
  for (const name of postgres.keys())
    if (!sqlite.has(name)) out.push(`table "${name}" exists in PostgreSQL only`);

  for (const shape of [...sqlite.values(), ...postgres.values()]) {
    for (const identifier of shape.names) {
      if (new TextEncoder().encode(identifier).length > MAX_IDENTIFIER_BYTES) {
        out.push(
          `identifier "${identifier}" is longer than ${MAX_IDENTIFIER_BYTES} bytes; PostgreSQL would truncate it`,
        );
      }
    }
  }
  return [...new Set(out)];
}

/** Throws, listing every difference, when the two schemas are not a pair. */
export function assertSchemaParity(
  sqliteSchema: Record<string, unknown>,
  postgresSchema: Record<string, unknown>,
): void {
  const differences = schemaDifferences(sqliteSchema, postgresSchema);
  if (differences.length > 0) {
    throw new Error(`The SQLite and PostgreSQL schemas differ:\n  - ${differences.join('\n  - ')}`);
  }
}

export { createTestDatabase, testDialect } from './test-database.js';
export type { TestDatabase } from './test-database.js';
