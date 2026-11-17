import { createTestDatabase } from '@sovereignfs/database/testing';
import { appVaultSuite } from './app-vault.suite.js';

// On the dialect SV_DB_DIALECT names: sqld, a SQLite file or PostgreSQL.
appVaultSuite(() => createTestDatabase());
