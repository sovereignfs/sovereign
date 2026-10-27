import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = path.join(import.meta.dirname, '../../migrations');
const sqlFiles = (family: string) =>
  readdirSync(path.join(root, family)).filter((name) => name.endsWith('.sql'));

describe("core's migrations", () => {
  it.each(sqlFiles('postgres'))(
    'postgres/%s does not name a schema, so it runs in whichever one the connection uses',
    (file) => {
      const sql = readFileSync(path.join(root, 'postgres', file), 'utf8');
      // drizzle-kit writes "public"."table" in foreign keys; scripts/unqualify-postgres.mjs removes it.
      expect(sql).not.toMatch(/"public"\./);
    },
  );

  it('are the same list for both families', () => {
    expect(sqlFiles('postgres')).toEqual(sqlFiles('sqlite'));
  });
});
