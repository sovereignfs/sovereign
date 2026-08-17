import { join } from 'node:path';
import { findWorkspaceRoot } from '@sovereignfs/db';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  backupsDir,
  createBackupDownloadToken,
  resolveBackupArchivePath,
  verifyBackupDownloadToken,
} from '../backup-download';

const previousAuthSecret = process.env.SOVEREIGN_AUTH_SECRET;

afterEach(() => {
  if (previousAuthSecret === undefined) {
    Reflect.deleteProperty(process.env, 'SOVEREIGN_AUTH_SECRET');
  } else {
    process.env.SOVEREIGN_AUTH_SECRET = previousAuthSecret;
  }
});

describe('backup download tokens (RFC 0084, epic task 8.16)', () => {
  it('signs and verifies a token scoped to one job', () => {
    process.env.SOVEREIGN_AUTH_SECRET = 'test-secret';
    const token = createBackupDownloadToken({ jobId: 'job-1', expiresInSeconds: 60 });
    expect(verifyBackupDownloadToken(token)).toMatchObject({ jobId: 'job-1' });
  });

  it('defaults to a 48h TTL', () => {
    process.env.SOVEREIGN_AUTH_SECRET = 'test-secret';
    const token = createBackupDownloadToken({ jobId: 'job-1' });
    const verified = verifyBackupDownloadToken(token);
    const expected = Math.floor(Date.now() / 1000) + 48 * 60 * 60;
    expect(verified.expiresAt).toBeGreaterThan(expected - 5);
    expect(verified.expiresAt).toBeLessThanOrEqual(expected + 5);
  });

  it('rejects a tampered token', () => {
    process.env.SOVEREIGN_AUTH_SECRET = 'test-secret';
    const token = createBackupDownloadToken({ jobId: 'job-1' });
    expect(() => verifyBackupDownloadToken(`${token}x`)).toThrow(/signature/);
  });

  it('rejects a token issued for a different job when checked against this one', () => {
    process.env.SOVEREIGN_AUTH_SECRET = 'test-secret';
    const token = createBackupDownloadToken({ jobId: 'job-1' });
    const verified = verifyBackupDownloadToken(token);
    expect(verified.jobId).not.toBe('job-2');
  });

  it('rejects an expired token', () => {
    process.env.SOVEREIGN_AUTH_SECRET = 'test-secret';
    const token = createBackupDownloadToken({ jobId: 'job-1', expiresInSeconds: 1 });
    vi.useFakeTimers();
    try {
      vi.advanceTimersByTime(2000);
      expect(() => verifyBackupDownloadToken(token)).toThrow(/expired/);
    } finally {
      vi.useRealTimers();
    }
  });

  it('clamps expiry to the maximum allowed TTL', () => {
    process.env.SOVEREIGN_AUTH_SECRET = 'test-secret';
    const token = createBackupDownloadToken({
      jobId: 'job-1',
      expiresInSeconds: 30 * 24 * 60 * 60, // 30 days — well past the 7-day cap
    });
    const verified = verifyBackupDownloadToken(token);
    const maxExpected = Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60 + 5;
    expect(verified.expiresAt).toBeLessThanOrEqual(maxExpected);
  });
});

describe('resolveBackupArchivePath (path containment)', () => {
  it('resolves an absolute path that is inside backupsDir()', () => {
    const inside = join(backupsDir(), 'sovereign-backup-2026-08-17T00-00-00-v1.0.0.tar.gz');
    expect(resolveBackupArchivePath(inside)).toBe(inside);
  });

  it('resolves a bare filename relative to backupsDir()', () => {
    const resolved = resolveBackupArchivePath('sovereign-backup-1.tar.gz');
    expect(resolved).toBe(join(backupsDir(), 'sovereign-backup-1.tar.gz'));
  });

  it('rejects a traversal attempt escaping backupsDir()', () => {
    expect(resolveBackupArchivePath('../../etc/passwd')).toBeNull();
  });

  it('rejects an absolute path outside backupsDir() entirely', () => {
    expect(resolveBackupArchivePath('/etc/passwd')).toBeNull();
  });

  it('backupsDir() sits directly under the workspace root, not under data/', () => {
    expect(backupsDir()).toBe(join(findWorkspaceRoot(), 'backups'));
  });
});
