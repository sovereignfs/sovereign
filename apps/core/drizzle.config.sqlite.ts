import { defineConfig } from 'drizzle-kit';

// Generates the SQLite (sqld and file) migrations from src/db/schema/sqlite.ts.
// Pass `--name add_thing` for a readable file name.
export default defineConfig({
  dialect: 'sqlite',
  schema: './src/db/schema/sqlite.ts',
  out: './migrations/sqlite',
});
