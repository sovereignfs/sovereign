import { schemaDifferences } from '@sovereignfs/database/testing';
import { describe, expect, it } from 'vitest';
import * as postgres from '../db/schema/postgres';
import * as sqlite from '../db/schema/sqlite';

describe("core's schemas", () => {
  it('are a pair: every table and column exists in both dialects', () => {
    expect(schemaDifferences(sqlite, postgres)).toEqual([]);
  });

  it('are not empty', () => {
    expect(Object.keys(sqlite)).toContain('instanceSettings');
    expect(Object.keys(postgres)).toContain('instanceSettings');
  });
});
