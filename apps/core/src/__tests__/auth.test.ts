import { createTestDatabase } from '@sovereignfs/database/testing';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { vi } from 'vitest';
import { authSuite } from './auth.suite';

// A plain `pnpm test` has no database server: run the suite on a SQLite file. The CI legs
// run it on sqld and PostgreSQL too, from auth.db.test.ts.
vi.stubEnv('SV_DB_DIALECT', 'sqlite');
vi.stubEnv('SV_SQLITE_URL', `file:${path.join(tmpdir(), 'sv-core-auth.db')}`);

authSuite(() => createTestDatabase());
