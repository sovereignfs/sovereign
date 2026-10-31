import { createTestDatabase, testDialect } from '@sovereignfs/database/testing';
import { describe } from 'vitest';
import { deletionLedgerSuite } from './deletion-ledger.suite';

describe(`deletions across a restore on ${testDialect}`, () => {
  deletionLedgerSuite(() => createTestDatabase());
});
