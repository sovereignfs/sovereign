import { createTestDatabase, testDialect } from '@sovereignfs/database/testing';
import { describe } from 'vitest';
import { appTokensSuite } from './app-tokens.suite';

describe(`app tokens on ${testDialect}`, () => {
  appTokensSuite(() => createTestDatabase());
});
