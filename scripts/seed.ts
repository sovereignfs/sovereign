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
 *      (non-test) user account (catches a local shell run pointed at a real
 *      instance's database via DB_DIALECT/POSTGRES_DB_URL, where NODE_ENV is
 *      not production).
 * Never run against a real instance.
 *
 * Run via: `pnpm sv seed`  or  `pnpm tsx scripts/seed.ts`
 */
import { randomUUID } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { hashPassword } from 'better-auth/crypto';
import {
  createSqldClient,
  getPlatformDb,
  provisionSqldNamespace,
  sqldAdminUrl,
  sqldUrl,
} from '@sovereignfs/db';
import consola from 'consola';
import { loadRootEnv } from './load-root-env';

// Normally invoked via `sv seed`, which already loads .env before spawning
// this as a child process — but load it here too (idempotent, never
// overrides an already-set var) so the documented direct
// `pnpm tsx scripts/seed.ts` invocation doesn't silently miss DB_DIALECT.
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

function dbDialect(): 'sqlite' | 'postgres' {
  const explicit = process.env.DB_DIALECT?.toLowerCase();
  if (explicit === 'sqlite' || explicit === 'postgres') return explicit;
  throw new Error(
    `DB_DIALECT is required and must be "sqlite" or "postgres" (got ${
      explicit === undefined || explicit.length === 0 ? 'unset' : `"${explicit}"`
    }).`,
  );
}

/**
 * Second, independent guard on top of the NODE_ENV check above. That check
 * only catches the documented Docker `tools` path (which sets
 * NODE_ENV=production); it does nothing if someone runs `pnpm sv seed` /
 * `pnpm tsx scripts/seed.ts` from a plain local shell (NODE_ENV unset or
 * "development") while DB_DIALECT/POSTGRES_DB_URL happens to point at a real
 * instance's database — e.g. a copy-pasted prod .env, or a shared staging DB
 * that already has real users. Refuse whenever the target database already
 * has any non-test user account, since that means real accounts exist and
 * seeding would plant known-password (`sovereign`) accounts on top of them.
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

/**
 * Schema (Postgres) / sqld namespace dedicated to the auth database — must
 * match `apps/auth/src/db.ts`'s `AUTH_STORE_NAME`. This script deliberately
 * doesn't import from `apps/auth` (mirrors it instead, per the comment
 * above), so the constant is duplicated, not shared.
 */
const AUTH_STORE_NAME = 'sovereign_auth';

/**
 * @param namespace Defaults to the real auth store. Set
 *   SOVEREIGN_DEV_DATABASE_URL to seed a separate mock/dev-mode namespace
 *   instead (RFC 0020) — matches runtime/src/dev-db.ts's own interpretation
 *   of that var for the SQLite dialect.
 */
async function seedSqlite(namespace: string = AUTH_STORE_NAME): Promise<void> {
  await provisionSqldNamespace(sqldAdminUrl(), namespace);
  const client = createSqldClient(sqldUrl(), namespace);
  const get = async <T>(sql: string, ...args: unknown[]): Promise<T | undefined> => {
    const res = await client.execute({ sql, args: args as never });
    return res.rows[0] as T | undefined;
  };
  const run = async (sql: string, ...args: unknown[]): Promise<void> => {
    await client.execute({ sql, args: args as never });
  };

  let realUserCount = 0;
  try {
    const row = await get<{ c: number }>(
      'SELECT COUNT(*) AS c FROM "user" WHERE "isTestUser" != 1',
    );
    realUserCount = row?.c ?? 0;
  } catch {
    try {
      // isTestUser column missing (predates that migration) but the table
      // exists — count everything as "real" rather than assume it's safe.
      const row = await get<{ c: number }>('SELECT COUNT(*) AS c FROM "user"');
      realUserCount = row?.c ?? 0;
    } catch {
      // "user" table doesn't exist yet — brand-new DB, nothing to protect.
      realUserCount = 0;
    }
  }
  refuseIfRealUsersExist(realUserCount);

  const now = new Date().toISOString();
  for (const u of SEED_USERS) {
    const existing = await get<{ id: string }>('SELECT id FROM "user" WHERE email = ?', u.email);
    if (existing) {
      try {
        await run(`UPDATE "user" SET "isTestUser" = 1 WHERE id = ?`, existing.id);
        // Backfill for a DB seeded before this script set verificationLevel
        // on insert (see the comment on the INSERT below) — only raises it,
        // never downgrades a since-vouched account back down. Must check
        // IS NULL explicitly: a column left NULL by a migration that added
        // it with no SQL-level DEFAULT (rather than the schema default of 0,
        // which only better-auth's own ORM layer applies) makes
        // `"verificationLevel" < 1` evaluate to NULL, not true — a bare `< 1`
        // guard silently skips exactly the rows most likely to need this
        // backfill. Verified live: a real pre-fix-seeded dev DB had 3 of 4
        // seeded rows sitting at NULL, not 0.
        await run(
          `UPDATE "user" SET "verificationLevel" = 1
           WHERE id = ? AND ("verificationLevel" IS NULL OR "verificationLevel" < 1)`,
          existing.id,
        );
      } catch {
        consola.warn(
          `  isTestUser/verificationLevel backfill skipped for ${u.email} — start the auth server once first`,
        );
      }
      consola.info(`  already exists: ${u.email}`);
      continue;
    }
    const userId = randomUUID();
    const hashed = await hashPassword(u.password);
    // verificationLevel: 1 (not the schema's default of 0) — matches exactly
    // what apps/auth's real create hook computes for a fresh signup when
    // email verification isn't required (the common local-dev default: see
    // `env.requireEmailVerification ? 0 : 1` in apps/auth/src/auth.ts).
    // Without this, `emailVerified: 1` + `verificationLevel: 0` is a
    // combination the real signup flow can never produce — every
    // capability gated at level 1 (currently just `user:manage`, RFC 0035)
    // silently vanishes for every seeded account, including platform:owner,
    // even though its role preset grants it.
    await run(
      `INSERT INTO "user" (id, name, email, "emailVerified", image, "createdAt", "updatedAt", role, active, "isTestUser", "verificationLevel")
       VALUES (?, ?, ?, 1, NULL, ?, ?, ?, 1, 1, 1)`,
      userId,
      u.name,
      u.email,
      now,
      now,
      u.role,
    );
    await run(
      `INSERT INTO account (id, "accountId", "providerId", "userId", password, "createdAt", "updatedAt")
       VALUES (?, ?, 'credential', ?, ?, ?, ?)`,
      randomUUID(),
      userId,
      userId,
      hashed,
      now,
      now,
    );
    consola.success(`  created: ${u.email} (${u.role})`);
  }

  client.close();
}

async function seedPostgres(connString: string): Promise<void> {
  const { Pool } = await import('pg');
  // search_path pinned to the auth schema — must match apps/auth/src/db.ts's
  // own connection, or this would read/write the wrong schema entirely.
  const pool = new Pool({
    connectionString: connString,
    options: `-c search_path="${AUTH_STORE_NAME}"`,
  });
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
          // Backfill for a DB seeded before this script set verificationLevel
          // on insert (see the comment on the INSERT below) — only raises
          // it, never downgrades a since-vouched account back down. Must
          // check IS NULL explicitly — see the matching comment in
          // seedSqlite() for why a bare `< 1` guard misses NULL rows, which
          // is exactly what a live pre-fix-seeded dev DB had for 3 of 4
          // seeded accounts.
          await pool.query(
            `UPDATE "user" SET "verificationLevel" = 1
             WHERE email = $1 AND ("verificationLevel" IS NULL OR "verificationLevel" < 1)`,
            [u.email],
          );
        } catch {
          consola.warn(
            `  isTestUser/verificationLevel backfill skipped for ${u.email} — start the auth server once first`,
          );
        }
        consola.info(`  already exists: ${u.email}`);
        continue;
      }
      const userId = randomUUID();
      const hashed = await hashPassword(u.password);
      // verificationLevel: 1 (not the schema's default of 0) — matches
      // exactly what apps/auth's real create hook computes for a fresh
      // signup when email verification isn't required (the common
      // local-dev default: see `env.requireEmailVerification ? 0 : 1` in
      // apps/auth/src/auth.ts). Without this, `emailVerified: true` +
      // `verificationLevel: 0` is a combination the real signup flow can
      // never produce — every capability gated at level 1 (currently just
      // `user:manage`, RFC 0035) silently vanishes for every seeded
      // account, including platform:owner, even though its role preset
      // grants it.
      await pool.query(
        `INSERT INTO "user" (id, name, email, "emailVerified", image, "createdAt", "updatedAt", role, active, "isTestUser", "verificationLevel")
         VALUES ($1, $2, $3, true, NULL, $4, $5, $6, true, true, 1)`,
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

  // 1. Platform DB — bootstrapPlatformDb runs inside getPlatformDb(), no extra call needed.
  consola.start('Platform DB...');
  await getPlatformDb();
  consola.success('Platform DB ready.');

  // 2. Auth DB — insert test users with hashed passwords (idempotent).
  // SOVEREIGN_DEV_DATABASE_URL, when set, redirects this to the RFC 0020
  // mock database instead of the real auth store — same var, same
  // dialect-dependent meaning runtime/src/dev-db.ts uses (a full connection
  // string on Postgres, an sqld namespace name on SQLite).
  consola.start('Auth DB — seeding test users...');
  const devTarget = process.env.SOVEREIGN_DEV_DATABASE_URL;
  if (dbDialect() === 'postgres') {
    const pgUrl = devTarget ?? process.env.POSTGRES_DB_URL;
    if (!pgUrl) throw new Error('DB_DIALECT=postgres requires POSTGRES_DB_URL to be set.');
    await seedPostgres(pgUrl);
  } else {
    await seedSqlite(devTarget);
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
