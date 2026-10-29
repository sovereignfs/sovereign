import { createTestDatabase, testDialect } from '@sovereignfs/database/testing';
import { describe } from 'vitest';
import { seedSuite } from './seed.suite';

describe(`the development seed on ${testDialect}`, () => {
  seedSuite(() => createTestDatabase());
});
