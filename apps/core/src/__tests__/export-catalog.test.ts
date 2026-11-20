import { getTableConfig as pgConfig, PgTable } from 'drizzle-orm/pg-core';
import { getTableConfig as sqliteConfig, SQLiteTable } from 'drizzle-orm/sqlite-core';
import { describe, expect, it } from 'vitest';
import * as pg from '../db/schema/postgres';
import * as sqlite from '../db/schema/sqlite';
import { CATALOG, isExported } from '../exports/catalog';

function tables(): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const value of Object.values(sqlite)) {
    if (value instanceof SQLiteTable) {
      const config = sqliteConfig(value);
      out.set(
        config.name,
        config.columns.map((column) => column.name),
      );
    }
  }
  for (const value of Object.values(pg)) {
    if (value instanceof PgTable) {
      const config = pgConfig(value);
      const known = out.get(config.name) ?? [];
      out.set(config.name, [
        ...new Set([...known, ...config.columns.map((column) => column.name)]),
      ]);
    }
  }
  return out;
}

const NEVER_COLUMNS = [
  'password',
  'secret',
  'backup_codes',
  'token',
  'private_key',
  'client_secret',
  'access_token',
  'refresh_token',
];

describe('what an export carries of core’s database (core-app §4.7)', () => {
  const schema = tables();

  it.each([...schema.keys()])('decides the table %s', (table) => {
    expect(
      CATALOG[table],
      `${table} is in no decision: export it or say why it never is`,
    ).toBeDefined();
  });

  it('decides no table that is not there', () => {
    expect(Object.keys(CATALOG).filter((table) => !schema.has(table))).toEqual([]);
  });

  it.each(Object.entries(CATALOG).filter(([, decision]) => isExported(decision)))(
    'decides every column of %s, each exported or left out with a reason',
    (table, decision) => {
      if (!isExported(decision)) return;
      const decided = [...decision.columns, ...Object.keys(decision.omit ?? {})].sort();
      expect(decided).toEqual([...(schema.get(table) ?? [])].sort());
      for (const column of decision.person?.columns ?? [])
        expect(decision.columns).toContain(column);
    },
  );

  it('exports no column that holds a credential', () => {
    for (const [table, decision] of Object.entries(CATALOG)) {
      if (!isExported(decision)) continue;
      for (const column of decision.columns) {
        if (table === 'key_accounts' && column === 'signing_private') continue; // wrapped by the person's key (RFC 0005)
        expect(NEVER_COLUMNS.includes(column), `${table}.${column}`).toBe(false);
      }
    }
  });

  it('never exports the tables that hold credentials, sessions and tokens', () => {
    for (const table of [
      'accounts',
      'two_factors',
      'passkeys',
      'jwks',
      'verifications',
      'sessions',
      'oauth_access_tokens',
      'oauth_refresh_tokens',
    ]) {
      expect(isExported(CATALOG[table] ?? { never: '' }), table).toBe(false);
    }
  });
});
