import { existsSync, mkdirSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import Database from 'better-sqlite3-multiple-ciphers';
import { findWorkspaceRoot } from './client';

/**
 * Opt-in, single-key SQLite at-rest encryption (RFC 0071). Off by default —
 * presence of `SOVEREIGN_DB_ENCRYPTION_KEY` is the toggle, no separate boolean.
 * One key encrypts every SQLite file the instance owns (platform, auth, and
 * every isolated plugin DB) — see RFC 0071 Alternative 1 for why a single key
 * was chosen over a per-DB envelope hierarchy.
 */
const KEY_ENV = 'SOVEREIGN_DB_ENCRYPTION_KEY';
const MARKER_FILENAME = '.db-encrypted';

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
 * Reads `SOVEREIGN_DB_ENCRYPTION_KEY`. Absence is **not** an error — SQLite
 * encryption is opt-in and off by default. A key that is set but malformed is
 * a hard configuration error (fail-fast, same discipline as `AUTH_SECRET` /
 * `SOVEREIGN_VAULT_KEY`), so a typo never silently falls back to plaintext.
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
 * The data directory all of an instance's SQLite files share
 * (`data/sovereign.db`, `data/auth.db`, `data/plugins/<id>.db` — see
 * docs/self-hosting.md's documented layout). The marker lives here rather
 * than per-file because one key covers every file; both the runtime and auth
 * processes resolve the same path via the shared mounted volume.
 */
export function defaultDataDir(): string {
  return join(findWorkspaceRoot(), 'data');
}

function markerPath(dataDir: string): string {
  return join(dataDir, MARKER_FILENAME);
}

/** True if this data directory has been converted to encrypted SQLite files. */
export function isEncryptionMarked(dataDir: string): boolean {
  return existsSync(markerPath(dataDir));
}

/**
 * True if `dataDir` already contains at least one plaintext SQLite file this
 * instance would own (`sovereign.db`, `auth.db`, or anything under
 * `plugins/*.db`). Distinguishes "existing plaintext data the operator must
 * run `sv db encrypt` on first" from a genuinely fresh instance with nothing
 * to protect yet — see `checkEncryptionMarker`.
 */
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

/**
 * Fail-fast guard against a key/on-disk-state mismatch (RFC 0071 §3). Call
 * once per process, before opening any SQLite file in `dataDir`:
 *
 * - marker absent,  key absent  → plaintext boot, normal, no-op today.
 * - marker present, key present → encrypted boot, normal.
 * - marker present, key absent  → databases are encrypted but the key is
 *   missing. Fail loudly here rather than let every subsequent `Database`
 *   open fail with SQLCipher's generic, indistinguishable "file is not a
 *   database" error.
 * - marker absent,  key present, pre-existing plaintext files → refuse to
 *   start rather than silently begin writing plaintext pages into files the
 *   operator now believes are encrypted; point at the migration tool instead.
 * - marker absent,  key present, no pre-existing files → a fresh instance
 *   enabling encryption from day one (docs/self-hosting.md "Enabling on a
 *   fresh instance"). Nothing plaintext exists to protect, so write the
 *   marker now rather than fail — every file this and any sibling process
 *   (e.g. the auth server, sharing this data dir) creates from here on is
 *   opened with the key already applied.
 */
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

/** Removes the marker (used by `sv db decrypt`). `isEncryptionMarked` keys off file existence. */
export function clearEncryptionMarker(dataDir: string): void {
  const marker = markerPath(dataDir);
  if (existsSync(marker)) unlinkSync(marker);
}

/**
 * Open a SQLite file through the SQLCipher-capable driver (RFC 0071),
 * applying the instance key — if configured — before any other statement,
 * then the standard pragmas. This is the single chokepoint every SQLite call
 * site in this package (and its self-contained `apps/auth` twin) uses, so
 * keying can never be accidentally skipped at one site.
 *
 * Does not itself check the marker — a process opens many files (platform +
 * N isolated plugin DBs) from one data directory; call `checkEncryptionMarker`
 * once per process against the shared data dir, not once per file.
 */
export function openKeyedSqlite(path: string, key: Buffer | undefined): Database.Database {
  const sqlite = new Database(path);
  if (key) {
    // better-sqlite3-multiple-ciphers supports several cipher schemes and
    // defaults to its own ("sqleet") — explicitly select the SQLCipher-
    // compatible one so the on-disk format matches what RFC 0071 documents
    // and standard SQLCipher tooling can read it, rather than an
    // implementation-detail default.
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
