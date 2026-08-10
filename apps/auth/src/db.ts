import { createRequire } from 'node:module';
import type { Client, InArgs } from '@libsql/client';
import type { LibsqlDialect } from '@libsql/kysely-libsql';
import { Pool } from 'pg';

/**
 * The auth server's database. Auth reads the exact same `DB_DIALECT` and
 * `POSTGRES_DB_URL` the platform does — no separate `AUTH_DATABASE_URL`, and
 * therefore no way for auth to end up on a different dialect than the
 * platform (previously a real gap: an operator could set `DB_DIALECT=postgres`
 * and reasonably expect auth to follow, but without also pointing
 * `AUTH_DATABASE_URL` at Postgres, auth silently kept writing to a local
 * SQLite file). Auth gets its own dedicated store — a Postgres schema or an
 * sqld namespace, both named `AUTH_STORE_NAME` below — so better-auth's
 * tables (`user`, `session`, `account`, `verification`, …) can never collide
 * with unrelated platform tables, mirroring how every isolated plugin gets
 * its own schema/namespace (`packages/db/src/plugin-client.ts`).
 *
 * `apps/auth` deliberately doesn't depend on `@sovereignfs/db` (this file
 * duplicates a small amount of its dialect/sqld resolution logic on purpose —
 * service-boundary independence: own Dockerfile, own deploy). Reading the
 * same env var *names* the platform does isn't a violation of that — it's
 * just agreeing on config, not sharing code.
 *
 * better-auth manages its own user/session/account/verification tables
 * (created by its migrator, see ./migrate); we add an `invites` table
 * (invite-only gate), an `auth_settings` table (the Console invite-only
 * toggle), and an auth-local `auth_email_delivery_log` table for
 * authentication email diagnostics. better-auth receives the raw driver via
 * `getAuthDatabase()`; the app's own queries go through the async
 * `authGet`/`authAll`/`authRun` helpers, which paper over the sqld (async,
 * `.get`/`.all`/`.run`) vs node-postgres (async, `.execute`) split.
 *
 * `@libsql/client`/`@libsql/kysely-libsql` are required lazily (via
 * `require`, not a top-level `import`) — found the hard way in production:
 * Next.js's `instrumentation.ts` hook loads outside the webpack-bundled
 * server graph, so the `libsql: false` alias in `next.config.ts` (which stops
 * webpack from pulling in the native binding for the bundled routes) never
 * applies to it. `apps/auth/instrumentation.ts` unconditionally imports this
 * module on every boot, so a top-level `import` of these packages loaded
 * `libsql`'s real native addon eagerly — on every dialect, not just sqld —
 * and crashed instantly on a musl (Alpine) image with no matching prebuilt
 * binary, regardless of whether the sqld path was ever going to be taken.
 * Lazy `require` defers that load to the two call sites that actually
 * construct a client, both already only reached on the sqlite branch.
 */

/** Schema (Postgres) / namespace (sqld) dedicated to the auth database — same
 * name on both dialects for consistency with the naming convention plugins
 * use (`plugin_<slug>` / `plugin_<slug>`), just a fixed name instead of a
 * slug since there's only ever one auth store. */
const AUTH_STORE_NAME = 'sovereign_auth';

const require = createRequire(import.meta.url);

function dbDialect(): 'sqlite' | 'postgres' {
  const explicit = process.env.DB_DIALECT?.toLowerCase();
  if (explicit === 'sqlite' || explicit === 'postgres') return explicit;
  throw new Error(
    `DB_DIALECT is required and must be "sqlite" or "postgres" (got ${
      explicit === undefined || explicit.length === 0 ? 'unset' : `"${explicit}"`
    }).`,
  );
}

function postgresUrl(): string {
  const url = process.env.POSTGRES_DB_URL;
  if (!url) throw new Error('DB_DIALECT=postgres requires POSTGRES_DB_URL to be set.');
  return url;
}

// Defaults target native dev (scripts/ensure-sqld.ts starts sqld on these
// localhost ports — 28080/28081, not sqld's own internal 8080/8081, since
// 8080 is a commonly-squatted local dev port) — must match
// packages/db/src/sqld.ts's identical defaults. Docker Compose deployments
// don't rely on this default; docker-compose.yml/prod.yml set
// SQLD_URL/SQLD_ADMIN_URL explicitly.
function sqldUrl(): string {
  return process.env.SQLD_URL ?? 'http://localhost:28080';
}

function sqldAdminUrl(): string {
  return process.env.SQLD_ADMIN_URL ?? 'http://localhost:28081';
}

/**
 * Provision the auth store before first use — sqld namespaces don't
 * auto-vivify on first query (verified live: an unprovisioned namespace
 * 404s), and a Postgres schema needs `CREATE SCHEMA IF NOT EXISTS`. Call once
 * before `runAuthMigrations()`'s first real query (see `./migrate.ts`). Uses
 * its own short-lived connection rather than `getAuthDb()`'s cached one —
 * that one's Postgres pool already pins `search_path` to a schema that must
 * exist first.
 */
export async function provisionAuthStore(): Promise<void> {
  if (dbDialect() === 'postgres') {
    const pool = new Pool({ connectionString: postgresUrl() });
    try {
      await pool.query(`CREATE SCHEMA IF NOT EXISTS "${AUTH_STORE_NAME}"`);
    } finally {
      await pool.end();
    }
    return;
  }

  const res = await fetch(`${sqldAdminUrl()}/v1/namespaces/${AUTH_STORE_NAME}/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  });
  if (res.ok || res.status === 400) return;
  throw new Error(`Failed to create sqld namespace "${AUTH_STORE_NAME}": ${res.status}`);
}

function createAuthSqldClient(): Client {
  const { createClient } = require('@libsql/client') as typeof import('@libsql/client');
  return createClient({
    url: sqldUrl(),
    fetch: (input: unknown, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      headers.set('x-namespace', AUTH_STORE_NAME);
      return fetch(input as string, { ...init, headers });
    },
  });
}

type AuthDb = { dialect: 'sqlite'; sqld: Client } | { dialect: 'postgres'; pool: Pool };

let _db: AuthDb | undefined;

function getAuthDb(): AuthDb {
  if (_db) return _db;

  if (dbDialect() === 'postgres') {
    // search_path pinned via the connection's startup options (part of the
    // handshake, applied before Postgres accepts any query) rather than a
    // `SET` issued after connecting — same technique and same reasoning as
    // `packages/db/src/plugin-client.ts`'s isolated-plugin pools.
    _db = {
      dialect: 'postgres',
      pool: new Pool({
        connectionString: postgresUrl(),
        options: `-c search_path="${AUTH_STORE_NAME}"`,
      }),
    };
    return _db;
  }

  _db = { dialect: 'sqlite', sqld: createAuthSqldClient() };
  return _db;
}

/** The dialect of the auth database. */
export function getAuthDialect(): 'sqlite' | 'postgres' {
  return getAuthDb().dialect;
}

/**
 * What better-auth's own `database` config option consumes. For Postgres,
 * the raw `Pool` (search_path already pinned to the auth schema) — better-auth
 * auto-detects a `pg` `Pool`. For sqld there's no raw-driver auto-detection
 * (no official better-auth support for libSQL), so this hands better-auth a
 * Kysely `Dialect` + `type: 'sqlite'` instead — the same shape better-auth's
 * own docs use for Cloudflare D1, another non-standard SQLite backend,
 * verified against the installed better-auth@1.6.25's own type definitions
 * (`@better-auth/core`'s `database` option), not just its docs.
 *
 * Deliberately constructs its own `LibsqlDialect` from a `{ url, fetch }`
 * config rather than reusing `getAuthDb()`'s own `Client` (`db.sqld`):
 * `@libsql/kysely-libsql@0.4.1` hard-depends on `@libsql/client@^0.8.0`
 * internally, an older version than the `^0.15.0` this file uses directly —
 * passing a `Client` instance across that boundary is a real type mismatch
 * (found via typecheck, not assumed), not just a style choice. Passing plain
 * config instead means `kysely-libsql` builds its own connection at its own
 * pinned version; both connections still reach the same sqld namespace via
 * the same `x-namespace` header.
 */
export function getAuthDatabase(): Pool | { dialect: LibsqlDialect; type: 'sqlite' } {
  const db = getAuthDb();
  if (db.dialect === 'postgres') return db.pool;

  const { LibsqlDialect } =
    require('@libsql/kysely-libsql') as typeof import('@libsql/kysely-libsql');
  const dialect = new LibsqlDialect({
    url: sqldUrl(),
    fetch: (input: unknown, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      headers.set('x-namespace', AUTH_STORE_NAME);
      return fetch(input as string, { ...init, headers });
    },
  });
  return { dialect, type: 'sqlite' };
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
    // JSON-encoded array of plugin IDs (RFC 0065 Task 1.17); null/absent
    // preserves the original {email}-only invite behavior.
    await authRun('ALTER TABLE invites ADD COLUMN IF NOT EXISTS plugins TEXT');
  } else {
    const cols = await authAll<{ name: string }>('PRAGMA table_info(invites)', []);
    const names = new Set(cols.map((c) => c.name));
    if (!names.has('invited_by_id'))
      await authRun('ALTER TABLE invites ADD COLUMN invited_by_id TEXT');
    if (!names.has('invited_by_name'))
      await authRun('ALTER TABLE invites ADD COLUMN invited_by_name TEXT');
    if (!names.has('plugins')) await authRun('ALTER TABLE invites ADD COLUMN plugins TEXT');
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
 * libsql (sqld) cannot bind booleans; map them to 0/1. Postgres binds
 * natively. Exported for testing.
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
  if (db.dialect === 'postgres') {
    const res = await db.pool.query(toPgPlaceholders(sql), params as unknown[]);
    return res.rows[0] as T | undefined;
  }
  const res = await db.sqld.execute({ sql, args: sqliteParams(params) as InArgs });
  return res.rows[0] as T | undefined;
}

/** Run a query returning all rows. */
export async function authAll<T>(sql: string, params: readonly unknown[] = []): Promise<T[]> {
  const db = getAuthDb();
  if (db.dialect === 'postgres') {
    const res = await db.pool.query(toPgPlaceholders(sql), params as unknown[]);
    return res.rows as T[];
  }
  const res = await db.sqld.execute({ sql, args: sqliteParams(params) as InArgs });
  return res.rows as T[];
}

/** Run a statement for its side effects (INSERT/UPDATE/DDL). */
export async function authRun(sql: string, params: readonly unknown[] = []): Promise<void> {
  const db = getAuthDb();
  if (db.dialect === 'postgres') {
    await db.pool.query(toPgPlaceholders(sql), params as unknown[]);
    return;
  }
  await db.sqld.execute({ sql, args: sqliteParams(params) as InArgs });
}
