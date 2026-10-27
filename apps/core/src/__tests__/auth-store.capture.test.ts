/**
 * Writes a new fixture for `fixtures/auth-store`, from the better-auth that is installed. It does
 * nothing in a normal run. To keep a record of what a version wrote (do this when upgrading
 * better-auth, before the upgrade, and keep the old file):
 *
 *   SV_CAPTURE_AUTH_STORE=1 pnpm vitest run --project unit auth-store.capture
 */
import { createTestDatabase } from '@sovereignfs/database/testing';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { migrateCore } from '../db/migrate';
import { makeAuth, PASSWORD, SECRET, signUp } from './auth-harness';
import { FIXTURES, readStore, type StoreFixture } from './auth-store';

vi.stubEnv('SV_DB_DIALECT', 'sqlite');
vi.stubEnv('SV_SQLITE_URL', `file:${path.join(tmpdir(), 'sv-core-auth-capture.db')}`);

const FAR_FUTURE = Date.UTC(2100, 0, 1);

describe.skipIf(!process.env.SV_CAPTURE_AUTH_STORE)('capturing the auth store', () => {
  it('writes the rows the installed better-auth makes', async () => {
    const { version } = JSON.parse(
      readFileSync(
        path.join(import.meta.dirname, '../../node_modules/better-auth/package.json'),
        'utf8',
      ),
    ) as { version: string };
    const target = await createTestDatabase();
    const db = await target.open();
    try {
      await migrateCore(db, path.join(import.meta.dirname, '../../migrations'));
      const auth = makeAuth(db);
      const { jar, email } = await signUp(auth, {
        email: 'captured@example.com',
        name: 'Captured Person',
      });
      // A session that is still live whenever the fixture is read.
      await db.run('update sessions set expires_at = ?', [FAR_FUTURE]);

      const cookie = jar.without('better-auth.session_data').header();
      expect(cookie).toContain('better-auth.session_token=');
      const fixture: StoreFixture = {
        betterAuth: version,
        secret: SECRET,
        email,
        password: PASSWORD,
        cookie: cookie ?? '',
        tables: await readStore(db),
      };
      mkdirSync(FIXTURES, { recursive: true });
      writeFileSync(
        path.join(FIXTURES, `better-auth-${version}.json`),
        `${JSON.stringify(fixture, null, 2)}\n`,
      );
    } finally {
      await db.close();
      await target.cleanup();
    }
  });
});
