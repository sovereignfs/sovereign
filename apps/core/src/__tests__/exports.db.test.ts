import { createTestDatabase, testDialect } from '@sovereignfs/database/testing';
import { describe } from 'vitest';
import { exportsSuite } from './exports.suite';

describe(`core's exports on ${testDialect}`, () => {
  exportsSuite(() => createTestDatabase());
});
