import { createTestDatabase, testDialect } from '@sovereignfs/database/testing';
import { describe } from 'vitest';
import { mailForAppsSuite } from './mail-for-apps.suite';

describe(`email for apps on ${testDialect}`, () => {
  mailForAppsSuite(() => createTestDatabase());
});
