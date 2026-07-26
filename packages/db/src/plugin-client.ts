import { dirname, join } from 'node:path';
import { mkdirSync, readFileSync, unlinkSync } from 'node:fs';
import { drizzle as drizzleSqlite } from 'drizzle-orm/better-sqlite3';
import { drizzle as drizzlePg } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { findWorkspaceRoot, pgSslMode, resolveSqlitePath } from './client';
import { resolveDialect, type Dialect, type ResolvedDialect } from './dialect';
import {
  dbEncryptionKeyFromEnv,
  defaultDataDir,
  openKeyedSqlite,
  resolvePluginEncryptionKey,
} from './sqlite-encryption';

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

/**
 * Drizzle migrations-tracking table for a `database: "shared"` plugin.
 *
 * Drizzle's own migrator (`sqlite-core`/`pg-core` dialect.migrate()) tracks
 * "already applied" purely by comparing each migration's folder timestamp
 * against the single most recent `created_at` row in the table — it has no
 * per-plugin or per-hash lookup. Sharing the default `__drizzle_migrations`
 * table between the platform's own migrations and a plugin's migrations means
 * whichever history has the later timestamps makes the other's migrations
 * look "already applied" and silently skips them forever. Giving every
 * shared-mode plugin its own uniquely-named table keeps each history
 * independent, mirroring `pluginSchemaName`'s naming convention.
 */
export function pluginMigrationsTableName(pluginId: string): string {
  return `__drizzle_migrations_${pluginId.replace(/[.-]/g, '_')}`;
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
 * - **SQLite:** opens `data/plugins/<pluginId>.db` in WAL mode. Encrypted only
 *   if `requiresEncryption` is true (the plugin's own manifest
 *   `database.requireEncryption`, per task 8.15) — the instance-wide
 *   `SOVEREIGN_DB_ENCRYPTION_KEY` is never applied to a plugin that never
 *   asked for it, regardless of whether the key is configured. See
 *   `resolvePluginEncryptionKey` for the full per-database decision.
 * - **Postgres:** opens a new Pool targeting the same server as the platform
 *   DB, but with `search_path` pinned to `plugin_<slug>` via the connection's
 *   startup options (not a `SET` issued after connecting — see the comment
 *   at the Pool construction below for why that distinction matters).
 *   The schema must already exist (call `provisionPluginDb` first).
 */
export function getPluginDb(
  pluginId: string,
  dialect?: Dialect,
  requiresEncryption = false,
): PluginDb {
  const resolved = resolvePluginDialect(dialect);
  const cacheKey = registryKey(pluginId, resolved.dialect);
  const cached = _registry.get(cacheKey);
  if (cached) return cached;

  if (resolved.dialect === 'sqlite') {
    const path = resolveSqlitePath(pluginSqliteUrl(pluginId));
    mkdirSync(dirname(path), { recursive: true });
    const envKey = dbEncryptionKeyFromEnv();
    const key = resolvePluginEncryptionKey(
      defaultDataDir(),
      pluginId,
      path,
      envKey,
      requiresEncryption,
    );
    const sqlite = openKeyedSqlite(path, key);
    const pdb: PluginDb = { dialect: 'sqlite', db: drizzleSqlite(sqlite) };
    _registry.set(cacheKey, pdb);
    return pdb;
  }

  // Postgres: dedicated pool with search_path scoped to the plugin's schema.
  //
  // Pinned via the connection's startup options (`-c search_path=...`), not a
  // `SET` issued from a `pool.on('connect', ...)` handler — that handler
  // fires when the socket connects, but the pool does not wait for its
  // (possibly async) body to finish before handing the same client to
  // whichever query is waiting on it. A `void`-ed, unawaited `client.query()`
  // there races the caller's own first query on that connection.
  // node-postgres's Client currently queues an overlapping call rather than
  // interleaving it (verified: 0/30 wrong-schema reads under concurrent load
  // in testing), so this hasn't been an active data-isolation bug — but it
  // surfaces as "Calling client.query() when the client is already executing
  // a query", a deprecation warning explicitly flagged for removal in pg@9.0,
  // at which point the same pattern becomes a hard failure instead of a
  // log-noise nuisance. Startup options sidestep the whole pattern: they're
  // part of the connection handshake itself, applied before Postgres accepts
  // any query on the connection, so there's nothing to race or queue behind.
  const schema = pluginSchemaName(pluginId);
  const pool = new Pool({
    connectionString: resolved.url,
    ssl: pgSsl(resolved.url),
    options: `-c search_path="${schema}"`,
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
 * If this plugin's Postgres pool was ever actually opened in this process
 * (via a prior `getPluginDb` call), it's ended here too — otherwise its
 * connections leak (evicting the registry entry only drops the reference;
 * node-postgres doesn't close sockets on GC), accumulating toward the
 * server's connection limit across repeated install/uninstall cycles.
 */
export async function dropPluginDb(pluginId: string, dialect?: Dialect): Promise<void> {
  const resolved = resolvePluginDialect(dialect);
  const cachedPostgres = _registry.get(registryKey(pluginId, 'postgres'));
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

  if (cachedPostgres?.dialect === 'postgres') {
    await cachedPostgres.db.$client.end().catch(() => {
      // Best-effort — the pool may already be unusable (e.g. the connection
      // was already lost); the schema drop below is what actually matters.
    });
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
