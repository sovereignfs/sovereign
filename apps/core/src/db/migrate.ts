import path from 'node:path';
import { migrate, readMigrations, type Database, type MigrateResult } from '@sovereignfs/database';

/**
 * Where core's migrations are: one folder per dialect family (`sqlite` for sqld and a SQLite
 * file, `postgres`), written by `pnpm --filter core db:generate`. Relative to the directory
 * core runs from (`apps/core`), which is also where an image puts them.
 */
export function migrationsRoot(): string {
  return path.join(process.cwd(), 'migrations');
}

/** Brings the database up to date. Safe to run from every instance at once. */
export function migrateCore(
  database: Database,
  root: string = migrationsRoot(),
): Promise<MigrateResult> {
  return migrate(
    database,
    readMigrations(
      // Read from disk on purpose; next.config.ts includes the folder in a traced build.
      path.join(/* turbopackIgnore: true */ root, database.family),
    ),
  );
}
