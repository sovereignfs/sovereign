import { describe, expect, it } from 'vitest';
import { createClient, type PlatformDb } from '../client';
import { runMigrations } from '../migrate';
import { getPlatformSetting, setPlatformSetting } from '../platform-db';

/**
 * runMigrations() applies the real on-disk SQLite migrations to an in-memory DB
 * (the migrator finds them via findWorkspaceRoot() → repo root in the test cwd),
 * then seeds rows and returns a MigrationResult. These tests exercise the
 * downgrade-detection / version high-water-mark behaviour (RFC 0006).
 */
function memDb(): PlatformDb {
  return createClient({ url: ':memory:' });
}

describe('runMigrations — version tracking & downgrade guard', () => {
  it('records the running version and reports no downgrade on a fresh install', async () => {
    const db = memDb();
    const result = await runMigrations(db);

    expect(result.previousVersion).toBeNull();
    expect(result.downgradeDetected).toBe(false);
    // The running version is now persisted for the next startup to compare.
    expect(await getPlatformSetting(db, 'platform_version')).toBe(result.currentVersion);
  });

  it('reports no downgrade on an unchanged restart', async () => {
    const db = memDb();
    const first = await runMigrations(db);
    const second = await runMigrations(db);

    expect(second.previousVersion).toBe(first.currentVersion);
    expect(second.downgradeDetected).toBe(false);
  });

  it('detects a downgrade and keeps the higher stored version (watermark)', async () => {
    const db = memDb();
    await runMigrations(db);
    // Simulate the DB having been written by a much newer binary.
    await setPlatformSetting(db, 'platform_version', '999.0.0');

    const result = await runMigrations(db);

    expect(result.previousVersion).toBe('999.0.0');
    expect(result.downgradeDetected).toBe(true);
    // The warning must persist: the stored version stays at the high-water mark
    // rather than being overwritten with the older running version.
    expect(await getPlatformSetting(db, 'platform_version')).toBe('999.0.0');
  });
});
