import { createTestDatabase, testDialect } from '@sovereignfs/database/testing';
import { describe } from 'vitest';
import { deletionNoticesSuite } from './deletion-notices.suite';

describe(`deletion notices on ${testDialect}`, () => {
  deletionNoticesSuite(() => createTestDatabase());
});
