import { createTestDatabase, testDialect } from '@sovereignfs/database/testing';
import { describe } from 'vitest';
import { restoreSuite } from './restore.suite';

describe(`the restore marker on ${testDialect}`, () => {
  restoreSuite(() => createTestDatabase());
});
