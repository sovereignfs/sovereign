import { createTestDatabase, testDialect } from '@sovereignfs/database/testing';
import { describe } from 'vitest';
import { passkeySuite } from './passkey.suite';

describe(`core's passkeys on ${testDialect}`, () => {
  passkeySuite(() => createTestDatabase());
});
