import { copyFileSync, existsSync, readdirSync, renameSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import Database from 'better-sqlite3-multiple-ciphers';
import { DbEncryptionConfigError } from './sqlite-encryption';

/**
 * One-time offline conversion between plaintext and SQLCipher-encrypted
 * SQLite files (RFC 0071 `sv db encrypt` / `sv db decrypt`). Not used by the
 * runtime's normal open path — see `sqlite-encryption.ts`'s `openKeyedSqlite`
 * for that.
 */

/**
 * Every SQLite file this instance owns: the platform DB, the auth DB (if
 * present under the same data dir — a Postgres deployment for either has no
 * file here), and every isolated plugin DB under `data/plugins/`.
 */
export function listInstanceSqliteFiles(dataDir: string): string[] {
  const files: string[] = [];
  for (const name of ['sovereign.db', 'auth.db']) {
    const path = join(dataDir, name);
    if (existsSync(path)) files.push(path);
  }
  const pluginsDir = join(dataDir, 'plugins');
  if (existsSync(pluginsDir)) {
    for (const entry of readdirSync(pluginsDir, { withFileTypes: true })) {
      if (entry.isFile() && entry.name.endsWith('.db')) {
        files.push(join(pluginsDir, entry.name));
      }
    }
  }
  return files;
}

/**
 * Checkpoint any pending WAL frames into the main file (so a plain filesystem
 * copy of it is self-consistent) and, in the same pass, a best-effort check
 * that nothing else currently holds the file open for writing.
 *
 * **Not a guarantee** — SQLite's WAL mode allows concurrent readers without a
 * lock a prober can detect, so a live server that is merely idle (no
 * in-flight write) may not be caught here. This is why callers also require a
 * fresh backup and print a loud warning rather than relying on this check
 * alone — same posture as the existing `sv restore` command, which warns
 * rather than attempts true process detection. Any failure here (wrong key,
 * corrupt file, or a live writer holding the lock) surfaces as one message
 * covering all three, since SQLCipher's own errors don't distinguish them.
 */
function checkpointAndProbe(db: InstanceType<typeof Database>, path: string): void {
  try {
    // busy_timeout must be set before anything that can block on another
    // connection's lock — otherwise a checkpoint against a live writer can
    // wait indefinitely instead of failing fast.
    db.pragma('busy_timeout = 200');
    db.pragma('journal_mode = WAL');
    db.pragma('wal_checkpoint(TRUNCATE)');
    db.exec('BEGIN IMMEDIATE');
    db.exec('ROLLBACK');
  } catch (cause) {
    throw new DbEncryptionConfigError(
      `Could not get exclusive access to ${path}. Either the key is wrong, the ` +
        'file is not a valid SQLite database, or the server is still running — ' +
        'stop it before running this command.',
      { cause },
    );
  }
}

/**
 * Encrypt an existing plaintext SQLite file in place (RFC 0071 `sv db
 * encrypt`). Checkpoints the original's WAL into the main file first so a
 * plain file copy is self-consistent, rekeys a temp copy, then atomically
 * renames it over the original — a failure at any point before the rename
 * leaves the original file completely untouched.
 */
export function encryptSqliteFileInPlace(path: string, key: Buffer): void {
  const probe = new Database(path);
  try {
    checkpointAndProbe(probe, path);
  } finally {
    probe.close();
  }

  const tmpPath = `${path}.sv-encrypt-tmp`;
  if (existsSync(tmpPath)) unlinkSync(tmpPath);
  copyFileSync(path, tmpPath);

  const tmp = new Database(tmpPath);
  try {
    tmp.pragma(`cipher='sqlcipher'`);
    tmp.rekey(key);
    tmp.pragma('journal_mode = WAL');
  } finally {
    tmp.close();
  }

  renameSync(tmpPath, path);
  for (const suffix of ['-wal', '-shm']) {
    try {
      unlinkSync(path + suffix);
    } catch {
      // sidecar may not exist — fine.
    }
  }
}

/**
 * Decrypt an existing SQLCipher-encrypted SQLite file in place (RFC 0071 `sv
 * db decrypt`) — the reverse of `encryptSqliteFileInPlace`. `key` must be the
 * key the file is currently encrypted with.
 */
export function decryptSqliteFileInPlace(path: string, key: Buffer): void {
  const probe = new Database(path);
  try {
    probe.pragma(`cipher='sqlcipher'`);
    probe.key(key);
    checkpointAndProbe(probe, path);
  } finally {
    probe.close();
  }

  const tmpPath = `${path}.sv-decrypt-tmp`;
  if (existsSync(tmpPath)) unlinkSync(tmpPath);
  copyFileSync(path, tmpPath);

  const tmp = new Database(tmpPath);
  try {
    tmp.pragma(`cipher='sqlcipher'`);
    tmp.key(key);
    tmp.rekey(Buffer.alloc(0));
    tmp.pragma('journal_mode = WAL');
  } finally {
    tmp.close();
  }

  renameSync(tmpPath, path);
  for (const suffix of ['-wal', '-shm']) {
    try {
      unlinkSync(path + suffix);
    } catch {
      // sidecar may not exist — fine.
    }
  }
}
