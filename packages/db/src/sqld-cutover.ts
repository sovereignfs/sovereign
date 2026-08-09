import type { Client, InArgs, InStatement } from '@libsql/client';
import Database from 'better-sqlite3-multiple-ciphers';

/**
 * One-time cutover of a plain-file SQLite database's schema + data into an
 * sqld namespace (`sv db migrate-to-sqld`, workstream 0009 leg 4). Moves a
 * legacy pre-leg-3 file onto the mandatory `sqld` setup leg 3 introduced —
 * not used by the runtime's normal open path (see `sqld.ts`/`client.ts` for
 * that).
 */

export class SqldCutoverError extends Error {}

export interface CutoverTableResult {
  table: string;
  sourceRows: number;
  destRows: number;
}

/**
 * Best-effort "is anything else holding a write lock on this file" check —
 * same technique as `sqlite-migration.ts`'s `checkpointAndProbe`, kept as its
 * own small copy here rather than shared: that function also checkpoints the
 * WAL as a side effect (needed before a raw file copy), which this tool has
 * no reason to do since it reads through SQL, not the filesystem.
 */
function probeExclusiveAccess(path: string): void {
  const probe = new Database(path);
  try {
    probe.pragma('busy_timeout = 200');
    probe.exec('BEGIN IMMEDIATE');
    probe.exec('ROLLBACK');
  } catch (cause) {
    throw new SqldCutoverError(
      `Could not get exclusive access to ${path} — the server may still be running. ` +
        'Stop it before running this command.',
      { cause },
    );
  } finally {
    probe.close();
  }
}

function toSqldValue(v: unknown): unknown {
  return Buffer.isBuffer(v) ? new Uint8Array(v) : v;
}

/**
 * Read-only preview of what a cutover would copy — table names and row
 * counts — without touching the destination at all. Used by
 * `sv db migrate-to-sqld --dry-run`.
 */
export function previewSqliteFile(path: string): { table: string; rows: number }[] {
  const source = new Database(path, { readonly: true });
  try {
    const tables = source
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
      .all() as { name: string }[];
    return tables.map(({ name }) => {
      const { n } = source.prepare(`SELECT COUNT(*) as n FROM "${name}"`).get() as { n: number };
      return { table: name, rows: n };
    });
  } finally {
    source.close();
  }
}

/**
 * Copy one plain-file SQLite database (schema + data) into an sqld
 * namespace/database reached by `client`, verbatim — every `CREATE TABLE`/
 * `CREATE INDEX` statement, then every row. The whole copy runs as a single
 * `client.migrate()` transaction (foreign-key checks off during import,
 * restored after) — either the entire file lands, or none of it does.
 *
 * Refuses to run against a non-empty destination: this tool is a one-time
 * cutover, not incremental sync. A partially-populated destination from an
 * earlier failed attempt must be dropped and recreated (see
 * docs/self-hosting.md's sqld cutover section) before retrying, not resumed
 * into.
 */
export async function cutoverSqliteFileToSqld(
  path: string,
  client: Client,
): Promise<CutoverTableResult[]> {
  const existing = await client.execute(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'",
  );
  if (existing.rows.length > 0) {
    throw new SqldCutoverError(
      `Destination is not empty (${existing.rows.length} table(s) already present) — refusing ` +
        'to cut over into it. Drop and recreate the namespace first if retrying.',
    );
  }

  probeExclusiveAccess(path);

  const results: CutoverTableResult[] = [];
  const statements: InStatement[] = [];

  const source = new Database(path, { readonly: true });
  try {
    const schema = source
      .prepare(
        `SELECT type, name, sql FROM sqlite_master
         WHERE type IN ('table', 'index') AND sql IS NOT NULL AND name NOT LIKE 'sqlite_%'
         ORDER BY (type = 'index')`,
      )
      .all() as { type: string; name: string; sql: string }[];

    if (schema.length === 0) {
      throw new SqldCutoverError(`${path} has no tables — nothing to migrate.`);
    }

    for (const { sql } of schema) {
      statements.push({ sql, args: [] });
    }

    for (const { type, name } of schema) {
      if (type !== 'table') continue;

      const columns = (
        source.prepare(`SELECT * FROM "${name}" LIMIT 0`).columns() as { name: string }[]
      ).map((c) => c.name);
      const rows = source.prepare(`SELECT * FROM "${name}"`).all() as Record<string, unknown>[];
      results.push({ table: name, sourceRows: rows.length, destRows: 0 });
      if (rows.length === 0) continue;

      const insertSql = `INSERT INTO "${name}" (${columns.map((c) => `"${c}"`).join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`;
      for (const row of rows) {
        statements.push({
          sql: insertSql,
          args: columns.map((c) => toSqldValue(row[c])) as InArgs,
        });
      }
    }
  } finally {
    source.close();
  }

  await client.migrate(statements);

  for (const result of results) {
    const count = await client.execute(`SELECT COUNT(*) as n FROM "${result.table}"`);
    result.destRows = Number((count.rows[0] as unknown as { n: number | bigint }).n);
  }

  return results;
}
