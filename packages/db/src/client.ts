import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { type BetterSQLite3Database, drizzle as drizzleSqlite } from 'drizzle-orm/better-sqlite3';
import { type LibSQLDatabase, drizzle as drizzleLibsql } from 'drizzle-orm/libsql';
import { type NodePgDatabase, drizzle as drizzlePg } from 'drizzle-orm/node-postgres';
import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core';
import { Pool } from 'pg';
import { type Dialect, resolveDialect } from './dialect';
import * as pgSchema from './schema/postgres';
import * as sqliteSchema from './schema/sqlite';
import { createSqldClient, sqldUrl } from './sqld';
import {
  checkEncryptionMarker,
  dbEncryptionKeyFromEnv,
  defaultDataDir,
  openKeyedSqlite,
} from './sqlite-encryption';

export interface DbConfig {
  /** Override the resolved dialect. Defaults to the environment resolution. */
  dialect?: Dialect;
  /** Override the connection URL. Defaults to the environment resolution. */
  url?: string;
}

/**
 * A dialect-tagged platform database client. The `dialect` tag drives portable
 * execution (see ./exec) so the same query runs on SQLite (better-sqlite3
 * synchronous, or libsql/sqld async under the RFC 0071 encryption carve-out —
 * see `createClient` below) and Postgres (node-postgres, async). All three
 * expose the same logical schema (see ./schema/{sqlite,postgres}).
 */
export type PlatformDb =
  | {
      dialect: 'sqlite';
      db: BetterSQLite3Database<typeof sqliteSchema> | LibSQLDatabase<typeof sqliteSchema>;
    }
  | { dialect: 'postgres'; db: NodePgDatabase<typeof pgSchema> };

/**
 * A single-class view of `PlatformDb`/`PluginDb`'s sqlite branch, for call
 * sites that invoke overloaded Drizzle query-builder methods (`.select()`
 * with a column projection, etc.) directly against `.db`. TypeScript does not
 * correctly resolve overloaded methods across a union of two classes
 * (`BetterSQLite3Database | LibSQLDatabase`) even though both share this
 * common base and behave identically for query *construction* — only the
 * `resultKind` (`'sync'`/`'async'`) differs, and `await` already handles that
 * uniformly at the call site. Cast to this type immediately before the call,
 * not stored — it erases the sync/async distinction `await` still needs.
 */
export type SqliteDb = BaseSQLiteDatabase<'sync' | 'async', unknown, typeof sqliteSchema>;

/**
 * Create a Drizzle client for the configured dialect. Postgres opens a
 * node-postgres connection pool. SQLite opens one of two backends depending
 * on the RFC 0071 encryption carve-out (RFC 0091):
 *
 * - `SOVEREIGN_DB_ENCRYPTION_KEY` set → plain-file `better-sqlite3` (WAL,
 *   foreign keys on), unchanged from before workstream 0009 — RFC 0071's
 *   guarantee has no equivalent in sqld today (RFC 0091), so an encrypted
 *   instance stays here regardless of the dialect migration.
 * - No key configured → sqld (libSQL server), the platform DB's default
 *   sqld namespace. No admin-API provisioning needed for this one namespace
 *   (unlike every named plugin namespace in `plugin-client.ts`) — sqld
 *   creates its own default namespace itself.
 *
 * The dialect is resolved from the environment unless overridden via `config`.
 *
 * **Known gap, not yet handled by this leg:** enabling encryption on an
 * instance that has been running unencrypted (and therefore on sqld) does
 * not migrate that data. `checkEncryptionMarker`'s "fresh instance" fast path
 * only checks for local `sovereign.db`/`auth.db` *files* — an sqld-backed
 * instance has none, so it looks identical to a genuinely empty instance and
 * silently opens a brand-new, empty encrypted file, orphaning the real data
 * sitting in sqld's default namespace with no error. The reverse direction
 * (leg 4's plain-file → sqld cutover) is a documented, deliberate one-time
 * migration; this direction has no equivalent tool yet. Needs one before this
 * is safe to document as a supported operator flow.
 */
export function createClient(config: DbConfig = {}): PlatformDb {
  const resolved = resolveDialect({
    ...process.env,
    ...(config.dialect ? { DB_DIALECT: config.dialect } : {}),
    ...(config.url ? { DATABASE_URL: config.url } : {}),
  });

  if (resolved.dialect === 'sqlite') {
    const key = dbEncryptionKeyFromEnv();
    const path = resolveSqlitePath(resolved.url);

    // :memory: (test-only, via an explicit config.url override — never the
    // env-resolved default) never goes to sqld: there's no real data to
    // protect or migrate, and sqld has no equivalent of "ephemeral, isolated
    // per test process". Falls straight through to the plain-file branch,
    // which already handles :memory: (openKeyedSqlite, no mkdirSync).
    if (path !== ':memory:') {
      // Runs regardless of which branch below is taken — including the sqld
      // one. This is what catches "this instance's data was encrypted, but
      // the key is now missing" and refuses to proceed; skipping it in the
      // sqld branch would let that exact misconfiguration silently open an
      // empty sqld namespace instead of failing loudly.
      checkEncryptionMarker(defaultDataDir(), key !== undefined);

      if (key === undefined) {
        const client = createSqldClient(sqldUrl(process.env));
        return { dialect: 'sqlite', db: drizzleLibsql(client, { schema: sqliteSchema }) };
      }

      mkdirSync(dirname(path), { recursive: true });
    }

    const sqlite = openKeyedSqlite(path, key);
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
