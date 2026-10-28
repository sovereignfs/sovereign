import { createTestDatabase, testDialect } from '@sovereignfs/database/testing';
import { describe } from 'vitest';
import { profileSuite } from './profile.suite';

describe(`core's profile on ${testDialect}`, () => {
  profileSuite(() => createTestDatabase());
});
