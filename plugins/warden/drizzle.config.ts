import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'sqlite',
  schema: './app/_db/schema.ts',
  out: './migrations/sqlite',
});
