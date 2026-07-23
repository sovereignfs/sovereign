import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  DbEncryptionConfigError,
  checkEncryptionMarker,
  clearEncryptionMarker,
  dbEncryptionKeyFromEnv,
  isEncryptionMarked,
  openKeyedSqlite,
  writeEncryptionMarker,
} from '../sqlite-encryption';

const KEY_ENV = 'SOVEREIGN_DB_ENCRYPTION_KEY';

describe('dbEncryptionKeyFromEnv', () => {
  const originalValue = process.env[KEY_ENV];

  afterEach(() => {
    if (originalValue === undefined) Reflect.deleteProperty(process.env, KEY_ENV);
    else process.env[KEY_ENV] = originalValue;
  });

  it('returns undefined when unset — encryption is opt-in, off by default', () => {
    Reflect.deleteProperty(process.env, KEY_ENV);
    expect(dbEncryptionKeyFromEnv()).toBeUndefined();
  });

  it('decodes a 64-character hex key', () => {
    process.env[KEY_ENV] = 'a'.repeat(64);
    const key = dbEncryptionKeyFromEnv();
    expect(key).toBeInstanceOf(Buffer);
    expect(key?.length).toBe(32);
  });

  it('decodes a base64 32-byte key', () => {
    process.env[KEY_ENV] = randomBytes(32).toString('base64');
    expect(dbEncryptionKeyFromEnv()?.length).toBe(32);
  });

  it('decodes a base64url 32-byte key', () => {
    process.env[KEY_ENV] = randomBytes(32).toString('base64url');
    expect(dbEncryptionKeyFromEnv()?.length).toBe(32);
  });

  it('throws DbEncryptionConfigError for a malformed key rather than silently falling back to plaintext', () => {
    process.env[KEY_ENV] = 'not-a-valid-key';
    expect(() => dbEncryptionKeyFromEnv()).toThrow(DbEncryptionConfigError);
  });
});

describe('encryption marker', () => {
  let dataDir: string;

  beforeEach(() => {
    dataDir = mkdtempSync(join(tmpdir(), 'sv-db-marker-'));
  });

  afterEach(() => {
    rmSync(dataDir, { recursive: true, force: true });
  });

  it('plaintext boot (no marker, no key) is a no-op', () => {
    expect(() => checkEncryptionMarker(dataDir, false)).not.toThrow();
  });

  it('encrypted boot (marker present, key present) is a no-op', () => {
    writeEncryptionMarker(dataDir);
    expect(() => checkEncryptionMarker(dataDir, true)).not.toThrow();
  });

  it('fails fast when the marker is present but the key is missing', () => {
    writeEncryptionMarker(dataDir);
    expect(() => checkEncryptionMarker(dataDir, false)).toThrow(DbEncryptionConfigError);
  });

  it('fails fast when the key is present and pre-existing plaintext files exist', () => {
    writeFileSync(join(dataDir, 'sovereign.db'), '');
    expect(() => checkEncryptionMarker(dataDir, true)).toThrow(DbEncryptionConfigError);
  });

  it('fails fast when the key is present and an isolated plugin db pre-exists', () => {
    mkdirSync(join(dataDir, 'plugins'));
    writeFileSync(join(dataDir, 'plugins', 'fs.example.one.db'), '');
    expect(() => checkEncryptionMarker(dataDir, true)).toThrow(DbEncryptionConfigError);
  });

  it('writes the marker instead of throwing on a genuinely fresh, empty data dir', () => {
    // "Enabling on a fresh instance" (docs/self-hosting.md): the key is set
    // before the instance is ever started, so there is nothing plaintext to
    // protect — the guard should let the boot proceed by marking the dir as
    // encrypted, not fail with "run `sv db encrypt` first".
    expect(() => checkEncryptionMarker(dataDir, true)).not.toThrow();
    expect(isEncryptionMarked(dataDir)).toBe(true);
    // A second call (e.g. the sibling auth process, or the next SQLite file
    // this same process opens) now sees the marker and is a normal no-op.
    expect(() => checkEncryptionMarker(dataDir, true)).not.toThrow();
  });

  it('isEncryptionMarked reflects marker presence', () => {
    expect(isEncryptionMarked(dataDir)).toBe(false);
    writeEncryptionMarker(dataDir);
    expect(isEncryptionMarked(dataDir)).toBe(true);
  });

  it('clearEncryptionMarker removes the marker so isEncryptionMarked flips back to false', () => {
    writeEncryptionMarker(dataDir);
    expect(isEncryptionMarked(dataDir)).toBe(true);
    clearEncryptionMarker(dataDir);
    expect(isEncryptionMarked(dataDir)).toBe(false);
    // And the fail-fast guard now treats this as a fresh plaintext data dir.
    expect(() => checkEncryptionMarker(dataDir, false)).not.toThrow();
  });

  it('clearEncryptionMarker is a no-op when no marker exists', () => {
    expect(() => clearEncryptionMarker(dataDir)).not.toThrow();
  });
});

describe('openKeyedSqlite', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'sv-db-keyed-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('opens a plaintext file when no key is supplied', () => {
    const path = join(dir, 'plain.db');
    const db = openKeyedSqlite(path, undefined);
    db.exec('CREATE TABLE t (id INTEGER PRIMARY KEY)');
    db.close();
  });

  it('round-trips through the correct key and rejects the wrong one', () => {
    const path = join(dir, 'enc.db');
    const key = randomBytes(32);

    const db1 = openKeyedSqlite(path, key);
    db1.exec('CREATE TABLE t (id INTEGER PRIMARY KEY, v TEXT)');
    db1.prepare('INSERT INTO t (v) VALUES (?)').run('secret');
    db1.close();

    const db2 = openKeyedSqlite(path, key);
    const row = db2.prepare('SELECT v FROM t WHERE id = 1').get() as { v: string };
    expect(row.v).toBe('secret');
    db2.close();

    expect(() => openKeyedSqlite(path, randomBytes(32))).toThrow(DbEncryptionConfigError);
  });

  it('rejects opening an encrypted file with no key at all', () => {
    const path = join(dir, 'enc2.db');
    const key = randomBytes(32);
    const db1 = openKeyedSqlite(path, key);
    db1.exec('CREATE TABLE t (id INTEGER PRIMARY KEY)');
    db1.close();

    expect(() => openKeyedSqlite(path, undefined)).toThrow(DbEncryptionConfigError);
  });
});
