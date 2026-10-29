import { createTestDatabase, testDialect } from '@sovereignfs/database/testing';
import { describe } from 'vitest';
import { oauthSuite } from './oauth.suite';

describe(`core's OpenID Connect provider on ${testDialect}`, () => {
  oauthSuite(() => createTestDatabase());
});
