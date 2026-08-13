import { getTableName, isTable } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { platformBootstrapStatements } from '../bootstrap';
import * as sqlite from '../schema/sqlite';

/**
 * `platformBootstrapStatements()`'s own doc comment says it "must stay in
 * sync with ./schema/{sqlite,postgres}/platform.ts" — but nothing enforced
 * that. It drifted in practice: `field_encryption_keys`,
 * `field_table_registrations`, and `field_reseal_checkpoints` (RFC 0092 gate
 * B) were added to the Drizzle schema with no matching DDL here, so any
 * `.pg.test.ts` fixture using `bootstrapPlatformDb()`/`freshDb()` and
 * touching those tables would fail with "table does not exist" instead of
 * being covered. This test catches that class of drift going forward.
 *
 * `users`/`sessions` are a deliberate, documented exception (see the comment
 * at the top of `packages/db/migrations/sqlite/0000_initial_schema.sql`):
 * those tables belong to the auth server's own database, never created by
 * the platform's bootstrap or migration path.
 */
const AUTH_OWNED_TABLES = new Set(['users', 'sessions']);

function schemaTableNames(): string[] {
  const names: string[] = [];
  for (const value of Object.values(sqlite)) {
    if (isTable(value)) names.push(getTableName(value));
  }
  return names;
}

describe('platformBootstrapStatements stays in sync with the Drizzle schema', () => {
  it('has a CREATE TABLE IF NOT EXISTS for every platform-owned table in the schema', () => {
    const statements = platformBootstrapStatements('sqlite').join('\n');
    const missing = schemaTableNames()
      .filter((name) => !AUTH_OWNED_TABLES.has(name))
      .filter((name) => !statements.includes(`CREATE TABLE IF NOT EXISTS ${name} (`));

    expect(missing, `bootstrap.ts is missing DDL for: ${missing.join(', ')}`).toEqual([]);
  });
});
