import { defineConfig } from 'drizzle-kit';

// Generates from the Postgres twin schema — drizzle-kit cannot read a
// sqliteTable()-based file with --dialect postgresql (docs/plugin-database.md).
export default defineConfig({
  dialect: 'postgresql',
  schema: './app/_db/schema.postgres.ts',
  out: './migrations/postgres',
});
