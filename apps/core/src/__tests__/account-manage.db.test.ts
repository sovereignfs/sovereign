import { createTestDatabase, testDialect } from '@sovereignfs/database/testing';
import { describe } from 'vitest';
import { accountManageSuite } from './account-manage.suite';

describe(`core's account management on ${testDialect}`, () => {
  accountManageSuite(() => createTestDatabase());
});
