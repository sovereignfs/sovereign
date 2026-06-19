import { defineConfig } from 'drizzle-kit';

/**
 * drizzle-kit config for the Postgres dialect platform schema.
 *
 * Usage:
 *   pnpm --filter @sovereignfs/db drizzle-kit generate --config drizzle.config.pg.ts
 */
export default defineConfig({
  schema: './src/schema/postgres/platform.ts',
  out: './migrations/postgres',
  dialect: 'postgresql',
  verbose: true,
});
