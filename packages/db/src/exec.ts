import type { SQL } from 'drizzle-orm';
import type { PlatformDb } from './client';

/**
 * Dialect-aware execution for raw `sql` queries against the platform database.
 *
 * better-sqlite3 is synchronous (`db.get`/`db.all`/`db.run`); node-postgres is
 * asynchronous (`db.execute(...).rows`); libsql/sqld (RFC 0091's encryption
 * carve-out — `dialect: 'sqlite'` covers both drivers now) is also async, but
 * exposes the same `.get`/`.all`/`.run` method names as better-sqlite3, just
 * returning a thenable instead of a resolved value. `await` on all three
 * resolves correctly regardless of which is live — a plain value awaits to
 * itself — so that's what makes this actually portable, not a type-only
 * illusion: an earlier version of this file cast the sqlite branch's return
 * value without awaiting it, which would have silently handed callers an
 * unresolved thenable instead of a row on the sqld path.
 *
 * The queries themselves use only standard SQL (no SQLite- or Postgres-
 * specific idioms), so the same `sql` template is portable; `ON CONFLICT ...
 * DO UPDATE/NOTHING` is supported identically by both engines.
 *
 * Column casing: raw SQL returns the database column names, so callers that
 * need camelCase alias explicitly (e.g. `plugin_id AS "pluginId"`). Booleans
 * read back as 0/1 on SQLite and `true/false` on Postgres — normalise with a
 * cast where it matters.
 */

/** Run a query for at most one row. */
export async function dbGet<T>(pdb: PlatformDb, query: SQL): Promise<T | undefined> {
  if (pdb.dialect === 'sqlite') {
    // Not pdb.db.get() — drizzle-orm@0.45.2's libsql session crashes with
    // `TypeError: Cannot convert undefined or null to object` (Object.keys on
    // an undefined row) whenever a raw sql`` query genuinely matches zero
    // rows (drizzle-orm/libsql/session.cjs's normalizeRow doesn't guard
    // against an undefined row before calling Object.keys on it) — found
    // live: a query as ordinary as "does this setting exist yet" crashed
    // instrumentation on every fresh boot. .all() doesn't share the bug
    // (an empty array needs no such guard), so route through it instead.
    const rows = await pdb.db.all<T>(query);
    return rows[0] ?? undefined;
  }
  const result = await pdb.db.execute(query);
  return (result.rows[0] as T | undefined) ?? undefined;
}

/** Run a query returning all rows. */
export async function dbAll<T>(pdb: PlatformDb, query: SQL): Promise<T[]> {
  if (pdb.dialect === 'sqlite') {
    return await pdb.db.all<T>(query);
  }
  const result = await pdb.db.execute(query);
  return result.rows as T[];
}

/** Run a statement for its side effects (INSERT/UPDATE/DDL). */
export async function dbRun(pdb: PlatformDb, query: SQL): Promise<void> {
  if (pdb.dialect === 'sqlite') {
    await pdb.db.run(query);
    return;
  }
  await pdb.db.execute(query);
}
