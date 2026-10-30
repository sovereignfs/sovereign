import { createTestDatabase, testDialect } from '@sovereignfs/database/testing';
import { describe } from 'vitest';
import { activitySuite } from './activity.suite';

describe(`activity on ${testDialect}`, () => {
  activitySuite(() => createTestDatabase());
});
