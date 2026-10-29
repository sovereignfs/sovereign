import { createTestDatabase, testDialect } from '@sovereignfs/database/testing';
import { describe } from 'vitest';
import { instanceManageSuite } from './instance-manage.suite';

describe(`core's instance settings on ${testDialect}`, () => {
  instanceManageSuite(() => createTestDatabase());
});
