import { createTestDatabase, testDialect } from '@sovereignfs/database/testing';
import { describe } from 'vitest';
import { accountsSuite } from './accounts.suite';

describe(`core's account states on ${testDialect}`, () => {
  accountsSuite(() => createTestDatabase());
});
