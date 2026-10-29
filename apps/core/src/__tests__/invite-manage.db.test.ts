import { createTestDatabase, testDialect } from '@sovereignfs/database/testing';
import { describe } from 'vitest';
import { inviteManageSuite } from './invite-manage.suite';

describe(`core's invitation management on ${testDialect}`, () => {
  inviteManageSuite(() => createTestDatabase());
});
