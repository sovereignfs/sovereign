import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import Database from 'better-sqlite3-multiple-ciphers';

/**
 * Opt-in, single-key SQLite at-rest encryption (RFC 0071) — the auth server's
 * own copy. Deliberately self-contained rather than imported from
 * `@sovereignfs/db` (see `apps/auth/src/db.ts`'s header comment; the auth
 * server does not depend on `packages/db`), mirroring
 * `packages/db/src/sqlite-encryption.ts` field-for-field so the two stay
 * conceptually interchangeable. Keep both in sync intentionally.
 */
const KEY_ENV = 'SOVEREIGN_DB_ENCRYPTION_KEY';
const MARKER_FILENAME = '.db-encrypted';

export class DbEncryptionConfigError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'DbEncryptionConfigError';
  }
}

function decodeKey(raw: string): Buffer | null {
  const trimmed = raw.trim();
  if (/^[0-9a-fA-F]{64}$/.test(trimmed)) return Buffer.from(trimmed, 'hex');
  for (const normalized of [trimmed, trimmed.replace(/-/g, '+').replace(/_/g, '/')]) {
    const key = Buffer.from(normalized, 'base64');
    if (key.length === 32) return key;
  }
  return null;
}

/** Absence is not an error — encryption is opt-in and off by default. */
export function dbEncryptionKeyFromEnv(): Buffer | undefined {
  const raw = process.env[KEY_ENV];
  if (!raw) return undefined;
  const key = decodeKey(raw);
  if (!key) {
    throw new DbEncryptionConfigError(
      `${KEY_ENV} must be a 32-byte key encoded as base64, base64url, or 64-character hex.`,
    );
  }
  return key;
}

function markerPath(dataDir: string): string {
  return join(dataDir, MARKER_FILENAME);
}

/** Same "does anything already exist" check as `packages/db/src/sqlite-encryption.ts` — see there. */
function hasExistingSqliteFiles(dataDir: string): boolean {
  for (const name of ['sovereign.db', 'auth.db']) {
    if (existsSync(join(dataDir, name))) return true;
  }
  const pluginsDir = join(dataDir, 'plugins');
  if (existsSync(pluginsDir)) {
    for (const entry of readdirSync(pluginsDir, { withFileTypes: true })) {
      if (entry.isFile() && entry.name.endsWith('.db')) return true;
    }
  }
  return false;
}

/** Same fail-fast guard as `packages/db/src/sqlite-encryption.ts` — see there for the five cases. */
export function checkEncryptionMarker(dataDir: string, keyPresent: boolean): void {
  const marker = markerPath(dataDir);
  const markerPresent = existsSync(marker);

  if (markerPresent && !keyPresent) {
    throw new DbEncryptionConfigError(
      `This instance's databases are encrypted (${marker} is present) but ` +
        `${KEY_ENV} is not set. Set the key that was used to encrypt them — the ` +
        'instance cannot start without it.',
    );
  }
  if (!markerPresent && keyPresent) {
    if (hasExistingSqliteFiles(dataDir)) {
      throw new DbEncryptionConfigError(
        `${KEY_ENV} is set, but the data directory at ${dataDir} has not been ` +
          'encrypted yet. Run `sv db encrypt` first to convert existing plaintext ' +
          'databases, or unset the key to keep running in plaintext.',
      );
    }
    writeEncryptionMarker(dataDir);
  }
}

/** Writes the marker. Call only after every SQLite file in `dataDir` has been converted. Idempotent. */
export function writeEncryptionMarker(dataDir: string): void {
  mkdirSync(dataDir, { recursive: true });
  writeFileSync(markerPath(dataDir), `${new Date().toISOString()}\n`);
}

/**
 * Open a SQLite file through the SQLCipher-capable driver, applying the
 * instance key (if configured) before any other statement. The single
 * chokepoint `apps/auth` uses for its one SQLite file (`auth.db`).
 */
export function openKeyedSqlite(path: string, key: Buffer | undefined): Database.Database {
  const sqlite = new Database(path);
  if (key) {
    // better-sqlite3-multiple-ciphers defaults to its own cipher ("sqleet")
    // — explicitly select the SQLCipher-compatible one so the on-disk format
    // matches packages/db's twin and what RFC 0071 documents.
    sqlite.pragma(`cipher='sqlcipher'`);
    sqlite.key(key);
  }
  try {
    sqlite.pragma('journal_mode = WAL');
  } catch (cause) {
    sqlite.close();
    throw new DbEncryptionConfigError(
      key
        ? `Could not open ${path} with the configured ${KEY_ENV} — the key is ` +
            'likely wrong, or this file was encrypted with a different one.'
        : `Could not open ${path} — it may be encrypted; set ${KEY_ENV} to open it.`,
      { cause },
    );
  }
  sqlite.pragma('foreign_keys = ON');
  return sqlite;
}
