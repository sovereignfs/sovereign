import { createTestDatabase, testDialect } from '@sovereignfs/database/testing';
import { describe, it, expect } from 'vitest';
import { settingsSuite } from './settings.suite';

it('SV_DB_DIALECT names a supported dialect', () => {
  expect(['sqld', 'sqlite', 'postgres']).toContain(testDialect);
});

describe(`core's settings on ${testDialect}`, () => {
  settingsSuite(() => createTestDatabase());
});
