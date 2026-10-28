import { schemaDifferences } from '@sovereignfs/database/testing';
import { describe, expect, it } from 'vitest';
import * as postgres from '../db/schema/postgres';
import * as sqlite from '../db/schema/sqlite';

describe("core's schemas", () => {
  it('are a pair: every table and column exists in both dialects', () => {
    expect(schemaDifferences(sqlite, postgres)).toEqual([]);
  });

  it('are not empty', () => {
    for (const table of [
      'instanceSettings',
      'users',
      'sessions',
      'accounts',
      'verifications',
      'rateLimits',
      'twoFactors',
      'passkeys',
      'avatars',
    ]) {
      expect(Object.keys(sqlite)).toContain(table);
      expect(Object.keys(postgres)).toContain(table);
    }
  });
});
