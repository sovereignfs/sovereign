import { createTestDatabase, testDialect } from '@sovereignfs/database/testing';
import { describe } from 'vitest';
import { rolesSuite } from './roles.suite';

describe(`core's roles on ${testDialect}`, () => {
  rolesSuite(() => createTestDatabase());
});
