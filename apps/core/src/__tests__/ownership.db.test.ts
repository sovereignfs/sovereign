import { createTestDatabase, testDialect } from '@sovereignfs/database/testing';
import { describe } from 'vitest';
import { ownershipSuite } from './ownership.suite';

describe(`core's ownership transfer on ${testDialect}`, () => {
  ownershipSuite(() => createTestDatabase());
});
