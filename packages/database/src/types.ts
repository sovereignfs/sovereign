import type { Client } from '@libsql/client';
import type { LibSQLDatabase } from 'drizzle-orm/libsql';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type pg from 'pg';
import type { Dialect } from './settings.js';

export type Row = Record<string, unknown>;

export type QueryResult = {
  rows: Row[];
  /** Rows changed by an insert, update or delete; 0 for a query. */
  rowsAffected: number;
};

/**
 * Runs one statement. Placeholders are `?` on every dialect (PostgreSQL's `$1` is
 * rewritten), and the data layer is always async, even on SQLite, so no caller depends
 * on which database is underneath.
 *
 * Integers come back as `number` on every dialect, including PostgreSQL's `bigint` and
 * `count(*)`, which node-postgres would otherwise return as strings. A value beyond
 * `Number.MAX_SAFE_INTEGER` throws instead of silently losing digits.
 */
export interface Executor {
  run(sql: string, args?: readonly unknown[]): Promise<QueryResult>;
}

export interface DatabaseBase extends Executor {
  readonly dialect: Dialect;
  /** Runs `fn` in a transaction: committed when it returns, rolled back when it throws. */
  transaction<T>(fn: (tx: Executor) => Promise<T>): Promise<T>;
  /**
   * Runs `fn` on one connection. PostgreSQL session-scoped primitives (advisory locks,
   * `SET`, temporary tables) belong here and nowhere else: two calls on the pool can land
   * on different connections. On SQLite and sqld it is the database itself, because
   * neither has such primitives.
   */
  session<T>(fn: (session: Executor) => Promise<T>): Promise<T>;
  /** Resolves when a trivial query succeeds; rejects when it fails or takes longer than `timeoutMs`. */
  ping(timeoutMs?: number): Promise<void>;
  close(): Promise<void>;
}

/** sqld or a SQLite file, through libSQL. */
export interface SqliteDatabase extends DatabaseBase {
  readonly dialect: 'sqld' | 'sqlite';
  readonly family: 'sqlite';
  /** The typed query builder. Write queries against the SQLite schemas. */
  readonly drizzle: LibSQLDatabase;
  readonly client: Client;
}

export interface PostgresDatabase extends DatabaseBase {
  readonly dialect: 'postgres';
  readonly family: 'postgres';
  /** The typed query builder. Write queries against the PostgreSQL schemas. */
  readonly drizzle: NodePgDatabase;
  readonly pool: pg.Pool;
}

export type Database = SqliteDatabase | PostgresDatabase;
