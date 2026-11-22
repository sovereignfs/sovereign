import path from 'node:path';
import { openDatabase, readMigrations, runMigrations } from '@sovereignfs/auth/database';
import { migrateSignIn } from './sign-in';

/** The table the app's own migrations are recorded in, apart from the sign-in's. */
const MIGRATIONS_TABLE = 'app_migrations';

/**
 * Applies the app's migrations, then the sign-in's, `migrations/sqlite` for a SQLite file and sqld or `migrations/postgres`, in name order, each once
 * (contracts/app-manifest.md §4: an app applies its own migrations when it starts, and is safe to start again). On PostgreSQL a lock
 * holds a second copy of the app back until the first has finished; it is a session lock, so it runs on the direct address
 * (`__PREFIX___POSTGRES_DIRECT_URL`), never behind a pooler.
 */
export async function migrate(): Promise<void> {
  const direct = await openDatabase({ prefix: '__PREFIX__', direct: true });
  try {
    const folder = path.join(process.cwd(), 'migrations', direct.family);
    await runMigrations(direct, readMigrations(folder), { table: MIGRATIONS_TABLE });
    // Then the sign-in's, on the same direct address.
    await migrateSignIn(direct);
  } finally {
    await direct.close();
  }
}
