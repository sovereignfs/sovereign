import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import Database from 'better-sqlite3';
import { type BetterSQLite3Database, drizzle as drizzleSqlite } from 'drizzle-orm/better-sqlite3';
import { type NodePgDatabase, drizzle as drizzlePg } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { type Dialect, resolveDialect } from './dialect';
import * as pgSchema from './schema/postgres';
import * as sqliteSchema from './schema/sqlite';

export interface DbConfig {
  /** Override the resolved dialect. Defaults to the environment resolution. */
  dialect?: Dialect;
  /** Override the connection URL. Defaults to the environment resolution. */
  url?: string;
}

/**
 * A dialect-tagged platform database client. The `dialect` tag drives portable
 * execution (see ./exec) so the same query runs on SQLite (better-sqlite3,
 * synchronous) and Postgres (node-postgres, async). Both dialects expose the
 * same logical schema (see ./schema/{sqlite,postgres}).
 */
export type PlatformDb =
  | { dialect: 'sqlite'; db: BetterSQLite3Database<typeof sqliteSchema> }
  | { dialect: 'postgres'; db: NodePgDatabase<typeof pgSchema> };

/**
 * Create a Drizzle client for the configured dialect. SQLite opens a
 * better-sqlite3 file (WAL, foreign keys on); Postgres opens a node-postgres
 * connection pool. The dialect is resolved from the environment unless
 * overridden via `config`.
 */
export function createClient(config: DbConfig = {}): PlatformDb {
  const resolved = resolveDialect({
    ...process.env,
    ...(config.dialect ? { DB_DIALECT: config.dialect } : {}),
    ...(config.url ? { DATABASE_URL: config.url } : {}),
  });

  if (resolved.dialect === 'sqlite') {
    const path = resolveSqlitePath(resolved.url);
    if (path !== ':memory:') {
      mkdirSync(dirname(path), { recursive: true });
    }
    const sqlite = new Database(path);
    sqlite.pragma('journal_mode = WAL');
    sqlite.pragma('foreign_keys = ON');
    return { dialect: 'sqlite', db: drizzleSqlite(sqlite, { schema: sqliteSchema }) };
  }

  // node-postgres: the pool connects lazily, so constructing it never blocks or
  // throws here — the first query establishes the connection. TLS is driven by
  // the connection string's `sslmode` (RFC 0008 Tier 1).
  const pool = new Pool({ connectionString: resolved.url, ssl: pgSsl(resolved.url) });
  return { dialect: 'postgres', db: drizzlePg(pool, { schema: pgSchema }) };
}

/**
 * Normalise the `sslmode` query param of a Postgres URL to the posture the
 * driver should take (RFC 0008 Tier 1):
 *   - absent / `disable` → `null` (no TLS),
 *   - `verify-ca` / `verify-full` → `'verify'` (encrypt and verify the server cert),
 *   - anything else (`require`/`prefer`/`allow`) → `'require'` (encrypt, no verify).
 * Pure (no I/O) so it is unit-testable; `pgSsl` adds the CA file read.
 */
export function pgSslMode(url: string): 'require' | 'verify' | null {
  let sslmode: string | null;
  try {
    sslmode = new URL(url).searchParams.get('sslmode');
  } catch {
    return null;
  }
  if (!sslmode || sslmode === 'disable') return null;
  return sslmode === 'verify-ca' || sslmode === 'verify-full' ? 'verify' : 'require';
}

/**
 * node-postgres `ssl` option for a connection string. `verify-*` modes verify
 * the server certificate (supply the CA PEM via the standard `PGSSLROOTCERT`
 * env var); `require` encrypts without verification. `false` disables TLS.
 */
function pgSsl(url: string): false | { rejectUnauthorized: boolean; ca?: string } {
  const mode = pgSslMode(url);
  if (mode === null) return false;
  const caPath = process.env.PGSSLROOTCERT;
  const ca = caPath ? readFileSync(caPath, 'utf8') : undefined;
  return { rejectUnauthorized: mode === 'verify', ...(ca ? { ca } : {}) };
}

/**
 * Convert a `file:` URL to a filesystem path. Relative paths resolve against
 * the workspace root (nearest ancestor with pnpm-workspace.yaml), not the
 * process cwd — apps run from their own package directories (runtime/,
 * apps/auth/), and all SQLite files should land in the single root-level
 * data/ directory. Falls back to cwd outside a workspace (standalone builds).
 */
export function resolveSqlitePath(url: string): string {
  if (url === ':memory:') return url;
  const path = url.startsWith('file:') ? url.slice('file:'.length) : url;
  if (isAbsolute(path)) return path;
  return resolve(findWorkspaceRoot(), path);
}

/**
 * Locate the workspace root: the nearest ancestor of the cwd containing
 * pnpm-workspace.yaml, falling back to the cwd itself (standalone builds).
 */
export function findWorkspaceRoot(): string {
  let dir = process.cwd();
  for (;;) {
    if (existsSync(join(dir, 'pnpm-workspace.yaml'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return process.cwd();
    dir = parent;
  }
}
