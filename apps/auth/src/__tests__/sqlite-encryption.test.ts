import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  DbEncryptionConfigError,
  checkEncryptionMarker,
  writeEncryptionMarker,
} from '../sqlite-encryption';

/**
 * Covers the auth server's self-contained twin of
 * `packages/db/src/sqlite-encryption.ts`'s marker guard — kept in sync
 * intentionally, so this test mirrors that package's own suite.
 */
describe('checkEncryptionMarker (apps/auth twin)', () => {
  let dataDir: string;

  beforeEach(() => {
    dataDir = mkdtempSync(join(tmpdir(), 'sv-auth-db-marker-'));
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

  it('fails fast when the key is present and pre-existing plaintext auth.db exists', () => {
    writeFileSync(join(dataDir, 'auth.db'), '');
    expect(() => checkEncryptionMarker(dataDir, true)).toThrow(DbEncryptionConfigError);
  });

  it('is core-only (task 8.15) — a pre-existing plugin db does not block the core marker', () => {
    // auth.db never touches plugin files, but this twin's checkEncryptionMarker
    // shares the same core-only semantics as packages/db's — a plugin file's
    // existence must never gate the platform core's own encryption decision.
    mkdirSync(join(dataDir, 'plugins'));
    writeFileSync(join(dataDir, 'plugins', 'fs.example.one.db'), '');
    expect(() => checkEncryptionMarker(dataDir, true)).not.toThrow();
    expect(existsSync(join(dataDir, '.db-encrypted'))).toBe(true);
  });

  it('writes the marker instead of throwing on a genuinely fresh, empty data dir', () => {
    expect(() => checkEncryptionMarker(dataDir, true)).not.toThrow();
    expect(existsSync(join(dataDir, '.db-encrypted'))).toBe(true);
    expect(() => checkEncryptionMarker(dataDir, true)).not.toThrow();
  });
});
