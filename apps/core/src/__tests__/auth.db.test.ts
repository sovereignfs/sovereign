import { createTestDatabase, testDialect } from '@sovereignfs/database/testing';
import { describe } from 'vitest';
import { authSuite } from './auth.suite';

describe(`core's sign-in on ${testDialect}`, () => {
  authSuite(() => createTestDatabase());
});
