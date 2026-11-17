import { tmpdir } from 'node:os';
import path from 'node:path';
import { createTestDatabase } from '@sovereignfs/database/testing';
import { vi } from 'vitest';
import { appVaultSuite } from './app-vault.suite.js';

// A plain `pnpm test` has no database server: run the suite on a SQLite file. The CI legs run it on sqld and PostgreSQL too, from
// app-vault.db.test.ts.
vi.stubEnv('SV_DB_DIALECT', 'sqlite');
vi.stubEnv('SV_SQLITE_URL', `file:${path.join(tmpdir(), 'sv-app-vault.db')}`);

appVaultSuite(() => createTestDatabase());
