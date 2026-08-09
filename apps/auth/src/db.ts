import { existsSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import type { Client, InArgs } from '@libsql/client';
import type { LibsqlDialect } from '@libsql/kysely-libsql';
import Database from 'better-sqlite3-multiple-ciphers';
import { Pool } from 'pg';
import { getEnv } from './env';
import {
  checkEncryptionMarker,
  dbEncryptionKeyFromEnv,
  openKeyedSqlite,
} from './sqlite-encryption';

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
 *
 * RFC 0091's encryption carve-out (workstream 0009 leg 3): when
 * `SOVEREIGN_DB_ENCRYPTION_KEY` is unset, the SQLite path routes to sqld
 * instead of a plain-file `auth.db` — RFC 0071's guarantee has no equivalent
 * in sqld today, so an encrypted instance stays on the plain-file path
 * regardless. `apps/auth` deliberately doesn't depend on `@sovereignfs/db`
 * (this file duplicates `packages/db/src/client.ts`'s dialect resolution on
 * purpose — see below), so the small amount of sqld-specific glue here is
 * duplicated too rather than shared; `@libsql/client`/`@libsql/kysely-libsql`
 * are third-party npm packages, not `@sovereignfs/db` internals, so this
 * doesn't violate that boundary.
 *
 * `@libsql/client`/`@libsql/kysely-libsql` are required lazily (via `require`,
 * not a top-level `import`) — found the hard way in production: Next.js's
 * `instrumentation.ts` hook loads outside the webpack-bundled server graph, so
 * the `libsql: false` alias in `next.config.ts` (which stops webpack from
 * pulling in the native binding for the bundled routes) never applies to it.
 * `apps/auth/instrumentation.ts` unconditionally imports this module on every
 * boot, so a top-level `import` of these packages loaded `libsql`'s real
 * native addon eagerly — on every dialect, not just sqld — and crashed
 * instantly on a musl (Alpine) image with no matching prebuilt binary,
 * regardless of whether the sqld path was ever going to be taken. Lazy
 * `require` defers that load to the two call sites that actually construct a
 * client, both already only reached on the sqld branch.
 */

/** sqld namespace dedicated to the auth database — kept separate from the
 * platform DB's default namespace so better-auth's tables (`user`, `session`,
 * …) can never collide with unrelated platform tables, mirroring today's
 * separate `auth.db`/`sovereign.db` files. */
const SQLD_AUTH_NAMESPACE = 'auth';

const require = createRequire(import.meta.url);

function sqldUrl(): string {
  return process.env.SQLD_URL ?? 'http://sqld:8080';
}

function sqldAdminUrl(): string {
  return process.env.SQLD_ADMIN_URL ?? 'http://sqld:8081';
}

/**
 * Create the auth database's sqld namespace (idempotent — a `400 already
 * exists` response is treated as success, verified live against a real
 * `--enable-namespaces` instance). Namespaces don't auto-vivify on first
 * query (verified live: an unprovisioned namespace 404s), so this must run
 * once before `runAuthMigrations()`'s first real query — see
 * `apps/auth/src/migrate.ts`.
 */
export async function provisionAuthSqldNamespace(): Promise<void> {
  // Fail fast here too, before any namespace gets created — this runs before
  // getAuthDb() in the startup sequence (see runAuthMigrations), and a
  // mismatch would otherwise provision a namespace no one uses before the
  // error ever surfaces.
  assertAuthDialectMatchesPlatform(getEnv().databaseUrl);

  // Same ':memory:' carve-out as getAuthDb() and assertAuthDialectMatchesPlatform
  // above — ephemeral test storage never touches sqld, regardless of whether an
  // encryption key is set. Missing this sent every plain (no-encryption-key)
  // ':memory:' caller here into the fetch below, which fails with
  // "getaddrinfo ENOTFOUND sqld" outside Docker Compose's network — found
  // empirically while calling runAuthMigrations() against a throwaway instance.
  if (getEnv().databaseUrl === ':memory:') return;

  if (dbEncryptionKeyFromEnv() !== undefined) return; // plain-file path, no namespace involved
  if (isPostgresUrl(getEnv().databaseUrl)) return;

  const res = await fetch(`${sqldAdminUrl()}/v1/namespaces/${SQLD_AUTH_NAMESPACE}/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  });
  if (res.ok || res.status === 400) return;
  throw new Error(`Failed to create sqld namespace "${SQLD_AUTH_NAMESPACE}": ${res.status}`);
}

function createAuthSqldClient(): Client {
  const { createClient } = require('@libsql/client') as typeof import('@libsql/client');
  return createClient({
    url: sqldUrl(),
    fetch: (input: unknown, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      headers.set('x-namespace', SQLD_AUTH_NAMESPACE);
      return fetch(input as string, { ...init, headers });
    },
  });
}

type AuthDb =
  | { dialect: 'sqlite'; sqlite: Database.Database }
  | { dialect: 'sqlite'; sqld: Client }
  | { dialect: 'postgres'; pool: Pool };

function isPostgresUrl(url: string): boolean {
  return url.startsWith('postgres://') || url.startsWith('postgresql://');
}

/** The two env vars `resolvePlatformDialect`/`assertAuthDialectMatchesPlatform` read. Narrower
 * than `NodeJS.ProcessEnv` on purpose — Next.js augments that global type to require `NODE_ENV`,
 * which would force every caller (including tests) to fake a full process env just to pass one. */
interface PlatformDialectEnv {
  DB_DIALECT?: string;
  DATABASE_URL?: string;
}

/**
 * The platform's own resolved dialect — `packages/db/src/dialect.ts`'s
 * `resolveDialect()`, duplicated here for the same reason the rest of this
 * file duplicates `packages/db` logic: the auth server intentionally does
 * not depend on it. `DB_DIALECT` is authoritative when set; otherwise the
 * dialect is inferred from `DATABASE_URL`'s scheme, defaulting to SQLite —
 * must stay identical to `resolveDialect()`'s own default, or this and the
 * platform could each infer a different "default" dialect from the same
 * unset env.
 */
function resolvePlatformDialect(env: PlatformDialectEnv): 'sqlite' | 'postgres' {
  const explicit = env.DB_DIALECT?.toLowerCase();
  if (explicit === 'sqlite' || explicit === 'postgres') return explicit;
  const url = env.DATABASE_URL ?? 'file:./data/sovereign.db';
  return isPostgresUrl(url) ? 'postgres' : 'sqlite';
}

/**
 * Fail fast if the auth database's own dialect (inferred purely from
 * `AUTH_DATABASE_URL`'s scheme — see the module doc comment) disagrees with
 * the platform's (`DB_DIALECT`/`DATABASE_URL`).
 *
 * This gap is real, not hypothetical: `apps/auth` has always resolved its
 * dialect entirely independently of `DB_DIALECT`, so nothing else in the
 * codebase catches a mismatch. An operator can set `DB_DIALECT=postgres` and
 * reasonably expect "auth, platform, and every plugin" (the documented
 * model) to follow — but without also pointing `AUTH_DATABASE_URL` at
 * Postgres, auth silently keeps writing to a local SQLite file instead,
 * invisibly diverging from the rest of the instance. Both env vars are read
 * from the same shared root `.env` (`loadEnvConfig` in both `next.config.ts`
 * files), so this isn't asking the auth process to reach for something it
 * doesn't already have.
 *
 * Skipped for `:memory:` — ephemeral test storage, no real platform to
 * compare against (same carve-out `checkEncryptionMarker` uses below).
 */
export function assertAuthDialectMatchesPlatform(
  authUrl: string,
  // Next.js augments the global NodeJS.ProcessEnv type to require NODE_ENV,
  // which makes it structurally incompatible with the narrower type below at
  // the default-parameter position — cast, not a behavior change: at runtime
  // process.env has these two keys (or undefined) same as any other.
  env: PlatformDialectEnv = process.env as PlatformDialectEnv,
): void {
  if (authUrl === ':memory:') return;

  const authDialect = isPostgresUrl(authUrl) ? 'postgres' : 'sqlite';
  const platformDialect = resolvePlatformDialect(env);
  if (authDialect === platformDialect) return;

  throw new Error(
    `Dialect mismatch: the platform resolves to "${platformDialect}" (DB_DIALECT/DATABASE_URL), ` +
      `but AUTH_DATABASE_URL resolves to "${authDialect}". Auth, platform, and every plugin must ` +
      "agree on one dialect — set AUTH_DATABASE_URL to match (see docs/self-hosting.md's " +
      'PostgreSQL section for the required env vars on both dialects).',
  );
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
  assertAuthDialectMatchesPlatform(url);

  if (isPostgresUrl(url)) {
    _db = { dialect: 'postgres', pool: new Pool({ connectionString: url }) };
    return _db;
  }

  const key = dbEncryptionKeyFromEnv();
  const path = toPath(url);

  // Runs regardless of destination — catches "this instance's auth data was
  // encrypted, but the key is now missing" before ever opening anything.
  // Same reasoning as packages/db/src/client.ts's createClient().
  if (path !== ':memory:') {
    checkEncryptionMarker(join(findWorkspaceRoot(), 'data'), key !== undefined);
  }

  if (path !== ':memory:' && key === undefined) {
    _db = { dialect: 'sqlite', sqld: createAuthSqldClient() };
    return _db;
  }

  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const sqlite = openKeyedSqlite(path, key);
  _db = { dialect: 'sqlite', sqlite };
  return _db;
}

/** The dialect of the auth database. */
export function getAuthDialect(): 'sqlite' | 'postgres' {
  return getAuthDb().dialect;
}

/**
 * What better-auth's own `database` config option consumes. For the two
 * unchanged paths (plain-file SQLite, Postgres) this is the raw driver,
 * exactly as before — better-auth auto-detects a `better-sqlite3` `Database`
 * or `pg` `Pool`. For the sqld path there's no raw-driver auto-detection (no
 * official better-auth support for libSQL), so this hands better-auth a
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
export function getAuthDatabase():
  Database.Database | Pool | { dialect: LibsqlDialect; type: 'sqlite' } {
  const db = getAuthDb();
  if (db.dialect === 'postgres') return db.pool;
  if ('sqld' in db) {
    const { LibsqlDialect } =
      require('@libsql/kysely-libsql') as typeof import('@libsql/kysely-libsql');
    const dialect = new LibsqlDialect({
      url: sqldUrl(),
      fetch: (input: unknown, init?: RequestInit) => {
        const headers = new Headers(init?.headers);
        headers.set('x-namespace', SQLD_AUTH_NAMESPACE);
        return fetch(input as string, { ...init, headers });
      },
    });
    return { dialect, type: 'sqlite' };
  }
  return db.sqlite;
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
 * better-sqlite3 cannot bind booleans; map them to 0/1. Postgres binds natively.
 * libsql (sqld) also cannot bind booleans — same 0/1 mapping as better-sqlite3.
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
  if (db.dialect === 'postgres') {
    const res = await db.pool.query(toPgPlaceholders(sql), params as unknown[]);
    return res.rows[0] as T | undefined;
  }
  if ('sqld' in db) {
    const res = await db.sqld.execute({ sql, args: sqliteParams(params) as InArgs });
    return res.rows[0] as T | undefined;
  }
  return db.sqlite.prepare(sql).get(...sqliteParams(params)) as T | undefined;
}

/** Run a query returning all rows. */
export async function authAll<T>(sql: string, params: readonly unknown[] = []): Promise<T[]> {
  const db = getAuthDb();
  if (db.dialect === 'postgres') {
    const res = await db.pool.query(toPgPlaceholders(sql), params as unknown[]);
    return res.rows as T[];
  }
  if ('sqld' in db) {
    const res = await db.sqld.execute({ sql, args: sqliteParams(params) as InArgs });
    return res.rows as T[];
  }
  return db.sqlite.prepare(sql).all(...sqliteParams(params)) as T[];
}

/** Run a statement for its side effects (INSERT/UPDATE/DDL). */
export async function authRun(sql: string, params: readonly unknown[] = []): Promise<void> {
  const db = getAuthDb();
  if (db.dialect === 'postgres') {
    await db.pool.query(toPgPlaceholders(sql), params as unknown[]);
    return;
  }
  if ('sqld' in db) {
    await db.sqld.execute({ sql, args: sqliteParams(params) as InArgs });
    return;
  }
  db.sqlite.prepare(sql).run(...sqliteParams(params));
}
