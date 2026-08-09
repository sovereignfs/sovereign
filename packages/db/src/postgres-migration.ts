import Database from 'better-sqlite3-multiple-ciphers';
import type { Pool, PoolClient } from 'pg';
import { openKeyedSqlite } from './sqlite-encryption';

/**
 * One-time migration of an isolated plugin's plain-file SQLite database into
 * an already-provisioned Postgres schema (`sv db migrate-to-postgres`).
 *
 * Unlike `sqld-cutover.ts`, this does **not** create the destination schema —
 * Postgres and SQLite DDL aren't transferable (no `AUTOINCREMENT` in
 * Postgres, different type keywords), so the destination tables must already
 * exist with their real, dialect-native shape, created the same way the
 * platform always creates them: by running the plugin's own Postgres
 * migrations (`provisionPluginDb` + `runPluginMigrations`, called by the CLI
 * layer before this module does anything). This module only copies rows,
 * matched by column name, into tables that are already there.
 *
 * Not used by the runtime's normal open path.
 */

export class PostgresMigrationError extends Error {}

export interface PostgresMigrationTableResult {
  table: string;
  sourceRows: number;
  destRows: number;
}

/**
 * Best-effort "is anything else holding a write lock on this file" check —
 * same technique as `sqld-cutover.ts`'s `probeExclusiveAccess`.
 */
function probeExclusiveAccess(path: string, key: Buffer | undefined): void {
  // Deliberately not opened `readonly` — a readonly connection can never
  // acquire the RESERVED lock `BEGIN IMMEDIATE` requests, so it would not
  // actually detect a conflicting writer (verified: it silently no-ops
  // instead of throwing). This probe itself makes no writes.
  const probe = new Database(path);
  try {
    if (key) {
      probe.pragma(`cipher='sqlcipher'`);
      probe.key(key);
    }
    probe.pragma('busy_timeout = 200');
    probe.exec('BEGIN IMMEDIATE');
    probe.exec('ROLLBACK');
  } catch (cause) {
    throw new PostgresMigrationError(
      `Could not get exclusive access to ${path} — either the key is wrong, or the server may ` +
        'still be running. Stop it before running this command.',
      { cause },
    );
  } finally {
    probe.close();
  }
}

function listSqliteTables(source: InstanceType<typeof Database>): string[] {
  const rows = source
    .prepare(
      `SELECT name FROM sqlite_master
       WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '\\_\\_drizzle%' ESCAPE '\\'
       ORDER BY name`,
    )
    .all() as { name: string }[];
  return rows.map((r) => r.name);
}

function listSqliteColumns(source: InstanceType<typeof Database>, table: string): string[] {
  return (source.prepare(`SELECT * FROM "${table}" LIMIT 0`).columns() as { name: string }[]).map(
    (c) => c.name,
  );
}

/**
 * Read-only preview of what a migration would copy — table names and row
 * counts from the SQLite source only, without touching Postgres at all. Used
 * by `sv db migrate-to-postgres --dry-run`. `key` is required for a file
 * carrying an RFC 0071 encryption marker; omit it for a plaintext file.
 */
export function previewSqliteFileForPostgres(
  path: string,
  key?: Buffer,
): { table: string; rows: number }[] {
  const source = openKeyedSqlite(path, key);
  try {
    return listSqliteTables(source).map((table) => {
      const { n } = source.prepare(`SELECT COUNT(*) as n FROM "${table}"`).get() as {
        n: number;
      };
      return { table, rows: n };
    });
  } finally {
    source.close();
  }
}

async function listPostgresTables(client: PoolClient, schema: string): Promise<Set<string>> {
  const res = await client.query<{ table_name: string }>(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema = $1 AND table_name NOT LIKE '\\_\\_drizzle%'`,
    [schema],
  );
  return new Set(res.rows.map((r) => r.table_name));
}

async function listPostgresColumns(
  client: PoolClient,
  schema: string,
  table: string,
): Promise<Map<string, string>> {
  const res = await client.query<{ column_name: string; data_type: string }>(
    `SELECT column_name, data_type FROM information_schema.columns
     WHERE table_schema = $1 AND table_name = $2`,
    [schema, table],
  );
  return new Map(res.rows.map((r) => [r.column_name, r.data_type]));
}

/**
 * Convert one SQLite-read value to what `pg` expects for the destination
 * column's actual Postgres type. This codebase's own tables (and every
 * already-migrated plugin checked empirically) store booleans and timestamps
 * as plain integers on both dialects — but a third-party plugin schema isn't
 * guaranteed to follow that convention, so this coerces based on the real
 * destination type rather than assuming passthrough is always safe.
 */
export function coerceForPostgres(value: unknown, pgType: string): unknown {
  if (value === null || value === undefined) return null;
  if (pgType === 'boolean') {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number' || typeof value === 'bigint') return Number(value) !== 0;
    return value;
  }
  if (pgType.startsWith('timestamp')) {
    // This codebase's convention (seedPlatformData et al.): epoch seconds.
    if (typeof value === 'number' || typeof value === 'bigint') {
      return new Date(Number(value) * 1000);
    }
    return value;
  }
  if (pgType === 'bytea') {
    if (Buffer.isBuffer(value)) return value;
    if (value instanceof Uint8Array) return Buffer.from(value);
    return value;
  }
  return value;
}

const INSERT_BATCH_SIZE = 500;

/**
 * Copy every row of every real table in a plain-file SQLite database into the
 * matching (by name) table already present in a Postgres schema. The whole
 * copy runs in a single Postgres transaction — either everything lands, or
 * nothing does.
 *
 * Refuses to run if any destination table already has rows: this is a
 * one-time migration, not incremental sync. Refuses if the SQLite source has
 * a column the destination table lacks (would silently drop data); a
 * destination column absent from the source is fine (left NULL/default).
 *
 * `key` is required for a source file carrying an RFC 0071 encryption
 * marker; omit it for a plaintext file.
 */
export async function migratePluginSqliteToPostgres(
  path: string,
  pool: Pool,
  schema: string,
  key?: Buffer,
): Promise<PostgresMigrationTableResult[]> {
  probeExclusiveAccess(path, key);

  const source = openKeyedSqlite(path, key);
  const client = await pool.connect();
  try {
    const tables = listSqliteTables(source);
    if (tables.length === 0) {
      throw new PostgresMigrationError(`${path} has no tables — nothing to migrate.`);
    }

    const destTables = await listPostgresTables(client, schema);
    for (const table of tables) {
      if (!destTables.has(table)) {
        throw new PostgresMigrationError(
          `Destination schema "${schema}" has no table "${table}" — run the plugin's Postgres ` +
            'migrations against it first (sv plugin migrate) before migrating data.',
        );
      }
    }

    await client.query('BEGIN');

    const results: PostgresMigrationTableResult[] = [];
    for (const table of tables) {
      const { n: existingCount } = (
        await client.query<{ n: string }>(`SELECT COUNT(*)::text as n FROM "${schema}"."${table}"`)
      ).rows[0] ?? { n: '0' };
      if (Number(existingCount) > 0) {
        throw new PostgresMigrationError(
          `Destination table "${schema}"."${table}" already has ${existingCount} row(s) — ` +
            'refusing to migrate into it. Drop and recreate the schema first if retrying.',
        );
      }

      const sourceColumns = listSqliteColumns(source, table);
      const destColumnTypes = await listPostgresColumns(client, schema, table);
      const missing = sourceColumns.filter((c) => !destColumnTypes.has(c));
      if (missing.length > 0) {
        throw new PostgresMigrationError(
          `Destination table "${schema}"."${table}" is missing column(s) present in the SQLite ` +
            `source: ${missing.join(', ')}. Refusing to migrate — this would silently drop data.`,
        );
      }

      const rows = source.prepare(`SELECT * FROM "${table}"`).all() as Record<string, unknown>[];
      results.push({ table, sourceRows: rows.length, destRows: 0 });

      for (let i = 0; i < rows.length; i += INSERT_BATCH_SIZE) {
        const batch = rows.slice(i, i + INSERT_BATCH_SIZE);
        const values: unknown[] = [];
        const tuples: string[] = [];
        for (const row of batch) {
          const placeholders = sourceColumns.map((c) => {
            values.push(coerceForPostgres(row[c], destColumnTypes.get(c) as string));
            return `$${values.length}`;
          });
          tuples.push(`(${placeholders.join(', ')})`);
        }
        const columnList = sourceColumns.map((c) => `"${c}"`).join(', ');
        await client.query(
          `INSERT INTO "${schema}"."${table}" (${columnList}) VALUES ${tuples.join(', ')}`,
          values,
        );
      }
    }

    for (const result of results) {
      const { n } = (
        await client.query<{ n: string }>(
          `SELECT COUNT(*)::text as n FROM "${schema}"."${result.table}"`,
        )
      ).rows[0] ?? { n: '0' };
      result.destRows = Number(n);
    }

    await client.query('COMMIT');
    return results;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {
      // Best-effort — the connection may already be unusable.
    });
    throw err;
  } finally {
    source.close();
    client.release();
  }
}
