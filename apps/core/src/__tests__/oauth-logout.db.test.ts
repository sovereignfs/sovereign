import { createTestDatabase, testDialect } from '@sovereignfs/database/testing';
import { describe } from 'vitest';
import { oauthLogoutSuite } from './oauth-logout.suite';

describe(`core's logout and revocation on ${testDialect}`, () => {
  oauthLogoutSuite(() => createTestDatabase());
});
