import { defineConfig } from 'drizzle-kit';

// Generates the PostgreSQL migrations from src/db/schema/postgres.ts.
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema/postgres.ts',
  out: './migrations/postgres',
});
