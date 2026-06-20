/**
 * Idempotent dev/test seed (RFC 0019). Populates a dev database with baseline
 * platform data and two per-role test users:
 *
 *   admin@sovereign.local   password: admin-dev-password   (platform:owner)
 *   user@sovereign.local    password: user-dev-password    (platform:user)
 *
 * HARD-GATED TO NON-PROD: refuses to run when NODE_ENV=production unless the
 * SOVEREIGN_SEED_ALLOW_PROD override is set. Never run against a real instance.
 *
 * Run via: `pnpm sv seed`  or  `pnpm tsx scripts/seed.ts`
 */
import { existsSync, mkdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { hashPassword } from 'better-auth/crypto';
import { getPlatformDb } from '@sovereignfs/db';
import consola from 'consola';

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
    email: 'admin@sovereign.local',
    name: 'Dev Admin',
    password: 'admin-dev-password',
    role: 'platform:owner' as const,
  },
  {
    email: 'user@sovereign.local',
    name: 'Dev User',
    password: 'user-dev-password',
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

// ---------------------------------------------------------------------------
// Auth DB seeding
// ---------------------------------------------------------------------------

async function seedSqlite(dbPath: string): Promise<void> {
  const Database = (await import('better-sqlite3')).default;
  mkdirSync(dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  const now = new Date().toISOString();
  for (const u of SEED_USERS) {
    const existing = db.prepare('SELECT id FROM "user" WHERE email = ?').get(u.email) as
      | { id: string }
      | undefined;
    if (existing) {
      consola.info(`  already exists: ${u.email}`);
      continue;
    }
    const userId = randomUUID();
    const hashed = await hashPassword(u.password);
    db.prepare(
      `INSERT INTO "user" (id, name, email, "emailVerified", image, "createdAt", "updatedAt", role, active)
       VALUES (?, ?, ?, 1, NULL, ?, ?, ?, 1)`,
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
    const now = new Date().toISOString();
    for (const u of SEED_USERS) {
      const { rowCount } = await pool.query('SELECT id FROM "user" WHERE email = $1', [u.email]);
      if ((rowCount ?? 0) > 0) {
        consola.info(`  already exists: ${u.email}`);
        continue;
      }
      const userId = randomUUID();
      const hashed = await hashPassword(u.password);
      await pool.query(
        `INSERT INTO "user" (id, name, email, "emailVerified", image, "createdAt", "updatedAt", role, active)
         VALUES ($1, $2, $3, true, NULL, $4, $5, $6, true)`,
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
      'Seed complete. Test accounts:',
      '',
      '  admin@sovereign.local   password: admin-dev-password   (platform:owner)',
      '  user@sovereign.local    password: user-dev-password    (platform:user)',
      '',
      'These are dev-only credentials — NEVER use in production.',
    ].join('\n'),
  );
}

await main();
