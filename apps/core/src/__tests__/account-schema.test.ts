import { postgresAccountSchema, sqliteAccountSchema } from '@sovereignfs/auth/server';
import { schemaDifferences } from '@sovereignfs/database/testing';
import { getTableConfig as pgConfig } from 'drizzle-orm/pg-core';
import { getTableConfig as sqliteConfig } from 'drizzle-orm/sqlite-core';
import { describe, expect, it } from 'vitest';
import * as postgres from '../db/schema/postgres';
import * as sqlite from '../db/schema/sqlite';

// Core keeps its own migration history, and the sign-in package ships the account tables apps run (auth.md §10). This holds them
// together: every column of the package's tables is in core's, with the same type, nullability and default, so a better-auth that
// works on one works on the other.
type Shape = Map<string, string>;

function columns(
  table: unknown,
  config: (t: never) => {
    columns: { name: string; getSQLType(): string; notNull: boolean; hasDefault: boolean }[];
  },
): Shape {
  return new Map(
    config(table as never).columns.map((c) => [
      c.name,
      `${c.getSQLType()}${c.notNull ? ' not null' : ''}${c.hasDefault ? ' default' : ''}`,
    ]),
  );
}

const TABLES = [
  'users',
  'sessions',
  'accounts',
  'verifications',
  'rateLimits',
  'twoFactors',
  'passkeys',
] as const;

describe('the sign-in package’s account tables', () => {
  it('are a pair: every table and column exists in both dialects', () => {
    expect(schemaDifferences(sqliteAccountSchema, postgresAccountSchema)).toEqual([]);
  });

  for (const [dialect, pkg, mine, config] of [
    ['SQLite', sqliteAccountSchema, sqlite, sqliteConfig],
    ['PostgreSQL', postgresAccountSchema, postgres, pgConfig],
  ] as const) {
    it(`are held by core’s on ${dialect}, column for column`, () => {
      const missing: string[] = [];
      for (const table of TABLES) {
        const theirs = columns((pkg as Record<string, unknown>)[table], config as never);
        const ours = columns((mine as Record<string, unknown>)[table], config as never);
        for (const [name, shape] of theirs) {
          if (ours.get(name) !== shape) {
            missing.push(`${table}.${name}: ${shape}, core has ${ours.get(name) ?? 'none'}`);
          }
        }
      }
      expect(missing).toEqual([]);
    });
  }
});
