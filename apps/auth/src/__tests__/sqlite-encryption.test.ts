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

  it('fails fast when the key is present and an isolated plugin db pre-exists', () => {
    mkdirSync(join(dataDir, 'plugins'));
    writeFileSync(join(dataDir, 'plugins', 'fs.example.one.db'), '');
    expect(() => checkEncryptionMarker(dataDir, true)).toThrow(DbEncryptionConfigError);
  });

  it('writes the marker instead of throwing on a genuinely fresh, empty data dir', () => {
    expect(() => checkEncryptionMarker(dataDir, true)).not.toThrow();
    expect(existsSync(join(dataDir, '.db-encrypted'))).toBe(true);
    expect(() => checkEncryptionMarker(dataDir, true)).not.toThrow();
  });
});
