import { createTestDatabase, testDialect } from '@sovereignfs/database/testing';
import { describe } from 'vitest';
import { notificationsSuite } from './notifications.suite';

describe(`notifications on ${testDialect}`, () => {
  notificationsSuite(() => createTestDatabase());
});
