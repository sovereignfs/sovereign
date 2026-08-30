import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import type { LibSQLDatabase } from 'drizzle-orm/libsql';
import { type NodePgDatabase, drizzle as drizzlePg } from 'drizzle-orm/node-postgres';
import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core';
import { Pool } from 'pg';
import { type Dialect, resolveDialect } from './dialect';
import * as pgSchema from './schema/postgres';
import * as sqliteSchema from './schema/sqlite';
import { createSqldClient, sqldUrl } from './sqld';

// `drizzle-orm/libsql`'s own entry point statically imports `@libsql/client`
// (its driver.js does `import { createClient } from "@libsql/client"` at top
// level) — required lazily here for the same reason `sqld.ts` requires
// `@libsql/client` itself lazily; see that file's doc comment for the full
// story (found via a production crash: instrumentation-hook loading bypasses
// the webpack alias that hides this for the bundled route graph).
const require = createRequire(import.meta.url);

export interface DbConfig {
  /** Override the resolved dialect. Defaults to the environment resolution. */
  dialect?: Dialect;
  /** Postgres only: override the connection URL. Defaults to POSTGRES_DB_URL. */
  url?: string;
  /** SQLite only: override the sqld namespace. Defaults to sqld's own default namespace. */
  namespace?: string;
}

/**
 * A dialect-tagged platform database client. The `dialect` tag drives portable
 * execution (see ./exec) so the same query runs on SQLite (libsql/sqld, async)
 * and Postgres (node-postgres, async). Both expose the same logical schema
 * (see ./schema/{sqlite,postgres}).
 */
export type PlatformDb =
  | { dialect: 'sqlite'; db: LibSQLDatabase<typeof sqliteSchema> }
  | { dialect: 'postgres'; db: NodePgDatabase<typeof pgSchema> & { $client: Pool } };

/**
 * A single-class view of `PlatformDb`/`PluginDb`'s sqlite branch, for call
 * sites that invoke overloaded Drizzle query-builder methods directly against
 * `.db`. Kept even though there is now only one concrete SQLite backend
 * (libsql) — some call sites still branch on dialect before calling
 * `.transaction()`/etc., and casting through this shared base type keeps that
 * working uniformly regardless of which concrete class is behind it.
 */
export type SqliteDb = BaseSQLiteDatabase<'async', unknown, typeof sqliteSchema>;

/**
 * Create a Drizzle client for the configured dialect. SQLite is always
 * sqld-backed (libSQL server) — no plain-file fallback, no at-rest encryption
 * carve-out (that's deferred; see the platform's own tracking for the
 * follow-up). Postgres opens a node-postgres connection pool against
 * `POSTGRES_DB_URL`.
 *
 * The dialect is resolved from the environment unless overridden via `config`.
 */
export function createClient(config: DbConfig = {}): PlatformDb {
  const resolved = resolveDialect({
    ...process.env,
    ...(config.dialect ? { DB_DIALECT: config.dialect } : {}),
    ...(config.dialect === 'postgres' && config.url ? { POSTGRES_DB_URL: config.url } : {}),
  });

  if (resolved.dialect === 'sqlite') {
    const { drizzle: drizzleLibsql } =
      require('drizzle-orm/libsql') as typeof import('drizzle-orm/libsql');
    const client = createSqldClient(sqldUrl(process.env), config.namespace);
    return { dialect: 'sqlite', db: drizzleLibsql(client, { schema: sqliteSchema }) };
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
