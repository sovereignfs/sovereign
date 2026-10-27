// drizzle-kit writes foreign keys as REFERENCES "public"."users"("id"), which pins a migration to
// the schema named public. Core runs in whichever schema the connection's search_path names (the
// tests give each file one of its own), so the qualifier is removed from every PostgreSQL
// migration after it is generated. `src/__tests__/migrations.test.ts` fails if one is left.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const folder = path.join(import.meta.dirname, '..', 'migrations', 'postgres');
for (const file of readdirSync(folder).filter((name) => name.endsWith('.sql'))) {
  const file_ = path.join(folder, file);
  const sql = readFileSync(file_, 'utf8');
  const fixed = sql.replaceAll('"public".', '');
  if (fixed !== sql) writeFileSync(file_, fixed);
}
