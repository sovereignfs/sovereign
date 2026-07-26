import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import Database from 'better-sqlite3-multiple-ciphers';
import { findWorkspaceRoot } from './client';

/**
 * Opt-in, single-key SQLite at-rest encryption (RFC 0071, amended by epic task
 * 8.15). Off by default — absence of `SOVEREIGN_DB_ENCRYPTION_KEY` means
 * nothing is ever encrypted. One key is shared by every SQLite file the
 * instance owns (platform, auth, and every isolated plugin DB) — see RFC 0071
 * Alternative 1 for why a single key was chosen over a per-DB envelope
 * hierarchy — but **enforcement is per-database, not directory-wide**:
 *
 * - The platform core (`sovereign.db` + `auth.db`, tied together, one marker)
 *   is always expected to be encrypted whenever the key is present —
 *   `checkEncryptionMarker` below.
 * - A plugin's isolated SQLite file is encrypted only if its own manifest
 *   declares `database.requireEncryption: true` — its own marker, checked via
 *   `resolvePluginEncryptionKey` below, called from `plugin-client.ts`.
 *
 * Task 8.15 replaced an earlier directory-wide-marker design where the key's
 * presence alone gated *every* SQLite file regardless of which plugin owned
 * it — see `docs/incidents/2026-07-24-rfc-0071-encryption-rollout.md`: setting
 * the key because one plugin required encryption broke four unrelated
 * plugins whose plaintext files had nothing to do with that requirement.
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
 * True if `dataDir` already contains a plaintext **platform core** file
 * (`sovereign.db` or `auth.db`). Distinguishes "existing plaintext core data
 * the operator must run `sv db encrypt` on first" from a genuinely fresh
 * instance with nothing to protect yet — see `checkEncryptionMarker`. Plugin
 * files are not considered here — each has its own marker and its own check,
 * `resolvePluginEncryptionKey` below.
 */
function hasExistingSqliteFiles(dataDir: string): boolean {
  for (const name of ['sovereign.db', 'auth.db']) {
    if (existsSync(join(dataDir, name))) return true;
  }
  return false;
}

/**
 * Fail-fast guard against a key/on-disk-state mismatch for the **platform
 * core** databases (`sovereign.db`, `auth.db` — tied together under one
 * marker; RFC 0071 §3, scope narrowed to core-only by task 8.15). Call once
 * per process, before opening `sovereign.db` or `auth.db`:
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
          'databases, or unset the key to keep running in plaintext. (This check only ' +
          'looks at file names ending in .db, not their contents — if this is a ' +
          "genuinely fresh instance and you're seeing this unexpectedly, check for a " +
          'stray or corrupt .db file left over from an unrelated failure under ' +
          `${dataDir}/plugins/ and move it out.)`,
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
 * Per-plugin encryption state (task 8.15). One sentinel file per isolated
 * plugin SQLite file, alongside it under `plugins/`, independent of the core
 * marker — a plugin's file is encrypted only if this specific marker exists,
 * regardless of whether `sovereign.db`/`auth.db` are.
 */
/** Every plaintext SQLite file starts with this exact 16-byte header. A
 *  SQLCipher-encrypted file's first page is fully ciphertext, so it never
 *  matches. Used only for the backward-compat backfill below — distinguishing
 *  "genuinely plaintext" from "encrypted under the pre-8.15 blanket model" by
 *  marker presence alone is ambiguous (a fresh, never-encrypted file created
 *  *after* the core got encrypted would look identical to a legacy-encrypted
 *  one); reading the actual header removes the ambiguity. */
const SQLITE_PLAINTEXT_HEADER = Buffer.from('SQLite format 3\0', 'utf8');

function looksLikePlaintextSqlite(path: string): boolean {
  let fd: number;
  try {
    fd = openSync(path, 'r');
  } catch {
    return false;
  }
  try {
    const buf = Buffer.alloc(SQLITE_PLAINTEXT_HEADER.length);
    const bytesRead = readSync(fd, buf, 0, buf.length, 0);
    return bytesRead === buf.length && buf.equals(SQLITE_PLAINTEXT_HEADER);
  } catch {
    return false;
  } finally {
    closeSync(fd);
  }
}

function pluginMarkerPath(dataDir: string, pluginId: string): string {
  return join(dataDir, 'plugins', `${pluginId}.db-encrypted`);
}

/** True if this specific plugin's isolated SQLite file has been encrypted. */
export function isPluginEncryptionMarked(dataDir: string, pluginId: string): boolean {
  return existsSync(pluginMarkerPath(dataDir, pluginId));
}

/** Writes one plugin's marker. Idempotent. */
export function writePluginEncryptionMarker(dataDir: string, pluginId: string): void {
  const marker = pluginMarkerPath(dataDir, pluginId);
  mkdirSync(dirname(marker), { recursive: true });
  writeFileSync(marker, `${new Date().toISOString()}\n`);
}

/** Removes one plugin's marker (used by a selective `sv db decrypt`). */
export function clearPluginEncryptionMarker(dataDir: string, pluginId: string): void {
  const marker = pluginMarkerPath(dataDir, pluginId);
  if (existsSync(marker)) unlinkSync(marker);
}

/**
 * Resolve which key (if any) to actually apply when opening one plugin's
 * isolated SQLite file (task 8.15) — the per-database enforcement point that
 * replaced the directory-wide `checkEncryptionMarker` call `getPluginDb` used
 * to make. Returns the key to pass to `openKeyedSqlite`, or `undefined` to
 * open plain — which may differ from whether `SOVEREIGN_DB_ENCRYPTION_KEY` is
 * merely *present* in the environment.
 *
 * - This plugin's file is already marked encrypted → the key is required;
 *   return it, or fail fast if it's missing (same "encrypted but no key"
 *   posture as the core check, scoped to this one plugin).
 * - Not marked, plugin doesn't request encryption → `undefined`. The
 *   instance-wide key is never applied to a plugin that never asked for it —
 *   this is the fix for the 2026-07-24 incident.
 * - Not marked, plugin requests encryption, no key configured → `undefined`
 *   (open plaintext). Warning/loud-logging for this state is
 *   `assertPluginEncryptionRequirement`'s job, not this function's — callers
 *   that only want a working connection (e.g. `sv user reset-mfa`-adjacent
 *   tooling, `sdk.db`) must not be surprised by a throw here.
 * - Not marked, plugin requests encryption, key configured, file already
 *   exists on disk → fail fast: existing plaintext data needs `sv db
 *   encrypt` first, scoped to this plugin only.
 * - Not marked, plugin requests encryption, key configured, file doesn't
 *   exist yet → a brand-new plugin database. Nothing plaintext to protect;
 *   write the marker now and return the key so every page is encrypted from
 *   birth (mirrors the core check's identical "fresh instance" case).
 *
 * **Backward compatibility:** an instance that ran the pre-8.15 directory-wide
 * `sv db encrypt` has the legacy core marker but no per-plugin markers for
 * files that were, in fact, already encrypted blanket-style back then. Before
 * any of the above, if this plugin has no marker yet, the core marker is
 * present, and this plugin's file already exists, check the file's actual
 * header rather than guess: marker presence alone can't tell "genuinely
 * legacy-encrypted" apart from "a file created after the core was encrypted,
 * by a plugin that never asked for encryption" — those look identical by
 * marker state alone but must be handled oppositely. Only backfill (and thus
 * demand the key) when the header confirms this isn't plaintext SQLite.
 */
export function resolvePluginEncryptionKey(
  dataDir: string,
  pluginId: string,
  filePath: string,
  key: Buffer | undefined,
  requiresEncryption: boolean,
): Buffer | undefined {
  if (
    !isPluginEncryptionMarked(dataDir, pluginId) &&
    isEncryptionMarked(dataDir) &&
    existsSync(filePath) &&
    !looksLikePlaintextSqlite(filePath)
  ) {
    writePluginEncryptionMarker(dataDir, pluginId);
  }

  if (isPluginEncryptionMarked(dataDir, pluginId)) {
    if (!key) {
      throw new DbEncryptionConfigError(
        `Plugin "${pluginId}"'s database is encrypted (${pluginMarkerPath(dataDir, pluginId)} ` +
          `is present) but ${KEY_ENV} is not set. Set the key that was used to encrypt it — ` +
          'this plugin cannot be provisioned without it.',
      );
    }
    return key;
  }

  if (!requiresEncryption || !key) return undefined;

  if (existsSync(filePath)) {
    throw new DbEncryptionConfigError(
      `Plugin "${pluginId}" requires database encryption and ${KEY_ENV} is set, but its ` +
        `existing database at ${filePath} has not been encrypted yet. Run \`sv db encrypt\` to ` +
        'convert it, or unset the key to keep this plugin running in plaintext.',
    );
  }

  writePluginEncryptionMarker(dataDir, pluginId);
  return key;
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
