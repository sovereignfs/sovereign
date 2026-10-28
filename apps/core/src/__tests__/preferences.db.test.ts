import { createTestDatabase, testDialect } from '@sovereignfs/database/testing';
import { describe } from 'vitest';
import { preferencesSuite } from './preferences.suite';

describe(`core's preferences on ${testDialect}`, () => {
  preferencesSuite(() => createTestDatabase());
});
