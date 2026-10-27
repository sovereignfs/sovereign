import { AsyncLocalStorage } from 'node:async_hooks';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import type { Client, InStatement, ResultSet } from '@libsql/client';
import type pg from 'pg';
import { createPool, toPostgresPlaceholders } from './postgres.js';
import { withTimeout } from './timeout.js';
import type { ResolvedDatabase } from './settings.js';
import { createNamespace, createSqldClient } from './sqld.js';
import type {
  Database,
  Executor,
  PostgresDatabase,
  QueryResult,
  Row,
  SqliteDatabase,
} from './types.js';

export type ConnectOptions = {
  /**
   * For sqld: create the namespace first, through the admin address, if it does not exist.
   * Needs `SQLD_ADMIN_URL`. The `default` namespace always exists.
   */
  createNamespace?: boolean;
};

/** Opens the database the settings name. Nothing is loaded for a dialect that is not in use. */
export async function connect(
  resolved: ResolvedDatabase,
  options: ConnectOptions = {},
): Promise<Database> {
  switch (resolved.dialect) {
    case 'postgres':
      return connectPostgres(resolved.url.reveal(), resolved.poolMax);
    case 'sqlite': {
      mkdirSync(path.dirname(path.resolve(resolved.path)), { recursive: true });
      const { createClient } = await import('@libsql/client');
      const client = createClient({ url: resolved.url });
      // Wait for a writer instead of failing at once; keep foreign keys on, as on the others.
      await client.execute('pragma busy_timeout = 5000');
      await client.execute('pragma foreign_keys = on');
      await client.execute('pragma journal_mode = wal');
      return sqliteDatabase('sqlite', client, serializeOnFile(path.resolve(resolved.path)));
    }
    case 'sqld': {
      if (options.createNamespace && resolved.namespace !== 'default') {
        if (resolved.adminUrl === undefined) {
          throw new Error('Creating an sqld namespace needs the admin address (SQLD_ADMIN_URL).');
        }
        await createNamespace(resolved.adminUrl, resolved.namespace);
      }
      return sqliteDatabase(
        'sqld',
        await createSqldClient(resolved.url, resolved.namespace),
        unserialized,
      );
    }
  }
}

// ---- one operation at a time, and no reaching around a transaction ----------------

/**
 * Inside `transaction` and `session` the callback gets its own executor. Calling the
 * database itself from there would use a different connection on PostgreSQL (outside the
 * transaction, and able to exhaust the pool) and would wait forever on a SQLite file, which
 * a transaction holds exclusively. It fails the same way on every dialect instead.
 */
function scopeGuard() {
  const scope = new AsyncLocalStorage<true>();
  return {
    assertFree(): void {
      if (scope.getStore()) {
        throw new Error(
          'Inside db.transaction or db.session, use the executor the callback is given, not the database itself.',
        );
      }
    },
    enter<T>(fn: () => Promise<T>): Promise<T> {
      return scope.run(true, fn);
    },
  };
}

/**
 * The libSQL file driver is synchronous: a connection waiting for the file blocks the whole
 * process, so two connections to one file in one process, one waiting for the other, would
 * never get past the wait. Operations on one file therefore run one at a time within the
 * process; other processes are handled by SQLite's own busy timeout.
 */
const fileQueues = new Map<string, Promise<unknown>>();

function serializeOnFile(key: string): <T>(fn: () => Promise<T>) => Promise<T> {
  return <T>(fn: () => Promise<T>): Promise<T> => {
    const previous = fileQueues.get(key) ?? Promise.resolve();
    const next = previous.then(fn, fn);
    const settled = next.then(
      () => undefined,
      () => undefined,
    );
    fileQueues.set(key, settled);
    void settled.then(() => {
      if (fileQueues.get(key) === settled) fileQueues.delete(key);
    });
    return next;
  };
}

const unserialized = async <T>(fn: () => Promise<T>): Promise<T> => fn();

// ---- SQLite and sqld, through libSQL ---------------------------------------------

function toRows(result: ResultSet): Row[] {
  return result.rows.map((row) =>
    Object.fromEntries(result.columns.map((column, index) => [column, row[index]])),
  );
}

function libsqlExecutor(target: Pick<Client, 'execute'>): Executor {
  return {
    async run(sql, args = []): Promise<QueryResult> {
      const result = await target.execute({ sql, args: [...args] } as InStatement);
      return { rows: toRows(result), rowsAffected: result.rowsAffected };
    },
  };
}

async function sqliteDatabase(
  dialect: 'sqld' | 'sqlite',
  client: Client,
  lock: <T>(fn: () => Promise<T>) => Promise<T>,
): Promise<SqliteDatabase> {
  const { drizzle } = await import('drizzle-orm/libsql');
  const executor = libsqlExecutor(client);
  const guard = scopeGuard();
  return {
    dialect,
    family: 'sqlite',
    drizzle: drizzle(client),
    client,
    async run(sql, args) {
      guard.assertFree();
      return lock(() => executor.run(sql, args));
    },
    async transaction(fn) {
      guard.assertFree();
      return lock(() =>
        guard.enter(async () => {
          const transaction = await client.transaction('write');
          try {
            const result = await fn(libsqlExecutor(transaction));
            await transaction.commit();
            return result;
          } catch (error) {
            await transaction.rollback().catch(() => undefined);
            throw error;
          } finally {
            transaction.close();
          }
        }),
      );
    },
    async session(fn) {
      guard.assertFree();
      return lock(() => guard.enter(async () => fn(executor)));
    },
    ping: async (timeoutMs = 3000) => {
      await withTimeout(client.execute('select 1'), timeoutMs, 'The database check');
    },
    close: () => {
      client.close();
      return Promise.resolve();
    },
  };
}

// ---- PostgreSQL ------------------------------------------------------------------

function pgExecutor(target: Pick<pg.Pool | pg.PoolClient, 'query'>): Executor {
  return {
    async run(sql, args = []): Promise<QueryResult> {
      const result = await target.query(toPostgresPlaceholders(sql), [...args]);
      return { rows: result.rows as Row[], rowsAffected: result.rowCount ?? 0 };
    },
  };
}

async function connectPostgres(
  connectionString: string,
  poolMax: number,
): Promise<PostgresDatabase> {
  const { drizzle } = await import('drizzle-orm/node-postgres');
  const pool = createPool(connectionString, poolMax);
  // An idle client that errors (the server restarted, say) must not crash the process.
  pool.on('error', () => undefined);
  const executor = pgExecutor(pool);
  const guard = scopeGuard();

  async function onOneConnection<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
    const client = await pool.connect();
    try {
      return await fn(client);
    } finally {
      client.release();
    }
  }

  return {
    dialect: 'postgres',
    family: 'postgres',
    drizzle: drizzle(pool),
    pool,
    async run(sql, args) {
      guard.assertFree();
      return executor.run(sql, args);
    },
    async transaction(fn) {
      guard.assertFree();
      return onOneConnection((client) =>
        guard.enter(async () => {
          await client.query('begin');
          try {
            const result = await fn(pgExecutor(client));
            await client.query('commit');
            return result;
          } catch (error) {
            await client.query('rollback').catch(() => undefined);
            throw error;
          }
        }),
      );
    },
    async session(fn) {
      guard.assertFree();
      return onOneConnection((client) => guard.enter(async () => fn(pgExecutor(client))));
    },
    ping: async (timeoutMs = 3000) => {
      await withTimeout(pool.query('select 1'), timeoutMs, 'The database check');
    },
    close: () => pool.end(),
  };
}
