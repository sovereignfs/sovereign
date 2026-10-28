import { createTestDatabase, testDialect } from '@sovereignfs/database/testing';
import { describe } from 'vitest';
import { verificationSuite } from './verification.suite';

describe(`core's email verification and reset on ${testDialect}`, () => {
  verificationSuite(() => createTestDatabase());
});
