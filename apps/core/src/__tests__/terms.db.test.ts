import { createTestDatabase, testDialect } from '@sovereignfs/database/testing';
import { describe } from 'vitest';
import { termsSuite } from './terms.suite';

describe(`core's terms and time zone at sign-up on ${testDialect}`, () => {
  termsSuite(() => createTestDatabase());
});
