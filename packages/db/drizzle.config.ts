import { defineConfig } from 'drizzle-kit';

/**
 * drizzle-kit config for the SQLite dialect platform schema.
 *
 * Usage:
 *   pnpm --filter @sovereignfs/db drizzle-kit generate
 *   pnpm --filter @sovereignfs/db drizzle-kit generate --config drizzle.config.pg.ts
 *
 * Migrations land in migrations/{sqlite,postgres}/. runMigrations() in
 * src/migrate.ts picks the right folder based on the live dialect.
 */
export default defineConfig({
  schema: './src/schema/sqlite/platform.ts',
  out: './migrations/sqlite',
  dialect: 'sqlite',
  verbose: true,
});
