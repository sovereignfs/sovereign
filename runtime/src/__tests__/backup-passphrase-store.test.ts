import { beforeEach, describe, expect, it } from 'vitest';
import {
  backupPassphraseStoreCountForTests,
  resetBackupPassphraseStoreForTests,
  storeBackupPassphrase,
  takeBackupPassphrase,
} from '../backup-passphrase-store';

beforeEach(() => {
  resetBackupPassphraseStoreForTests();
});

describe('storeBackupPassphrase / takeBackupPassphrase', () => {
  it('returns the stored passphrase exactly once, then undefined', () => {
    storeBackupPassphrase('job-1', 'correct horse battery staple', 1_000);
    expect(takeBackupPassphrase('job-1', 1_000)).toBe('correct horse battery staple');
    expect(takeBackupPassphrase('job-1', 1_000)).toBeUndefined();
  });

  it('returns undefined for a job id that was never stored', () => {
    expect(takeBackupPassphrase('missing', 1_000)).toBeUndefined();
  });

  it('keeps separate jobs independent', () => {
    storeBackupPassphrase('job-a', 'passphrase-a', 1_000);
    storeBackupPassphrase('job-b', 'passphrase-b', 1_000);
    expect(takeBackupPassphrase('job-a', 1_000)).toBe('passphrase-a');
    expect(takeBackupPassphrase('job-b', 1_000)).toBe('passphrase-b');
  });

  it('expires an entry not taken within the TTL', () => {
    storeBackupPassphrase('job-1', 'a passphrase', 1_000);
    // Just under 10 minutes later: still valid.
    expect(takeBackupPassphrase('job-1', 1_000 + 9 * 60_000)).toBe('a passphrase');

    storeBackupPassphrase('job-2', 'another passphrase', 500_000);
    // Just over 10 minutes after job-2 was stored: expired. This check is
    // independent of the sweep's own gating — take() compares expiresAt
    // directly against `now` regardless of whether a sweep pass has run.
    expect(takeBackupPassphrase('job-2', 500_000 + 11 * 60_000)).toBeUndefined();
  });

  it('the periodic sweep actually reclaims an expired, never-taken entry', () => {
    storeBackupPassphrase('job-a', 'a', 1_000); // expiresAt = 601_000; too soon for a sweep to run yet
    expect(backupPassphraseStoreCountForTests()).toBe(1);

    // Far enough past both job-a's TTL and the 5-minute eviction-check
    // interval that this store() call's own sweep pass reclaims it.
    storeBackupPassphrase('job-b', 'b', 601_500);
    expect(backupPassphraseStoreCountForTests()).toBe(1); // job-a swept away, only job-b remains
  });
});
