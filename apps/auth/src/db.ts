import { existsSync, mkdirSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import Database from 'better-sqlite3';
import { Pool } from 'pg';
import { getEnv } from './env';

/**
 * The auth server's database, dialect-agnostic like the platform DB (NFR-03).
 * The dialect is inferred from the connection URL: a `postgres(ql)://` URL uses
 * node-postgres, anything else a local SQLite file.
 *
 * better-auth manages its own user/session/account/verification tables (created
 * by its migrator, see ./migrate); we add an `invites` table (invite-only gate)
 * an `auth_settings` table (the Console invite-only toggle), and an auth-local
 * `auth_email_delivery_log` table for authentication email diagnostics. better-auth
 * receives the raw driver via `getAuthDatabase()`; the app's own queries go
 * through the async `authGet`/`authAll`/`authRun` helpers, which paper over the
 * better-sqlite3 (sync) vs node-postgres (async) split.
 */

type AuthDb =
  | { dialect: 'sqlite'; sqlite: Database.Database }
  | { dialect: 'postgres'; pool: Pool };

function isPostgresUrl(url: string): boolean {
  return url.startsWith('postgres://') || url.startsWith('postgresql://');
}

/**
 * Convert a `file:` URL to a filesystem path. Relative paths resolve against the
 * workspace root (nearest ancestor with pnpm-workspace.yaml), not the process
 * cwd — the auth server runs from apps/auth/, and all SQLite files should land
 * in the single root-level data/ directory. (Mirrors packages/db; not imported,
 * as the auth server intentionally does not depend on packages/db.)
 */
function toPath(url: string): string {
  if (url === ':memory:') return url;
  const path = url.startsWith('file:') ? url.slice('file:'.length) : url;
  if (isAbsolute(path)) return path;
  return resolve(findWorkspaceRoot(), path);
}

function findWorkspaceRoot(): string {
  let dir = process.cwd();
  for (;;) {
    if (existsSync(join(dir, 'pnpm-workspace.yaml'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return process.cwd();
    dir = parent;
  }
}

let _db: AuthDb | undefined;

function getAuthDb(): AuthDb {
  if (_db) return _db;
  const url = getEnv().databaseUrl;

  if (isPostgresUrl(url)) {
    _db = { dialect: 'postgres', pool: new Pool({ connectionString: url }) };
    return _db;
  }

  const path = toPath(url);
  if (path !== ':memory:') {
    mkdirSync(dirname(path), { recursive: true });
  }
  const sqlite = new Database(path);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  _db = { dialect: 'sqlite', sqlite };
  return _db;
}

/** The dialect of the auth database. */
export function getAuthDialect(): 'sqlite' | 'postgres' {
  return getAuthDb().dialect;
}

/**
 * The raw driver better-auth manages directly (a better-sqlite3 `Database` for
 * SQLite, a node-postgres `Pool` for Postgres). better-auth detects the dialect
 * from the instance.
 */
export function getAuthDatabase(): Database.Database | Pool {
  const db = getAuthDb();
  return db.dialect === 'sqlite' ? db.sqlite : db.pool;
}

/** Create the auth server's own tables (invites, auth_settings). Idempotent. */
export async function ensureAuthTables(): Promise<void> {
  const dialect = getAuthDialect();
  const ts = dialect === 'postgres' ? 'BIGINT' : 'INTEGER';
  await authRun(
    `CREATE TABLE IF NOT EXISTS invites (
      token TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      created_at ${ts} NOT NULL,
      expires_at ${ts},
      consumed_at ${ts}
    )`,
  );
  // Columns added after initial schema — must be patched idempotently.
  if (dialect === 'postgres') {
    await authRun('ALTER TABLE invites ADD COLUMN IF NOT EXISTS invited_by_id TEXT');
    await authRun('ALTER TABLE invites ADD COLUMN IF NOT EXISTS invited_by_name TEXT');
  } else {
    const cols = await authAll<{ name: string }>('PRAGMA table_info(invites)', []);
    const names = new Set(cols.map((c) => c.name));
    if (!names.has('invited_by_id'))
      await authRun('ALTER TABLE invites ADD COLUMN invited_by_id TEXT');
    if (!names.has('invited_by_name'))
      await authRun('ALTER TABLE invites ADD COLUMN invited_by_name TEXT');
  }
  await authRun(
    `CREATE TABLE IF NOT EXISTS auth_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at ${ts} NOT NULL
    )`,
  );
  await authRun(
    `CREATE TABLE IF NOT EXISTS auth_email_delivery_log (
      id TEXT PRIMARY KEY,
      created_at ${ts} NOT NULL,
      delivery_class TEXT NOT NULL,
      template_id TEXT NOT NULL,
      source TEXT NOT NULL,
      recipient_user_id TEXT,
      recipient_email_hash TEXT,
      actor_user_id TEXT,
      status TEXT NOT NULL,
      provider_message_id TEXT,
      error_code TEXT,
      metadata TEXT
    )`,
  );
}

/** Rewrite `?` positional placeholders to Postgres `$1, $2, …`. Exported for testing. */
export function toPgPlaceholders(sql: string): string {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

/**
 * better-sqlite3 cannot bind booleans; map them to 0/1. Postgres binds natively.
 * Exported for testing.
 */
export function sqliteParams(params: readonly unknown[]): unknown[] {
  return params.map((p) => (typeof p === 'boolean' ? (p ? 1 : 0) : p));
}

/** Run a query returning at most one row. */
export async function authGet<T>(
  sql: string,
  params: readonly unknown[] = [],
): Promise<T | undefined> {
  const db = getAuthDb();
  if (db.dialect === 'sqlite') {
    return db.sqlite.prepare(sql).get(...sqliteParams(params)) as T | undefined;
  }
  const res = await db.pool.query(toPgPlaceholders(sql), params as unknown[]);
  return res.rows[0] as T | undefined;
}

/** Run a query returning all rows. */
export async function authAll<T>(sql: string, params: readonly unknown[] = []): Promise<T[]> {
  const db = getAuthDb();
  if (db.dialect === 'sqlite') {
    return db.sqlite.prepare(sql).all(...sqliteParams(params)) as T[];
  }
  const res = await db.pool.query(toPgPlaceholders(sql), params as unknown[]);
  return res.rows as T[];
}

/** Run a statement for its side effects (INSERT/UPDATE/DDL). */
export async function authRun(sql: string, params: readonly unknown[] = []): Promise<void> {
  const db = getAuthDb();
  if (db.dialect === 'sqlite') {
    db.sqlite.prepare(sql).run(...sqliteParams(params));
    return;
  }
  await db.pool.query(toPgPlaceholders(sql), params as unknown[]);
}
