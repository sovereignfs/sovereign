import { createTestDatabase, testDialect } from '@sovereignfs/database/testing';
import { describe } from 'vitest';
import { twoFactorSuite } from './twofactor.suite';

describe(`core's two-factor sign-in on ${testDialect}`, () => {
  twoFactorSuite(() => createTestDatabase());
});
