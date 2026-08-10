/**
 * sv user reset-mfa <email> — break-glass MFA reset.
 *
 * Removes all TOTP secrets, backup codes, and registered passkeys for the
 * specified user, and clears the twoFactorEnabled flag. The user can then sign
 * in with their password alone and re-enroll MFA. Requires direct database
 * access (use the admin Console UI for a softer approach).
 */
import { createSqldClient, findWorkspaceRoot, sqldUrl } from '@sovereignfs/db';
import { consola } from 'consola';
import { loadRootEnv } from './load-root-env';

// Normally invoked via `sv user reset-mfa`, which already loads .env before
// spawning this as a child process — but load it here too (idempotent, never
// overrides an already-set var) so a direct `pnpm tsx scripts/reset-mfa.ts`
// doesn't silently miss DB_DIALECT/POSTGRES_DB_URL.
loadRootEnv(findWorkspaceRoot());

/** Must match apps/auth/src/db.ts's AUTH_STORE_NAME. */
const AUTH_STORE_NAME = 'sovereign_auth';

function dbDialect(): 'sqlite' | 'postgres' {
  const explicit = process.env.DB_DIALECT?.toLowerCase();
  if (explicit === 'sqlite' || explicit === 'postgres') return explicit;
  throw new Error(
    `DB_DIALECT is required and must be "sqlite" or "postgres" (got ${
      explicit === undefined || explicit.length === 0 ? 'unset' : `"${explicit}"`
    }).`,
  );
}

const email = process.argv[2];
if (!email) {
  consola.error('Usage: sv user reset-mfa <email>');
  process.exit(1);
}

interface Db {
  get: <T>(sql: string, ...args: unknown[]) => Promise<T | undefined>;
  run: (sql: string, ...args: unknown[]) => Promise<void>;
  close: () => Promise<void>;
}

async function openAuthDb(): Promise<Db> {
  if (dbDialect() === 'postgres') {
    const pgUrl = process.env.POSTGRES_DB_URL;
    if (!pgUrl) throw new Error('DB_DIALECT=postgres requires POSTGRES_DB_URL to be set.');
    const { Pool } = await import('pg');
    const pool = new Pool({
      connectionString: pgUrl,
      options: `-c search_path="${AUTH_STORE_NAME}"`,
    });
    let i = 0;
    const toPgPlaceholders = (sql: string): string => {
      i = 0;
      return sql.replace(/\?/g, () => `$${++i}`);
    };
    return {
      get: async <T>(sql: string, ...args: unknown[]) => {
        const res = await pool.query(toPgPlaceholders(sql), args);
        return res.rows[0] as T | undefined;
      },
      run: async (sql: string, ...args: unknown[]) => {
        await pool.query(toPgPlaceholders(sql), args);
      },
      close: () => pool.end(),
    };
  }

  const client = createSqldClient(sqldUrl(), AUTH_STORE_NAME);
  // sqld cannot bind JS booleans directly — map to 0/1, same as
  // apps/auth/src/db.ts's sqliteParams().
  const sqliteParams = (args: unknown[]): unknown[] =>
    args.map((a) => (typeof a === 'boolean' ? (a ? 1 : 0) : a));
  return {
    get: async <T>(sql: string, ...args: unknown[]) => {
      const res = await client.execute({ sql, args: sqliteParams(args) as never });
      return res.rows[0] as T | undefined;
    },
    run: async (sql: string, ...args: unknown[]) => {
      await client.execute({ sql, args: sqliteParams(args) as never });
    },
    close: async () => client.close(),
  };
}

let db: Db;
try {
  db = await openAuthDb();
} catch (err) {
  consola.error(`Could not connect to the auth database: ${(err as Error).message}`);
  consola.info('Make sure the instance has been started at least once.');
  process.exit(1);
}

const user = await db.get<{ id: string; email: string }>(
  'SELECT id, email FROM "user" WHERE email = ?',
  email,
);

if (!user) {
  consola.error(`No user found with email: ${email}`);
  process.exit(1);
}

consola.info(`Resetting MFA for ${user.email} (${user.id})`);

await db.run('DELETE FROM "twoFactor" WHERE "userId" = ?', user.id);
await db.run('DELETE FROM "passkey" WHERE "userId" = ?', user.id);
await db.run('UPDATE "user" SET "twoFactorEnabled" = ? WHERE id = ?', false, user.id);

await db.close();

consola.success(`MFA reset complete. ${user.email} can now sign in with password only.`);
