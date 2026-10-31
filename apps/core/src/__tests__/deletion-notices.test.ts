import { createTestDatabase } from '@sovereignfs/database/testing';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { vi } from 'vitest';
import { deletionNoticesSuite } from './deletion-notices.suite';

vi.stubEnv('SV_DB_DIALECT', 'sqlite');
vi.stubEnv('SV_SQLITE_URL', `file:${path.join(tmpdir(), 'sv-core-deletion-notices.db')}`);

deletionNoticesSuite(() => createTestDatabase());
