import { dirname, join } from 'node:path';
import { mkdirSync, readFileSync, unlinkSync } from 'node:fs';
import Database from 'better-sqlite3';
import { drizzle as drizzleSqlite } from 'drizzle-orm/better-sqlite3';
import { drizzle as drizzlePg } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { findWorkspaceRoot, pgSslMode, resolveSqlitePath } from './client';
import { resolveDialect, type Dialect, type ResolvedDialect } from './dialect';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySqliteDb = ReturnType<typeof drizzleSqlite<any>>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyPgDb = ReturnType<typeof drizzlePg<any>>;

/**
 * A dialect-tagged database client for an isolated plugin store.
 * The schema is plugin-defined (not typed here), so `.db` is the raw Drizzle
 * instance the plugin passes its own table declarations to.
 */
export type PluginDb =
  | { dialect: 'sqlite'; db: AnySqliteDb }
  | { dialect: 'postgres'; db: AnyPgDb };

/** In-process lazy registry: pluginId → PluginDb */
const _registry = new Map<string, PluginDb>();

function resolvePluginDialect(dialect?: Dialect): ResolvedDialect {
  const platform = resolveDialect(process.env);
  if (!dialect) return platform;
  if (dialect === 'postgres' && platform.dialect === 'sqlite') {
    throw new Error('Cannot resolve a Postgres plugin database on a SQLite platform.');
  }
  return { ...platform, dialect };
}

function registryKey(pluginId: string, dialect: Dialect): string {
  return `${dialect}:${pluginId}`;
}

/**
 * Postgres schema name for an isolated plugin.
 * Dots and hyphens map to underscores: `fs.sovereign.tasks` → `plugin_fs_sovereign_tasks`.
 */
export function pluginSchemaName(pluginId: string): string {
  return `plugin_${pluginId.replace(/[.-]/g, '_')}`;
}

/**
 * SQLite file URL for an isolated plugin. Resolves against the workspace root
 * via `resolveSqlitePath` so the file always lands in `data/plugins/`.
 */
export function pluginSqliteUrl(pluginId: string): string {
  return `file:./data/plugins/${pluginId}.db`;
}

function pgSsl(url: string): false | { rejectUnauthorized: boolean; ca?: string } {
  const mode = pgSslMode(url);
  if (mode === null) return false;
  const caPath = process.env.PGSSLROOTCERT;
  const ca = caPath ? readFileSync(caPath, 'utf8') : undefined;
  return { rejectUnauthorized: mode === 'verify', ...(ca ? { ca } : {}) };
}

/**
 * Get (or lazily create and cache) the Drizzle client for an isolated plugin.
 *
 * - **SQLite:** opens `data/plugins/<pluginId>.db` in WAL mode.
 * - **Postgres:** opens a new Pool targeting the same server as the platform
 *   DB, but with `search_path` set to `plugin_<slug>` on every new connection.
 *   The schema must already exist (call `provisionPluginDb` first).
 */
export function getPluginDb(pluginId: string, dialect?: Dialect): PluginDb {
  const resolved = resolvePluginDialect(dialect);
  const cacheKey = registryKey(pluginId, resolved.dialect);
  const cached = _registry.get(cacheKey);
  if (cached) return cached;

  if (resolved.dialect === 'sqlite') {
    const path = resolveSqlitePath(pluginSqliteUrl(pluginId));
    mkdirSync(dirname(path), { recursive: true });
    const sqlite = new Database(path);
    sqlite.pragma('journal_mode = WAL');
    sqlite.pragma('foreign_keys = ON');
    const pdb: PluginDb = { dialect: 'sqlite', db: drizzleSqlite(sqlite) };
    _registry.set(cacheKey, pdb);
    return pdb;
  }

  // Postgres: dedicated pool with search_path scoped to the plugin's schema.
  const schema = pluginSchemaName(pluginId);
  const pool = new Pool({ connectionString: resolved.url, ssl: pgSsl(resolved.url) });
  pool.on('connect', (client) => {
    void client.query(`SET search_path TO "${schema}"`);
  });
  const pdb: PluginDb = { dialect: 'postgres', db: drizzlePg(pool) };
  _registry.set(cacheKey, pdb);
  return pdb;
}

/**
 * Provision the store for an isolated plugin:
 * - SQLite: the file is created lazily by `getPluginDb`, so this is a no-op.
 * - Postgres: runs `CREATE SCHEMA IF NOT EXISTS "plugin_<slug>"` so subsequent
 *   migrations and queries can use the schema.
 *
 * Safe to call multiple times (idempotent).
 */
export async function provisionPluginDb(pluginId: string, dialect?: Dialect): Promise<void> {
  const resolved = resolvePluginDialect(dialect);
  if (resolved.dialect === 'sqlite') return; // file created on first open

  const schema = pluginSchemaName(pluginId);
  const pool = new Pool({ connectionString: resolved.url, ssl: pgSsl(resolved.url) });
  try {
    await pool.query(`CREATE SCHEMA IF NOT EXISTS "${schema}"`);
  } finally {
    await pool.end();
  }
}

/**
 * Drop the entire store for an isolated plugin (called on uninstall/purge).
 * - SQLite: deletes the `.db`, `-wal`, and `-shm` files.
 * - Postgres: runs `DROP SCHEMA IF EXISTS "plugin_<slug>" CASCADE`.
 *
 * Evicts the client from the in-process registry so any subsequent call to
 * `getPluginDb` would open a fresh connection (which would fail — store gone).
 */
export async function dropPluginDb(pluginId: string, dialect?: Dialect): Promise<void> {
  const resolved = resolvePluginDialect(dialect);
  _registry.delete(registryKey(pluginId, 'sqlite'));
  _registry.delete(registryKey(pluginId, 'postgres'));

  if (resolved.dialect === 'sqlite') {
    const path = resolveSqlitePath(pluginSqliteUrl(pluginId));
    for (const suffix of ['', '-wal', '-shm']) {
      try {
        unlinkSync(path + suffix);
      } catch {
        // File may not exist (plugin never accessed the DB)
      }
    }
    return;
  }

  const schema = pluginSchemaName(pluginId);
  const pool = new Pool({ connectionString: resolved.url, ssl: pgSsl(resolved.url) });
  try {
    await pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  } finally {
    await pool.end();
  }
}

/**
 * Migrations folder for a plugin's isolated store.
 * Plugins place migration files at `plugins/<dir>/migrations/{sqlite,postgres}/`.
 */
export function pluginMigrationsFolder(pluginDir: string, dialect: 'sqlite' | 'postgres'): string {
  return join(findWorkspaceRoot(), pluginDir, 'migrations', dialect);
}
