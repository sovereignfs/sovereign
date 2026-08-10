import { createClient, resolveDialect, type PlatformDb } from '@sovereignfs/db';

let _devDb: PlatformDb | null = null;

/**
 * Returns the dev-mode mock database client (RFC 0020). Lazily initialized on
 * the first dev-mode request. The database at SOVEREIGN_DEV_DATABASE_URL must
 * have been seeded with `sv seed` beforehand.
 *
 * `SOVEREIGN_DEV_DATABASE_URL`'s meaning is dialect-dependent: on Postgres a
 * full connection string (a genuinely separate database, same as before); on
 * SQLite an sqld namespace name — there's no more plain-file path for it to
 * be a `file:` URL to. Both keep the same guarantee: dev-mode requests never
 * touch the real platform database.
 *
 * Cached as a process-level singleton (same lifecycle as the real DB) — lazy
 * construction is not a per-request concern.
 */
export function getDevDb(): PlatformDb {
  if (!_devDb) {
    const configured = process.env.SOVEREIGN_DEV_DATABASE_URL;
    if (!configured) {
      throw new Error(
        'Dev-mode is active but SOVEREIGN_DEV_DATABASE_URL is not configured. Set it to the ' +
          'mock database seeded by `sv seed` — a postgres:// URL on Postgres, or an sqld ' +
          'namespace name on SQLite.',
      );
    }
    const { dialect } = resolveDialect(process.env);
    _devDb =
      dialect === 'postgres'
        ? createClient({ dialect, url: configured })
        : createClient({ dialect, namespace: configured });
  }
  return _devDb;
}
