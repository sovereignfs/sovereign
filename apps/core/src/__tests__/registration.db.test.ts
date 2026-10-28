import { createTestDatabase, testDialect } from '@sovereignfs/database/testing';
import { describe } from 'vitest';
import { registrationSuite } from './registration.suite';

describe(`core's registration policy on ${testDialect}`, () => {
  registrationSuite(() => createTestDatabase());
});
