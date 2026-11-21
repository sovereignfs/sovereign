import { createTestDatabase, testDialect } from '@sovereignfs/database/testing';
import { describe } from 'vitest';
import { lockSuite } from './lock.suite';

describe(`core's lock on ${testDialect}`, () => {
  lockSuite(() => createTestDatabase());
});
