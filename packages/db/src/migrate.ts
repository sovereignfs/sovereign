import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { sql } from 'drizzle-orm';
import { migrate as migratePg } from 'drizzle-orm/node-postgres/migrator';
import { migrate as migrateSqlite } from 'drizzle-orm/better-sqlite3/migrator';
import type { PlatformDb } from './client';
import { findWorkspaceRoot } from './client';
import { dbGet, dbRun } from './exec';

export interface MigrationResult {
  /** The platform version stored in the DB before this run. Null on first install. */
  previousVersion: string | null;
  /** The platform version written to the DB this run. */
  currentVersion: string;
  /** True when the binary running is older than the version stored in the DB. */
  downgradeDetected: boolean;
}

/**
 * Canonical path for the dialect's migration folder inside packages/db.
 * Both folders ship in the standalone output (explicitly COPY-ed in the Dockerfile).
 */
export function migrationsFolder(dialect: 'sqlite' | 'postgres'): string {
  return join(findWorkspaceRoot(), 'packages', 'db', 'migrations', dialect);
}

/**
 * Apply all pending platform-schema migrations, seed required rows, and persist
 * the current platform version for downgrade detection on the next startup.
 *
 * Safety properties:
 * - Idempotent: drizzle-orm's migrator tracks applied migrations in
 *   `__drizzle_migrations` and skips already-applied ones.
 * - Fail-fast: a migration error propagates and prevents the server from
 *   starting in a half-migrated state.
 * - Single-writer: Postgres deployments hold a session-level advisory lock
 *   (`pg_advisory_lock`) for the duration of the migration step so concurrent
 *   container restarts don't race. SQLite's inherent single-writer WAL mode
 *   provides the same guarantee without an explicit lock.
 * - Backward-compatible: migration SQL uses `IF NOT EXISTS` throughout, so
 *   instances bootstrapped before migrations were introduced are safe to upgrade.
 */
export async function runMigrations(pdb: PlatformDb): Promise<MigrationResult> {
  const folder = migrationsFolder(pdb.dialect);

  if (pdb.dialect === 'sqlite') {
    migrateSqlite(pdb.db, { migrationsFolder: folder });
    return seedPlatformData(pdb);
  }

  // Postgres: hold an advisory lock for the migration window so only one
  // process migrates even when multiple containers restart simultaneously.
  const LOCK_KEY = 3141592653; // arbitrary stable integer
  await dbGet(pdb, sql`SELECT pg_advisory_lock(${LOCK_KEY})`);
  try {
    await migratePg(pdb.db, { migrationsFolder: folder });
    return seedPlatformData(pdb);
  } finally {
    await dbGet(pdb, sql`SELECT pg_advisory_unlock(${LOCK_KEY})`);
  }
}

async function seedPlatformData(pdb: PlatformDb): Promise<MigrationResult> {
  const DEFAULT_TENANT_ID = 'default';
  const DEFAULT_TENANT_NAME = 'Sovereign';
  const DEFAULT_ROOT_PLUGIN_ID = 'fs.sovereign.launcher';
  const now = Math.floor(Date.now() / 1000);

  await dbRun(
    pdb,
    sql`INSERT INTO tenants (id, name, created_at, updated_at)
        VALUES (${DEFAULT_TENANT_ID}, ${DEFAULT_TENANT_NAME}, ${now}, ${now})
        ON CONFLICT (id) DO NOTHING`,
  );
  await dbRun(
    pdb,
    sql`INSERT INTO platform_settings (key, tenant_id, value, updated_at)
        VALUES ('root_plugin_id', ${DEFAULT_TENANT_ID}, ${DEFAULT_ROOT_PLUGIN_ID}, ${now})
        ON CONFLICT (key, tenant_id) DO NOTHING`,
  );

  // Read the version that was stored from the last startup.
  const stored = await dbGet<{ value: string }>(
    pdb,
    sql`SELECT value FROM platform_settings
        WHERE key = 'platform_version' AND tenant_id = ${DEFAULT_TENANT_ID}`,
  );
  const previousVersion = stored?.value ?? null;
  const currentVersion = readPlatformVersion();

  // Detect downgrade: the currently-running binary is older than the version
  // the DB was last started with. Uses simple x.y.z numeric comparison so
  // packages/db avoids taking a semver dependency.
  const downgradeDetected =
    previousVersion !== null && isVersionGreater(previousVersion, currentVersion);

  // Persist the *high-water-mark* version. On a fresh install, upgrade, or
  // unchanged restart we record the running version. On a detected downgrade we
  // deliberately KEEP the stored (higher) version so the warning persists on
  // every startup until the operator either upgrades back or restores an
  // older-schema backup (whose stored version then matches the binary). If we
  // overwrote it here, the downgrade warning would surface only once.
  if (!downgradeDetected) {
    await dbRun(
      pdb,
      sql`INSERT INTO platform_settings (key, tenant_id, value, updated_at)
          VALUES ('platform_version', ${DEFAULT_TENANT_ID}, ${currentVersion}, ${now})
          ON CONFLICT (key, tenant_id)
          DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    );
  }

  return { previousVersion, currentVersion, downgradeDetected };
}

function readPlatformVersion(): string {
  try {
    const raw = readFileSync(join(findWorkspaceRoot(), 'package.json'), 'utf8');
    return (JSON.parse(raw) as { version?: string }).version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
}

/** True when semver string `a` is strictly greater than `b` (x.y.z numerics only). */
function isVersionGreater(a: string, b: string): boolean {
  const parse = (v: string): [number, number, number] => {
    const [maj = 0, min = 0, pat = 0] = v.split('.').map(Number);
    return [maj, min, pat];
  };
  const [aMaj, aMin, aPat] = parse(a);
  const [bMaj, bMin, bPat] = parse(b);
  if (aMaj !== bMaj) return aMaj > bMaj;
  if (aMin !== bMin) return aMin > bMin;
  return aPat > bPat;
}
