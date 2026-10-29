import { createTestDatabase, testDialect } from '@sovereignfs/database/testing';
import { describe } from 'vitest';
import { clientsSuite } from './clients.suite';

describe(`core's client registry on ${testDialect}`, () => {
  clientsSuite(() => createTestDatabase());
});
