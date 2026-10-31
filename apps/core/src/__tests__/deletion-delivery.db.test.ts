import { createTestDatabase, testDialect } from '@sovereignfs/database/testing';
import { describe } from 'vitest';
import { deletionDeliverySuite } from './deletion-delivery.suite';

describe(`deletion delivery on ${testDialect}`, () => {
  deletionDeliverySuite(() => createTestDatabase());
});
