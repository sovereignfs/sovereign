import { createTestDatabase, testDialect } from '@sovereignfs/database/testing';
import { describe } from 'vitest';
import { capabilityConfigSuite } from './capability-config.suite';

describe(`core's capability matrix edits on ${testDialect}`, () => {
  capabilityConfigSuite(() => createTestDatabase());
});
