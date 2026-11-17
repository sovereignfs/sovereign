import { createTestDatabase, testDialect } from '@sovereignfs/database/testing';
import { describe } from 'vitest';
import { shortcutsSuite } from './shortcuts.suite';

describe(`core's launcher shortcuts on ${testDialect}`, () => {
  shortcutsSuite(() => createTestDatabase());
});
