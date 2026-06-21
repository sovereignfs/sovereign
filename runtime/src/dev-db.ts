import { createClient, type PlatformDb } from '@sovereignfs/db';

let _devDb: PlatformDb | null = null;

/**
 * Returns the dev-mode mock database client (RFC 0020). Lazily initialized on
 * the first dev-mode request. The database at SOVEREIGN_DEV_DATABASE_URL must
 * have been seeded with `sv seed` beforehand.
 *
 * Cached as a process-level singleton (same lifecycle as the real DB) — lazy
 * construction is not a per-request concern.
 */
export function getDevDb(): PlatformDb {
  if (!_devDb) {
    const url = process.env.SOVEREIGN_DEV_DATABASE_URL;
    if (!url) {
      throw new Error(
        'Dev-mode is active but SOVEREIGN_DEV_DATABASE_URL is not configured. ' +
          'Set it to the mock database URL seeded by `sv seed`.',
      );
    }
    _devDb = createClient({ url });
  }
  return _devDb;
}
