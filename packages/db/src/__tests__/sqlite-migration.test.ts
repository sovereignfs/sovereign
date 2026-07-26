import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3-multiple-ciphers';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  DbEncryptionConfigError,
  checkEncryptionMarker,
  isPluginEncryptionMarked,
  openKeyedSqlite,
  resolvePluginEncryptionKey,
  writeEncryptionMarker,
} from '../sqlite-encryption';
import {
  decryptSqliteFileInPlace,
  encryptSqliteFileInPlace,
  listInstanceSqliteFiles,
} from '../sqlite-migration';

describe('listInstanceSqliteFiles', () => {
  let dataDir: string;

  beforeEach(() => {
    dataDir = mkdtempSync(join(tmpdir(), 'sv-db-list-'));
  });

  afterEach(() => {
    rmSync(dataDir, { recursive: true, force: true });
  });

  it('returns an empty list for an empty data dir', () => {
    expect(listInstanceSqliteFiles(dataDir)).toEqual([]);
  });

  it('finds sovereign.db, auth.db, and every plugins/*.db', () => {
    writeFileSync(join(dataDir, 'sovereign.db'), '');
    writeFileSync(join(dataDir, 'auth.db'), '');
    mkdirSync(join(dataDir, 'plugins'));
    writeFileSync(join(dataDir, 'plugins', 'fs.example.one.db'), '');
    writeFileSync(join(dataDir, 'plugins', 'fs.example.two.db'), '');
    // sidecar files must not be mistaken for a plugin DB
    writeFileSync(join(dataDir, 'plugins', 'fs.example.one.db-wal'), '');

    const files = listInstanceSqliteFiles(dataDir).map((f) => f.replace(dataDir, ''));
    expect(files.sort()).toEqual(
      [
        '/sovereign.db',
        '/auth.db',
        '/plugins/fs.example.one.db',
        '/plugins/fs.example.two.db',
      ].sort(),
    );
  });

  it('omits auth.db when the instance has no separate auth database file here', () => {
    writeFileSync(join(dataDir, 'sovereign.db'), '');
    expect(listInstanceSqliteFiles(dataDir)).toEqual([join(dataDir, 'sovereign.db')]);
  });
});

describe('encryptSqliteFileInPlace / decryptSqliteFileInPlace', () => {
  let dir: string;
  let dbPath: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'sv-db-migrate-'));
    dbPath = join(dir, 'test.db');
    const db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    db.exec('CREATE TABLE t (id INTEGER PRIMARY KEY, v TEXT)');
    db.prepare('INSERT INTO t (v) VALUES (?)').run('hello');
    db.close();
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('encrypts a plaintext file in place, producing genuine ciphertext', () => {
    const key = randomBytes(32);
    encryptSqliteFileInPlace(dbPath, key);

    // Unreadable with no key at all.
    const noKey = new Database(dbPath);
    expect(() => noKey.prepare('SELECT * FROM t').get()).toThrow();
    noKey.close();

    // Readable with the correct key + cipher.
    const withKey = new Database(dbPath);
    withKey.pragma(`cipher='sqlcipher'`);
    withKey.key(key);
    const row = withKey.prepare('SELECT v FROM t WHERE id = 1').get() as { v: string };
    expect(row.v).toBe('hello');
    withKey.close();
  });

  it('leaves the original untouched if the temp file already exists from a prior failed attempt', () => {
    // Simulate a stray leftover from a previous crashed run.
    writeFileSync(`${dbPath}.sv-encrypt-tmp`, 'garbage');
    const key = randomBytes(32);
    expect(() => encryptSqliteFileInPlace(dbPath, key)).not.toThrow();

    const withKey = new Database(dbPath);
    withKey.pragma(`cipher='sqlcipher'`);
    withKey.key(key);
    const row = withKey.prepare('SELECT v FROM t WHERE id = 1').get() as { v: string };
    expect(row.v).toBe('hello');
    withKey.close();
  });

  it('cleans up -wal/-shm sidecars after the atomic swap', () => {
    const key = randomBytes(32);
    encryptSqliteFileInPlace(dbPath, key);
    expect(existsSync(`${dbPath}-wal`)).toBe(false);
    expect(existsSync(`${dbPath}-shm`)).toBe(false);
    expect(existsSync(`${dbPath}.sv-encrypt-tmp`)).toBe(false);
  });

  it('round-trips encrypt then decrypt back to plaintext', () => {
    const key = randomBytes(32);
    encryptSqliteFileInPlace(dbPath, key);
    decryptSqliteFileInPlace(dbPath, key);

    const plain = new Database(dbPath);
    const row = plain.prepare('SELECT v FROM t WHERE id = 1').get() as { v: string };
    expect(row.v).toBe('hello');
    plain.close();
  });

  it('throws DbEncryptionConfigError when decrypting with the wrong key', () => {
    const key = randomBytes(32);
    encryptSqliteFileInPlace(dbPath, key);
    expect(() => decryptSqliteFileInPlace(dbPath, randomBytes(32))).toThrow(
      DbEncryptionConfigError,
    );
    // The file must be untouched by the failed attempt — still openable with the real key.
    const withKey = new Database(dbPath);
    withKey.pragma(`cipher='sqlcipher'`);
    withKey.key(key);
    const row = withKey.prepare('SELECT v FROM t WHERE id = 1').get() as { v: string };
    expect(row.v).toBe('hello');
    withKey.close();
  });

  it('throws DbEncryptionConfigError when another connection holds a write lock', () => {
    const blocker = new Database(dbPath);
    blocker.pragma('journal_mode = WAL');
    blocker.exec('BEGIN IMMEDIATE');
    try {
      expect(() => encryptSqliteFileInPlace(dbPath, randomBytes(32))).toThrow(
        DbEncryptionConfigError,
      );
    } finally {
      blocker.exec('ROLLBACK');
      blocker.close();
    }
  });
});

/**
 * Live, end-to-end reproduction of the 2026-07-24 production incident and its
 * fix (task 8.15), against real files on disk — no mocks anywhere in this
 * block. Mirrors what `sv db encrypt`/`decrypt` actually do: select targets
 * via the real per-database decision functions, convert with the real
 * SQLCipher driver, verify actual on-disk state, then reverse it.
 */
describe('per-database encryption round-trip (task 8.15 — full incident reproduction)', () => {
  let dataDir: string;
  let key: Buffer;

  function seedRealSqliteFile(path: string): void {
    mkdirSync(join(path, '..'), { recursive: true });
    const db = new Database(path);
    db.pragma('journal_mode = WAL');
    db.exec('CREATE TABLE t (id INTEGER PRIMARY KEY, v TEXT)');
    db.prepare('INSERT INTO t (v) VALUES (?)').run(path);
    db.close();
  }

  function readPlaintext(path: string): string {
    const db = new Database(path);
    const row = db.prepare('SELECT v FROM t WHERE id = 1').get() as { v: string };
    db.close();
    return row.v;
  }

  function readEncrypted(path: string, k: Buffer): string {
    const db = new Database(path);
    db.pragma(`cipher='sqlcipher'`);
    db.key(k);
    const row = db.prepare('SELECT v FROM t WHERE id = 1').get() as { v: string };
    db.close();
    return row.v;
  }

  beforeEach(() => {
    dataDir = mkdtempSync(join(tmpdir(), 'sv-db-incident-'));
    key = randomBytes(32);
    // Five plugins, mirroring the incident's cast exactly: one requires
    // encryption (healthlog), four don't (docs, plainwrite, shopper, wallet).
    for (const id of ['healthlog', 'docs', 'plainwrite', 'shopper', 'wallet']) {
      seedRealSqliteFile(join(dataDir, 'plugins', `${id}.db`));
    }
    seedRealSqliteFile(join(dataDir, 'sovereign.db'));
    seedRealSqliteFile(join(dataDir, 'auth.db'));
  });

  afterEach(() => {
    rmSync(dataDir, { recursive: true, force: true });
  });

  it('setting the key because one plugin requires encryption leaves every other plugin plaintext and bootable', () => {
    // 1. Before conversion, booting with the key set correctly refuses —
    //    same as any pre-existing-plaintext-instance boot today.
    expect(() => checkEncryptionMarker(dataDir, true)).toThrow(DbEncryptionConfigError);

    // `sv db encrypt`'s real sequence: convert every core file, then write
    // the marker only once both succeed.
    encryptSqliteFileInPlace(join(dataDir, 'sovereign.db'), key);
    encryptSqliteFileInPlace(join(dataDir, 'auth.db'), key);
    writeEncryptionMarker(dataDir);

    // Now a subsequent boot (or the auth process opening its own file) sees
    // the marker and proceeds normally.
    expect(() => checkEncryptionMarker(dataDir, true)).not.toThrow();

    // 2. Only healthlog requests encryption — via the real getPluginDb
    //    decision function. Its file already exists as plaintext (seeded
    //    above), so resolving its key fails fast: `sv db encrypt` is needed
    //    first, exactly the flow self-hosting.md documents.
    expect(() =>
      resolvePluginEncryptionKey(
        dataDir,
        'healthlog',
        join(dataDir, 'plugins', 'healthlog.db'),
        key,
        true,
      ),
    ).toThrow(DbEncryptionConfigError);

    // Every plugin that does NOT request encryption resolves to "open plain"
    // — no throw, no marker, key never applied — even though the key is
    // present and even though healthlog (a sibling plugin) just failed.
    for (const id of ['docs', 'plainwrite', 'shopper', 'wallet']) {
      const path = join(dataDir, 'plugins', `${id}.db`);
      const resolvedKey = resolvePluginEncryptionKey(dataDir, id, path, key, false);
      expect(resolvedKey).toBeUndefined();
    }

    // 3. The actual conversion step, selective — exactly what `sv db
    //    encrypt` does in response to the failure above: only encrypt files
    //    that need it. healthlog needs `sv db encrypt` explicitly since its
    //    file pre-existed as plaintext.
    encryptSqliteFileInPlace(join(dataDir, 'plugins', 'healthlog.db'), key);

    // 4. Verify: healthlog is genuine ciphertext; every other plugin is
    //    still genuinely plaintext and opens with zero key involvement —
    //    this is the actual incident scenario, fixed.
    expect(readEncrypted(join(dataDir, 'plugins', 'healthlog.db'), key)).toBe(
      join(dataDir, 'plugins', 'healthlog.db'),
    );
    for (const id of ['docs', 'plainwrite', 'shopper', 'wallet']) {
      const path = join(dataDir, 'plugins', `${id}.db`);
      expect(readPlaintext(path)).toBe(path); // opens fine with NO key at all
      expect(isPluginEncryptionMarked(dataDir, id)).toBe(false);
    }

    // 5. Core is also genuinely encrypted.
    expect(readEncrypted(join(dataDir, 'sovereign.db'), key)).toBe(join(dataDir, 'sovereign.db'));
    expect(readEncrypted(join(dataDir, 'auth.db'), key)).toBe(join(dataDir, 'auth.db'));

    // 6. Full reversal: decrypt core + healthlog back to plaintext; the
    //    never-encrypted plugins were never touched, so there's nothing to
    //    decrypt for them.
    decryptSqliteFileInPlace(join(dataDir, 'sovereign.db'), key);
    decryptSqliteFileInPlace(join(dataDir, 'auth.db'), key);
    decryptSqliteFileInPlace(join(dataDir, 'plugins', 'healthlog.db'), key);
    expect(readPlaintext(join(dataDir, 'sovereign.db'))).toBe(join(dataDir, 'sovereign.db'));
    expect(readPlaintext(join(dataDir, 'auth.db'))).toBe(join(dataDir, 'auth.db'));
    expect(readPlaintext(join(dataDir, 'plugins', 'healthlog.db'))).toBe(
      join(dataDir, 'plugins', 'healthlog.db'),
    );
  });

  it('a requesting plugin whose file already exists as plaintext fails fast, scoped to it alone, before any conversion happens', () => {
    writeFileSync(join(dataDir, '.db-encrypted'), 'x'); // core already encrypted in this scenario
    const path = join(dataDir, 'plugins', 'healthlog.db');
    expect(() => resolvePluginEncryptionKey(dataDir, 'healthlog', path, key, true)).toThrow(
      DbEncryptionConfigError,
    );
    // Every other plugin is completely unaffected by healthlog's failure.
    for (const id of ['docs', 'plainwrite', 'shopper', 'wallet']) {
      const otherPath = join(dataDir, 'plugins', `${id}.db`);
      expect(resolvePluginEncryptionKey(dataDir, id, otherPath, key, false)).toBeUndefined();
      expect(readPlaintext(otherPath)).toBe(otherPath);
    }
  });

  it('a brand-new requesting plugin with no existing file is encrypted from birth via the real driver', () => {
    const path = join(dataDir, 'plugins', 'new-plugin.db');
    const resolvedKey = resolvePluginEncryptionKey(dataDir, 'new-plugin', path, key, true);
    expect(resolvedKey).toBe(key);
    expect(isPluginEncryptionMarked(dataDir, 'new-plugin')).toBe(true);

    const db = openKeyedSqlite(path, resolvedKey);
    db.exec('CREATE TABLE t (id INTEGER PRIMARY KEY, v TEXT)');
    db.prepare('INSERT INTO t (v) VALUES (?)').run('encrypted-from-birth');
    db.close();

    // Genuinely encrypted: readable with the key, not readable without it.
    expect(readEncrypted(path, key)).toBe('encrypted-from-birth');
    const reopened = new Database(path);
    expect(() => reopened.prepare('SELECT * FROM t').get()).toThrow();
    reopened.close();
  });
});
