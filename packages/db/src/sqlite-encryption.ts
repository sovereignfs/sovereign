import Database from 'better-sqlite3-multiple-ciphers';

/**
 * SQLite at-rest encryption (RFC 0071) was retired from the live database
 * path — an instance running SQLite today has no at-rest encryption option;
 * that's deferred to a future resolution (see the platform's own tracking).
 *
 * What's left here is narrowly scoped: `SOVEREIGN_DB_ENCRYPTION_KEY` and
 * `openKeyedSqlite` still exist **only** so `sv db migrate-to-postgres`
 * (`postgres-migration.ts`, TRANSITIONAL TOOLING) can read a **legacy**
 * plain-file SQLite database that was encrypted under the old scheme, when
 * migrating a pre-this-change instance straight to Postgres. Nothing in the
 * live server (`client.ts`, `plugin-client.ts`, `apps/auth`) reads this key
 * or opens a keyed file anymore.
 */
const KEY_ENV = 'SOVEREIGN_DB_ENCRYPTION_KEY';

export class DbEncryptionConfigError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'DbEncryptionConfigError';
  }
}

/** Same encoding rules as `SOVEREIGN_VAULT_KEY` (runtime/src/secrets.ts) — kept in sync intentionally. */
function decodeKey(raw: string): Buffer | null {
  const trimmed = raw.trim();
  if (/^[0-9a-fA-F]{64}$/.test(trimmed)) return Buffer.from(trimmed, 'hex');
  for (const normalized of [trimmed, trimmed.replace(/-/g, '+').replace(/_/g, '/')]) {
    const key = Buffer.from(normalized, 'base64');
    if (key.length === 32) return key;
  }
  return null;
}

/**
 * Reads `SOVEREIGN_DB_ENCRYPTION_KEY` for the one-time migration-tool use
 * case described above. Absence is not an error — most invocations won't
 * need it (only a legacy encrypted source does). A key that is set but
 * malformed is a hard configuration error (fail-fast), so a typo never
 * silently fails to decrypt.
 */
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

/**
 * Open a SQLite file through the SQLCipher-capable driver, applying `key` (if
 * given) before any other statement. Used only by `sv db migrate-to-postgres`
 * to read a legacy encrypted source file — see the module doc comment.
 */
export function openKeyedSqlite(path: string, key: Buffer | undefined): Database.Database {
  const sqlite = new Database(path);
  if (key) {
    // better-sqlite3-multiple-ciphers supports several cipher schemes and
    // defaults to its own ("sqleet") — explicitly select the SQLCipher-
    // compatible one so the on-disk format matches what the legacy RFC 0071
    // implementation used, and standard SQLCipher tooling can read it too.
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
