/**
 * Idempotent dev/test seed (RFC 0019). Populates a dev database with baseline
 * platform data and four per-role test users (all password: sovereign):
 *
 *   owner@sovereign.local     (platform:owner)
 *   admin@sovereign.local     (platform:admin)
 *   auditor@sovereign.local   (platform:auditor)
 *   user@sovereign.local      (platform:user)
 *
 * HARD-GATED TO NON-PROD, two independent checks, both bypassed only by
 * SOVEREIGN_SEED_ALLOW_PROD=true:
 *   1. Refuses to run when NODE_ENV=production (catches the documented
 *      Docker `tools` path, which sets NODE_ENV=production).
 *   2. Refuses to run if the target auth database already has any real
 *      (non-test) user account (catches a local shell run pointed at a
 *      real instance's database via AUTH_DATABASE_URL/DATABASE_URL, where
 *      NODE_ENV is not production).
 * Never run against a real instance.
 *
 * Run via: `pnpm sv seed`  or  `pnpm tsx scripts/seed.ts`
 */
import { existsSync, mkdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { hashPassword } from 'better-auth/crypto';
import {
  checkEncryptionMarker,
  dbEncryptionKeyFromEnv,
  defaultDataDir,
  getPlatformDb,
  openKeyedSqlite,
} from '@sovereignfs/db';
import consola from 'consola';
import { loadRootEnv } from './load-root-env';

// Normally invoked via `sv seed`, which already loads .env before spawning
// this as a child process — but load it here too (idempotent, never
// overrides an already-set var) so the documented direct
// `pnpm tsx scripts/seed.ts` invocation doesn't silently miss
// SOVEREIGN_DB_ENCRYPTION_KEY on an encrypted instance.
loadRootEnv(resolve(dirname(fileURLToPath(import.meta.url)), '..'));

// ---------------------------------------------------------------------------
// Prod guard — must run before any imports that touch the DB
// ---------------------------------------------------------------------------

if (process.env.NODE_ENV === 'production' && process.env.SOVEREIGN_SEED_ALLOW_PROD !== 'true') {
  consola.error(
    'sv seed refuses to run in production mode. ' +
      'Set SOVEREIGN_SEED_ALLOW_PROD=true only on a disposable test database.',
  );
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Documented test users (credentials are PUBLIC dev defaults, never for prod)
// ---------------------------------------------------------------------------

/** Seed user definitions — exported for use in integration tests. */
export const SEED_USERS = [
  {
    email: 'owner@sovereign.local',
    name: 'Dev Owner',
    password: 'sovereign',
    role: 'platform:owner' as const,
  },
  {
    email: 'admin@sovereign.local',
    name: 'Dev Admin',
    password: 'sovereign',
    role: 'platform:admin' as const,
  },
  {
    email: 'auditor@sovereign.local',
    name: 'Dev Auditor',
    password: 'sovereign',
    role: 'platform:auditor' as const,
  },
  {
    email: 'user@sovereign.local',
    name: 'Dev User',
    password: 'sovereign',
    role: 'platform:user' as const,
  },
] as const;

// ---------------------------------------------------------------------------
// Helpers (mirrors apps/auth/src/db.ts without importing the auth server)
// ---------------------------------------------------------------------------

function findWorkspaceRoot(): string {
  const startDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  let dir = startDir;
  for (;;) {
    if (existsSync(join(dir, 'pnpm-workspace.yaml'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return startDir;
    dir = parent;
  }
}

function isPostgresUrl(url: string): boolean {
  return url.startsWith('postgres://') || url.startsWith('postgresql://');
}

function resolveDbPath(url: string, wsRoot: string): string {
  const path = url.startsWith('file:') ? url.slice('file:'.length) : url;
  return isAbsolute(path) ? path : resolve(wsRoot, path);
}

/**
 * Second, independent guard on top of the NODE_ENV check above. That check
 * only catches the documented Docker `tools` path (which sets
 * NODE_ENV=production); it does nothing if someone runs `pnpm sv seed` /
 * `pnpm tsx scripts/seed.ts` from a plain local shell (NODE_ENV unset or
 * "development") while AUTH_DATABASE_URL happens to point at a real
 * instance's database — e.g. a copy-pasted prod .env, or a shared
 * staging DB that already has real users. Refuse whenever the target
 * database already has any non-test user account, since that means real
 * accounts exist and seeding would plant known-password (`sovereign`)
 * accounts on top of them.
 */
function refuseIfRealUsersExist(realUserCount: number): void {
  if (process.env.SOVEREIGN_SEED_ALLOW_PROD === 'true') return;
  if (realUserCount > 0) {
    consola.error(
      `Refusing to seed: this auth database already has ${String(realUserCount)} real ` +
        '(non-test) user account(s). sv seed inserts accounts with a well-known password ' +
        '("sovereign") and must never run against a database with real users. If this really ' +
        'is a disposable test/staging database, set SOVEREIGN_SEED_ALLOW_PROD=true.',
    );
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// Auth DB seeding
// ---------------------------------------------------------------------------

async function seedSqlite(dbPath: string): Promise<void> {
  mkdirSync(dirname(dbPath), { recursive: true });
  const key = dbEncryptionKeyFromEnv();
  checkEncryptionMarker(defaultDataDir(), key !== undefined);
  const db = openKeyedSqlite(dbPath, key);

  let realUserCount = 0;
  try {
    const row = db.prepare('SELECT COUNT(*) AS c FROM "user" WHERE "isTestUser" != 1').get() as
      { c: number } | undefined;
    realUserCount = row?.c ?? 0;
  } catch {
    try {
      // isTestUser column missing (predates that migration) but the table
      // exists — count everything as "real" rather than assume it's safe.
      const row = db.prepare('SELECT COUNT(*) AS c FROM "user"').get() as { c: number } | undefined;
      realUserCount = row?.c ?? 0;
    } catch {
      // "user" table doesn't exist yet — brand-new DB, nothing to protect.
      realUserCount = 0;
    }
  }
  refuseIfRealUsersExist(realUserCount);

  const now = new Date().toISOString();
  for (const u of SEED_USERS) {
    const existing = db.prepare('SELECT id FROM "user" WHERE email = ?').get(u.email) as
      { id: string } | undefined;
    if (existing) {
      try {
        db.prepare(`UPDATE "user" SET "isTestUser" = 1 WHERE id = ?`).run(existing.id);
      } catch {
        consola.warn(
          `  isTestUser backfill skipped for ${u.email} — start the auth server once first`,
        );
      }
      consola.info(`  already exists: ${u.email}`);
      continue;
    }
    const userId = randomUUID();
    const hashed = await hashPassword(u.password);
    db.prepare(
      `INSERT INTO "user" (id, name, email, "emailVerified", image, "createdAt", "updatedAt", role, active, "isTestUser")
       VALUES (?, ?, ?, 1, NULL, ?, ?, ?, 1, 1)`,
    ).run(userId, u.name, u.email, now, now, u.role);
    db.prepare(
      `INSERT INTO account (id, "accountId", "providerId", "userId", password, "createdAt", "updatedAt")
       VALUES (?, ?, 'credential', ?, ?, ?, ?)`,
    ).run(randomUUID(), userId, userId, hashed, now, now);
    consola.success(`  created: ${u.email} (${u.role})`);
  }

  db.close();
}

async function seedPostgres(connString: string): Promise<void> {
  const { Pool } = await import('pg');
  const pool = new Pool({ connectionString: connString });
  try {
    let realUserCount = 0;
    try {
      const { rows } = await pool.query(
        'SELECT COUNT(*) AS c FROM "user" WHERE "isTestUser" != true',
      );
      realUserCount = Number((rows[0] as { c: string } | undefined)?.c ?? 0);
    } catch {
      try {
        // isTestUser column missing (predates that migration) but the table
        // exists — count everything as "real" rather than assume it's safe.
        const { rows } = await pool.query('SELECT COUNT(*) AS c FROM "user"');
        realUserCount = Number((rows[0] as { c: string } | undefined)?.c ?? 0);
      } catch {
        // "user" table doesn't exist yet — brand-new DB, nothing to protect.
        realUserCount = 0;
      }
    }
    refuseIfRealUsersExist(realUserCount);

    const now = new Date().toISOString();
    for (const u of SEED_USERS) {
      const { rowCount } = await pool.query('SELECT id FROM "user" WHERE email = $1', [u.email]);
      if ((rowCount ?? 0) > 0) {
        try {
          await pool.query(`UPDATE "user" SET "isTestUser" = true WHERE email = $1`, [u.email]);
        } catch {
          consola.warn(
            `  isTestUser backfill skipped for ${u.email} — start the auth server once first`,
          );
        }
        consola.info(`  already exists: ${u.email}`);
        continue;
      }
      const userId = randomUUID();
      const hashed = await hashPassword(u.password);
      await pool.query(
        `INSERT INTO "user" (id, name, email, "emailVerified", image, "createdAt", "updatedAt", role, active, "isTestUser")
         VALUES ($1, $2, $3, true, NULL, $4, $5, $6, true, true)`,
        [userId, u.name, u.email, now, now, u.role],
      );
      await pool.query(
        `INSERT INTO account (id, "accountId", "providerId", "userId", password, "createdAt", "updatedAt")
         VALUES ($1, $2, 'credential', $3, $4, $5, $6)`,
        [randomUUID(), userId, userId, hashed, now, now],
      );
      consola.success(`  created: ${u.email} (${u.role})`);
    }
  } finally {
    await pool.end();
  }
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  consola.info(`Sovereign dev seed  (NODE_ENV=${process.env.NODE_ENV ?? '(unset)'})`);

  const wsRoot = findWorkspaceRoot();

  // 1. Platform DB — bootstrapPlatformDb runs inside getPlatformDb(), no extra call needed.
  consola.start('Platform DB...');
  await getPlatformDb();
  consola.success('Platform DB ready.');

  // 2. Auth DB — insert test users with hashed passwords (idempotent).
  consola.start('Auth DB — seeding test users...');
  const authUrl = process.env.AUTH_DATABASE_URL ?? 'file:./data/auth.db';
  if (isPostgresUrl(authUrl)) {
    await seedPostgres(authUrl);
  } else {
    await seedSqlite(resolveDbPath(authUrl, wsRoot));
  }

  consola.box(
    [
      'Seed complete. Test accounts (all password: sovereign):',
      '',
      '  owner@sovereign.local     (platform:owner)',
      '  admin@sovereign.local     (platform:admin)',
      '  auditor@sovereign.local   (platform:auditor)',
      '  user@sovereign.local      (platform:user)',
      '',
      'These are dev-only credentials — NEVER use in production.',
    ].join('\n'),
  );
}

await main();
