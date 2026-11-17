import { createTestDatabase, testDialect } from '@sovereignfs/database/testing';
import { describe } from 'vitest';
import { keyVaultSuite } from './key-vault.suite';

describe(`the key vault on ${testDialect}`, () => {
  keyVaultSuite(() => createTestDatabase());
});
