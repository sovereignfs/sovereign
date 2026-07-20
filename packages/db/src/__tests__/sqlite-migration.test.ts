import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3-multiple-ciphers';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DbEncryptionConfigError } from '../sqlite-encryption';
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
