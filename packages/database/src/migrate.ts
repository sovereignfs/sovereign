import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { Database, Executor } from './types.js';

/** One migration: a name (its file name without `.sql`) and its SQL. */
export type Migration = { name: string; sql: string };

/** Where statements in a migration file are separated, as drizzle-kit writes them. */
export const STATEMENT_BREAKPOINT = '--> statement-breakpoint';

const FILE = /^(\d{4,})_[a-z0-9_]+\.sql$/;

/**
 * Reads a folder of migrations, `0000_name.sql`, `0001_name.sql`, … in numeric order.
 * Each dialect has its own folder (paired schemas, paired migrations).
 */
export function readMigrations(folder: string): Migration[] {
  const names = readdirSync(folder).filter((file) => file.endsWith('.sql'));
  const bad = names.find((file) => !FILE.test(file));
  if (bad !== undefined) {
    throw new Error(`The migration file "${bad}" must be named like 0001_create_things.sql.`);
  }
  return names.sort().map((file) => ({
    name: file.slice(0, -'.sql'.length),
    sql: readFileSync(path.join(folder, file), 'utf8'),
  }));
}

function statementsOf(migration: Migration): string[] {
  return migration.sql
    .split(STATEMENT_BREAKPOINT)
    .map((statement) => statement.trim())
    .filter((statement) => statement !== '');
}

function checksum(migration: Migration): string {
  return createHash('sha256').update(migration.sql).digest('hex');
}

/** The table that records what ran. It is the runner's own, not drizzle's. */
export const MIGRATIONS_TABLE = 'sv_migrations';

export type MigrateResult = {
  /** Migrations this call applied, in order. */
  applied: string[];
  /** Migrations that had already run. */
  alreadyApplied: string[];
};

export class MigrationError extends Error {
  override name = 'MigrationError';
}

async function recorded(executor: Executor): Promise<{ name: string; checksum: string }[]> {
  const { rows } = await executor.run(
    `select name, checksum from ${MIGRATIONS_TABLE} order by name`,
  );
  return rows.map((row) => ({ name: String(row.name), checksum: String(row.checksum) }));
}

/** A stable 64-bit key for an advisory lock, from a name. */
function advisoryKey(name: string): string {
  const bytes = createHash('sha256').update(name).digest();
  return BigInt.asIntN(64, bytes.readBigUInt64BE(0)).toString();
}

/**
 * Applies the migrations that have not run, in order, and records each one.
 *
 * - **Exactly once, even when several instances start together.** On PostgreSQL the run
 *   holds an advisory lock on one pinned connection; on SQLite and sqld each migration is
 *   re-checked inside its own write transaction.
 * - **Each migration is atomic:** its statements and its record commit together or not at
 *   all, so a failed migration leaves nothing half-applied.
 * - **History cannot be rewritten.** A migration changed after it ran, or missing from the
 *   folder, or a new one numbered before one that already ran, is an error, not a guess.
 */
export async function migrate(
  database: Database,
  migrations: readonly Migration[],
): Promise<MigrateResult> {
  const names = migrations.map((m) => m.name);
  if (new Set(names).size !== names.length)
    throw new MigrationError('Two migrations have the same name.');
  const ordered = [...migrations].sort((a, b) => a.name.localeCompare(b.name));

  if (database.family === 'postgres') {
    // The lock is session-scoped, so it is taken and released on one pinned connection,
    // and held while the migrations run on others. (That is why the pool needs two.)
    const client = await database.pool.connect();
    try {
      const key = advisoryKey(MIGRATIONS_TABLE);
      await client.query('select pg_advisory_lock($1::bigint)', [key]);
      try {
        return await applyAll(database, ordered);
      } finally {
        await client.query('select pg_advisory_unlock($1::bigint)', [key]);
      }
    } finally {
      client.release();
    }
  }
  return applyAll(database, ordered);
}

async function applyAll(database: Database, ordered: readonly Migration[]): Promise<MigrateResult> {
  const timestamp = database.family === 'postgres' ? 'bigint' : 'integer';
  await database.run(
    `create table if not exists ${MIGRATIONS_TABLE} (name text primary key, checksum text not null, applied_at ${timestamp} not null)`,
  );

  const history = await recorded(database);
  verifyHistory(history, ordered);

  const result: MigrateResult = { applied: [], alreadyApplied: history.map((h) => h.name) };
  const done = new Set(result.alreadyApplied);
  for (const migration of ordered) {
    if (done.has(migration.name)) continue;
    const ran = await database.transaction(async (tx) => {
      // Re-checked inside the transaction: another instance may have just applied it.
      const again = await tx.run(`select name from ${MIGRATIONS_TABLE} where name = ?`, [
        migration.name,
      ]);
      if (again.rows.length > 0) return false;
      for (const statement of statementsOf(migration)) await tx.run(statement);
      await tx.run(
        `insert into ${MIGRATIONS_TABLE} (name, checksum, applied_at) values (?, ?, ?)`,
        [migration.name, checksum(migration), Date.now()],
      );
      return true;
    });
    if (ran) result.applied.push(migration.name);
    else result.alreadyApplied.push(migration.name);
  }
  return result;
}

function verifyHistory(
  history: readonly { name: string; checksum: string }[],
  ordered: readonly Migration[],
): void {
  const byName = new Map(ordered.map((m) => [m.name, m]));
  for (const entry of history) {
    const migration = byName.get(entry.name);
    if (!migration) {
      throw new MigrationError(
        `The migration "${entry.name}" has run but is no longer in the migrations folder.`,
      );
    }
    if (checksum(migration) !== entry.checksum) {
      throw new MigrationError(
        `The migration "${entry.name}" was changed after it ran; write a new migration instead.`,
      );
    }
  }
  const lastRun = history
    .map((h) => h.name)
    .sort()
    .at(-1);
  if (lastRun !== undefined) {
    const late = ordered.find((m) => m.name < lastRun && !history.some((h) => h.name === m.name));
    if (late) {
      throw new MigrationError(
        `The migration "${late.name}" is numbered before "${lastRun}", which has already run; renumber it after the last one.`,
      );
    }
  }
}
