import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { sql } from 'drizzle-orm';
import type { PlatformDb, SqliteDb } from './client';
import { dbAll, dbRun } from './exec';
import type { PluginDb } from './plugin-client';

/**
 * One-time migration of a `database: "shared"` plugin's data — tables living
 * inside the platform's own database, slug-prefixed — into a freshly
 * provisioned isolated store for that plugin (`sv plugin migrate-to-isolated`).
 *
 * Same-dialect throughout: the source is the platform's own connection, the
 * destination is the plugin's own isolated connection, both already on
 * whatever dialect the instance runs (`resolveDialect()`). Unlike
 * `postgres-migration.ts`, there is no cross-dialect type coercion to do —
 * source and destination tables are byte-for-byte identical in shape (the
 * same migration SQL creates both), so rows copy through as-is.
 *
 * The destination tables must already exist — created the same way the
 * platform always creates an isolated store: `provisionPluginDb` +
 * `runPluginMigrations`, called by the CLI layer before this module does
 * anything (identical sequencing to `postgres-migration.ts`).
 *
 * TRANSITIONAL TOOLING (task 8.28) — exists only to bridge a plugin out of
 * `shared` mode now that the manifest no longer allows declaring it. Once
 * every plugin that was ever `shared` has run this migration (or never had
 * one to begin with), this file (and `sv plugin migrate-to-isolated` in
 * bin/sv.ts, and `__tests__/plugin-isolation-migration.pg.test.ts`) has no
 * further purpose and can be deleted. Search the repo for "TRANSITIONAL
 * TOOLING" to find every file this note appears in.
 */

export class PluginIsolationMigrationError extends Error {}

/**
 * Migrations-tracking table name for provisioning a plugin's brand-new
 * isolated store during its one-time shared → isolated transition.
 *
 * **Deliberately not `pluginMigrationsTableName(pluginId)`** (from
 * `plugin-client.ts`) — a plugin migrating out of `shared` mode already has
 * real migration history recorded under that exact table name, since
 * shared-mode migrations always use it too (to avoid colliding with the
 * platform's own `__drizzle_migrations`). Reusing it here would make
 * Drizzle's migrator see "already applied" against the brand-new, empty
 * isolated schema and silently skip every `CREATE TABLE` — found live
 * migrating `fs.sovereign.tasks`: `__drizzle_migrations_fs_sovereign_tasks`
 * already had 2 rows from its years of shared-mode operation, so
 * provisioning its isolated schema created the schema but zero tables, with
 * no error, until this distinct suffix kept the one-time transition's
 * history independent of it.
 */
export function sharedToIsolatedMigrationsTableName(pluginId: string): string {
  return `__drizzle_migrations_${pluginId.replace(/[.-]/g, '_')}_shared_to_isolated`;
}

export interface IsolationMigrationTableResult {
  table: string;
  sourceRows: number;
  destRows: number;
}

const CREATE_TABLE_RE = /CREATE TABLE\s+(?:IF NOT EXISTS\s+)?[`"]([a-zA-Z_][a-zA-Z0-9_]*)[`"]/gi;

/**
 * Every table a plugin's own migrations create, in first-seen order across
 * its `.sql` files (sorted by filename, matching migration application
 * order). This is the authoritative table list for a `shared` plugin — more
 * reliable than deriving it from a slug-prefix convention, since plugin
 * authors choose their own (often shorter, more readable) table prefix, not
 * a strict function of the manifest id: `fs.sovereign.tasks`'s real tables
 * are `tasks_lists`/`tasks_items`/…, not `fs_sovereign_tasks_lists`.
 */
export function discoverPluginTables(migrationsFolder: string): string[] {
  const files = readdirSync(migrationsFolder)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  const seen = new Set<string>();
  const tables: string[] = [];
  for (const file of files) {
    const contents = readFileSync(join(migrationsFolder, file), 'utf8');
    for (const match of contents.matchAll(CREATE_TABLE_RE)) {
      const table = match[1];
      if (table && !seen.has(table)) {
        seen.add(table);
        tables.push(table);
      }
    }
  }
  return tables;
}

/**
 * Read-only preview of what a migration would copy — row counts per table
 * from the platform source only, without touching the plugin's isolated
 * store at all. Used by `sv plugin migrate-to-isolated --dry-run`.
 */
export async function previewPluginTables(
  tables: string[],
  platformDb: PlatformDb,
): Promise<{ table: string; rows: number }[]> {
  const results: { table: string; rows: number }[] = [];
  for (const table of tables) {
    const rows = await dbAll<{ n: number | string }>(
      platformDb,
      sql`SELECT count(*) AS n FROM ${sql.raw(quoteIdent(table))}`,
    );
    results.push({ table, rows: Number(rows[0]?.n ?? 0) });
  }
  return results;
}

/**
 * Copy every row of every named table from the platform's shared database
 * into the matching (by name) table already present in a plugin's isolated
 * store. The whole copy runs in a single transaction against the
 * destination — either everything lands, or nothing does. The platform
 * source is never modified; a plugin's `shared`-mode tables are left in
 * place after a successful run — dropping them is a deliberate, separate
 * cleanup step, not automatic.
 *
 * Refuses to run if any destination table already has rows: this is a
 * one-time migration, not incremental sync.
 */
export async function migratePluginSharedToIsolated(
  tables: string[],
  platformDb: PlatformDb,
  pluginDb: PluginDb,
): Promise<IsolationMigrationTableResult[]> {
  if (tables.length === 0) {
    throw new PluginIsolationMigrationError('No tables given — nothing to migrate.');
  }
  if (platformDb.dialect !== pluginDb.dialect) {
    // Should be structurally impossible — both are resolved from the same
    // resolveDialect() call in the CLI layer — but a mismatch here would
    // silently corrupt data (e.g. Postgres booleans read as SQLite 0/1), so
    // this is a hard refusal, not a warning.
    throw new PluginIsolationMigrationError(
      `Dialect mismatch: platform is "${platformDb.dialect}" but the plugin's isolated ` +
        `store resolved to "${pluginDb.dialect}" — refusing to migrate.`,
    );
  }

  // Read every source table up front, outside any transaction — the
  // platform source is read-only for this tool's whole lifetime and is
  // never modified, so there is nothing to protect by deferring these reads.
  const sourceRowsByTable = new Map<string, Record<string, unknown>[]>();
  for (const table of tables) {
    const rows = await dbAll<Record<string, unknown>>(
      platformDb,
      sql`SELECT * FROM ${sql.raw(quoteIdent(table))}`,
    );
    sourceRowsByTable.set(table, rows);
  }

  const results: IsolationMigrationTableResult[] = [];

  // Drizzle's `.transaction()` (not manual BEGIN/COMMIT via dbRun) is
  // required for real atomicity on Postgres: pluginDb.db wraps a `Pool`, and
  // a bare `.execute()` call per statement can be handed a different pooled
  // connection each time, so a hand-rolled BEGIN/INSERT…/COMMIT sequence
  // would not actually run on one connection. `.transaction()` checks out a
  // single client for its whole callback on both dialects.
  //
  // Branching on pluginDb.dialect first (rather than calling
  // pluginDb.db.transaction() once on the union type) is required, not
  // stylistic — TypeScript cannot resolve .transaction()'s three overloaded
  // signatures (sync SQLite, async SQLite/libsql, Postgres) across a union
  // of all three; narrowing on .dialect first resolves each branch to a
  // single concrete overload. Same class of issue client.ts's `SqliteDb`
  // type documents for a different method.
  if (pluginDb.dialect === 'sqlite') {
    // Cast to SqliteDb immediately before the call, not stored — same
    // technique client.ts's own SqliteDb type comment documents: it erases
    // the sync/async distinction that otherwise defeats .transaction()'s
    // overload resolution across AnySqliteDb's two concrete classes.
    const sqliteDb = pluginDb.db as unknown as SqliteDb;
    await sqliteDb.transaction(async (tx) => {
      const txDb = { dialect: 'sqlite', db: tx } as unknown as PlatformDb;
      await copyTablesInTransaction(tables, sourceRowsByTable, txDb, results);
    });
  } else {
    await pluginDb.db.transaction(async (tx) => {
      const txDb = { dialect: 'postgres', db: tx } as unknown as PlatformDb;
      await copyTablesInTransaction(tables, sourceRowsByTable, txDb, results);
    });
  }

  return results;
}

/** Shared per-table copy logic run inside either dialect's transaction
 * callback above. `txDb` exposes the same dialect-appropriate query methods
 * as the parent db (get/all/run for SQLite, execute for Postgres) —
 * dbAll/dbRun only ever touch those, so this synthetic PlatformDb-shaped
 * wrapper around the transaction handle lets them work unchanged. */
async function copyTablesInTransaction(
  tables: string[],
  sourceRowsByTable: Map<string, Record<string, unknown>[]>,
  txDb: PlatformDb,
  results: IsolationMigrationTableResult[],
): Promise<void> {
  for (const table of tables) {
    const existing = await dbAll<{ n: number | string }>(
      txDb,
      sql`SELECT count(*) AS n FROM ${sql.raw(quoteIdent(table))}`,
    );
    const existingCount = Number(existing[0]?.n ?? 0);
    if (existingCount > 0) {
      throw new PluginIsolationMigrationError(
        `Destination table "${table}" already has ${existingCount} row(s) — refusing to ` +
          'migrate into it. Drop and recreate the isolated store first if retrying.',
      );
    }

    const rows = sourceRowsByTable.get(table) ?? [];
    for (const row of rows) {
      const columns = Object.keys(row);
      const columnList = sql.join(
        columns.map((c) => sql.raw(quoteIdent(c))),
        sql`, `,
      );
      const valueList = sql.join(
        columns.map((c) => sql`${row[c]}`),
        sql`, `,
      );
      await dbRun(
        txDb,
        sql`INSERT INTO ${sql.raw(quoteIdent(table))} (${columnList}) VALUES (${valueList})`,
      );
    }

    results.push({ table, sourceRows: rows.length, destRows: rows.length });
  }
}

/** Double-quote an identifier — valid unqualified-table/column quoting on
 * both SQLite and Postgres. Callers only ever pass names already validated
 * by CREATE_TABLE_RE (table names) or read back verbatim as raw SQL column
 * names from the platform's own tables (column names) — never user input. */
function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}
