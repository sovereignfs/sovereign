import { createTestDatabase, testDialect } from '@sovereignfs/database/testing';
import { describe } from 'vitest';
import { signInValuesSuite } from './sign-in-values.suite';

describe(`the instance id and reset links on ${testDialect}`, () => {
  signInValuesSuite(() => createTestDatabase());
});
