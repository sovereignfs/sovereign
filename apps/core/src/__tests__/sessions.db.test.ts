import { createTestDatabase, testDialect } from '@sovereignfs/database/testing';
import { describe } from 'vitest';
import { sessionsSuite } from './sessions.suite';

describe(`core's own sessions on ${testDialect}`, () => {
  sessionsSuite(() => createTestDatabase());
});
