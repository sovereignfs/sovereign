import { createTestDatabase, testDialect } from '@sovereignfs/database/testing';
import { describe } from 'vitest';
import { directorySuite } from './directory.suite';

describe(`core's Directory API on ${testDialect}`, () => {
  directorySuite(() => createTestDatabase());
});
