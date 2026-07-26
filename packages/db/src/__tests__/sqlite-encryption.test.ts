import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  DbEncryptionConfigError,
  checkEncryptionMarker,
  clearEncryptionMarker,
  clearPluginEncryptionMarker,
  dbEncryptionKeyFromEnv,
  isEncryptionMarked,
  isPluginEncryptionMarked,
  openKeyedSqlite,
  resolvePluginEncryptionKey,
  writeEncryptionMarker,
  writePluginEncryptionMarker,
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

  it('is core-only (task 8.15) — a pre-existing plugin db does not block the core marker', () => {
    // This is the exact incident fix: a plugin's plaintext file must never
    // gate the platform core's own encryption decision. Per-plugin state is
    // resolvePluginEncryptionKey's job, tested separately below.
    mkdirSync(join(dataDir, 'plugins'));
    writeFileSync(join(dataDir, 'plugins', 'fs.example.one.db'), '');
    expect(() => checkEncryptionMarker(dataDir, true)).not.toThrow();
    expect(isEncryptionMarked(dataDir)).toBe(true);
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

describe('resolvePluginEncryptionKey (task 8.15 — per-database enforcement)', () => {
  let dataDir: string;
  const pluginPath = () => join(dataDir, 'plugins', 'my-plugin.db');

  beforeEach(() => {
    dataDir = mkdtempSync(join(tmpdir(), 'sv-db-plugin-crypt-'));
    mkdirSync(join(dataDir, 'plugins'), { recursive: true });
  });

  afterEach(() => {
    rmSync(dataDir, { recursive: true, force: true });
  });

  /** Creates a real plaintext SQLite file at `pluginPath()` (genuine header, not a stub). */
  function seedPlaintextFile(): void {
    const db = openKeyedSqlite(pluginPath(), undefined);
    db.exec('CREATE TABLE t (id INTEGER PRIMARY KEY)');
    db.close();
  }

  /** Creates a real SQLCipher-encrypted file at `pluginPath()` under `key`. */
  function seedEncryptedFile(key: Buffer): void {
    const db = openKeyedSqlite(pluginPath(), key);
    db.exec('CREATE TABLE t (id INTEGER PRIMARY KEY)');
    db.close();
  }

  it('the 2026-07-24 incident scenario: a plaintext plugin file is never touched by the instance-wide key', () => {
    // Simulate the incident directly: the core is encrypted (as it always is
    // once the key is present), but THIS plugin's file is genuinely plaintext
    // and never requested encryption — it must open plain, not get keyed.
    writeEncryptionMarker(dataDir);
    seedPlaintextFile();
    const key = randomBytes(32);

    const resolved = resolvePluginEncryptionKey(
      dataDir,
      'my-plugin',
      pluginPath(),
      key,
      /* requiresEncryption */ false,
    );
    expect(resolved).toBeUndefined();
    expect(isPluginEncryptionMarked(dataDir, 'my-plugin')).toBe(false);
  });

  it('a non-requiring plugin stays plaintext even with no key present', () => {
    seedPlaintextFile();
    const resolved = resolvePluginEncryptionKey(
      dataDir,
      'my-plugin',
      pluginPath(),
      undefined,
      false,
    );
    expect(resolved).toBeUndefined();
  });

  it('a requesting plugin with no key configured opens plain (softened — no throw)', () => {
    seedPlaintextFile();
    const resolved = resolvePluginEncryptionKey(
      dataDir,
      'my-plugin',
      pluginPath(),
      undefined,
      true,
    );
    expect(resolved).toBeUndefined();
    expect(isPluginEncryptionMarked(dataDir, 'my-plugin')).toBe(false);
  });

  it('a requesting plugin with a key and an existing plaintext file fails fast, scoped to this plugin', () => {
    seedPlaintextFile();
    const key = randomBytes(32);
    expect(() => resolvePluginEncryptionKey(dataDir, 'my-plugin', pluginPath(), key, true)).toThrow(
      DbEncryptionConfigError,
    );
    // Doesn't mark it — the file genuinely wasn't converted.
    expect(isPluginEncryptionMarked(dataDir, 'my-plugin')).toBe(false);
  });

  it('a requesting plugin with a key and no existing file gets marked and opened encrypted from birth', () => {
    // File does not exist yet — brand-new plugin database.
    const key = randomBytes(32);
    const resolved = resolvePluginEncryptionKey(dataDir, 'my-plugin', pluginPath(), key, true);
    expect(resolved).toBe(key);
    expect(isPluginEncryptionMarked(dataDir, 'my-plugin')).toBe(true);
  });

  it('an already-marked plugin always requires the key, even if requiresEncryption is now false', () => {
    writePluginEncryptionMarker(dataDir, 'my-plugin');
    expect(() =>
      resolvePluginEncryptionKey(dataDir, 'my-plugin', pluginPath(), undefined, false),
    ).toThrow(DbEncryptionConfigError);

    const key = randomBytes(32);
    expect(resolvePluginEncryptionKey(dataDir, 'my-plugin', pluginPath(), key, false)).toBe(key);
  });

  it('backward-compat: backfills a per-plugin marker when the legacy core marker exists and the file is genuinely already encrypted', () => {
    // Simulates an instance that ran the pre-8.15 blanket `sv db encrypt` —
    // the file is genuinely already encrypted, but has no per-plugin marker
    // of its own yet (that mechanism is new). This plugin doesn't even
    // request encryption today — the backfill must still recognize the
    // file's actual on-disk state via its header, not the plugin's current
    // manifest.
    writeEncryptionMarker(dataDir);
    const key = randomBytes(32);
    seedEncryptedFile(key);
    expect(isPluginEncryptionMarked(dataDir, 'my-plugin')).toBe(false);

    const resolved = resolvePluginEncryptionKey(
      dataDir,
      'my-plugin',
      pluginPath(),
      key,
      /* requiresEncryption */ false,
    );
    expect(resolved).toBe(key);
    expect(isPluginEncryptionMarked(dataDir, 'my-plugin')).toBe(true);
  });

  it('backward-compat backfill still demands the key once discovered', () => {
    writeEncryptionMarker(dataDir);
    seedEncryptedFile(randomBytes(32));
    expect(() =>
      resolvePluginEncryptionKey(dataDir, 'my-plugin', pluginPath(), undefined, false),
    ).toThrow(DbEncryptionConfigError);
  });

  it('backward-compat backfill does not fire for a genuinely plaintext file even when the legacy core marker is present', () => {
    // A plugin created its file AFTER the core was already encrypted under
    // the new per-database model — same marker state as the legacy case
    // above, but the file itself is real plaintext. The header check is what
    // tells these two apart; without it this would be misidentified exactly
    // like the incident this task fixes.
    writeEncryptionMarker(dataDir);
    seedPlaintextFile();
    const resolved = resolvePluginEncryptionKey(
      dataDir,
      'my-plugin',
      pluginPath(),
      randomBytes(32),
      /* requiresEncryption */ false,
    );
    expect(resolved).toBeUndefined();
    expect(isPluginEncryptionMarked(dataDir, 'my-plugin')).toBe(false);
  });

  it('backward-compat backfill does not fire for a brand-new plugin file that never existed under the legacy marker', () => {
    writeEncryptionMarker(dataDir);
    // No pre-existing file — this is a fresh plugin created after upgrading.
    const key = randomBytes(32);
    const resolved = resolvePluginEncryptionKey(dataDir, 'my-plugin', pluginPath(), key, false);
    expect(resolved).toBeUndefined();
    expect(isPluginEncryptionMarked(dataDir, 'my-plugin')).toBe(false);
  });
});

describe('plugin encryption marker helpers', () => {
  let dataDir: string;

  beforeEach(() => {
    dataDir = mkdtempSync(join(tmpdir(), 'sv-db-plugin-marker-'));
  });

  afterEach(() => {
    rmSync(dataDir, { recursive: true, force: true });
  });

  it('writePluginEncryptionMarker creates the marker under plugins/, creating the dir if needed', () => {
    expect(isPluginEncryptionMarked(dataDir, 'p1')).toBe(false);
    writePluginEncryptionMarker(dataDir, 'p1');
    expect(isPluginEncryptionMarked(dataDir, 'p1')).toBe(true);
    expect(existsSync(join(dataDir, 'plugins', 'p1.db-encrypted'))).toBe(true);
  });

  it("clearPluginEncryptionMarker removes only that plugin's marker", () => {
    writePluginEncryptionMarker(dataDir, 'p1');
    writePluginEncryptionMarker(dataDir, 'p2');
    clearPluginEncryptionMarker(dataDir, 'p1');
    expect(isPluginEncryptionMarked(dataDir, 'p1')).toBe(false);
    expect(isPluginEncryptionMarked(dataDir, 'p2')).toBe(true);
  });

  it('clearPluginEncryptionMarker is a no-op when no marker exists', () => {
    expect(() => clearPluginEncryptionMarker(dataDir, 'nope')).not.toThrow();
  });
});
