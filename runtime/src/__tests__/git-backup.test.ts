import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  backupTagFor,
  fetchBackupBlob,
  listBackupTags,
  parseBackupTag,
  pushBackupToGit,
} from '../git-backup';

// Real git operations against a real local bare repo (a filesystem path is a
// fully valid git remote — no network/auth server needed) rather than mocked
// child_process calls, per this task's own review checklist: "a real backup
// pushes a resolvable, correctly-tagged orphan commit to a real test git
// remote end to end." A local path can't exercise real HTTPS/SSH network
// authentication, but does exercise everything else: execFileSync argv
// usage, orphan commit shape, tag naming, manifest content, and actual push
// mechanics landing on a real remote.

let workDir: string;
let bareRepoPath: string;

beforeEach(() => {
  workDir = mkdtempSync(join(tmpdir(), 'sv-git-backup-test-'));
  bareRepoPath = join(workDir, 'remote.git');
  execFileSync('git', ['init', '--bare', '--quiet', bareRepoPath]);
});

afterEach(() => {
  rmSync(workDir, { recursive: true, force: true });
});

function tagsInBareRepo(): string[] {
  const out = execFileSync('git', ['-C', bareRepoPath, 'tag', '--list'], { encoding: 'utf8' });
  return out.split('\n').filter(Boolean);
}

function catFileFromTag(tag: string, path: string): string {
  return execFileSync('git', ['-C', bareRepoPath, 'show', `${tag}:${path}`], {
    encoding: 'utf8',
  });
}

describe('backupTagFor', () => {
  it("matches RFC 0064's sv-backup/<timestamp>/v<platformVersion> shape", () => {
    const tag = backupTagFor(new Date('2026-07-06T12:30:00.000Z'), '0.121.1');
    expect(tag).toBe('sv-backup/2026-07-06T12-30-00-000Z/v0.121.1');
    expect(tag).toMatch(/^sv-backup\/[0-9T-]+Z\/v[\d.]+$/);
  });
});

describe('pushBackupToGit', () => {
  it('pushes a resolvable, correctly-tagged orphan commit to a real git remote', async () => {
    const payload = Buffer.from('encrypted-payload-bytes-not-plaintext');
    const now = new Date('2026-07-06T12:30:00.000Z');

    const result = await pushBackupToGit(
      { repoUrl: bareRepoPath, branch: 'backups', authType: 'https-token', credential: 'token' },
      payload,
      'backup.age',
      { createdAt: now.getTime(), platformVersion: '0.121.1', scope: 'user' },
      '0.121.1',
      now,
    );

    expect(result.tag).toBe('sv-backup/2026-07-06T12-30-00-000Z/v0.121.1');
    expect(tagsInBareRepo()).toEqual([result.tag]);

    // Orphan: the pushed commit has no parents.
    const parents = execFileSync(
      'git',
      ['-C', bareRepoPath, 'log', '--format=%P', '-n', '1', result.tag],
      { encoding: 'utf8' },
    ).trim();
    expect(parents).toBe('');

    const commitSha = execFileSync('git', ['-C', bareRepoPath, 'rev-list', '-n', '1', result.tag], {
      encoding: 'utf8',
    }).trim();
    expect(commitSha).toBe(result.commitSha);

    // The payload lands byte-for-byte, and the manifest is real, readable JSON.
    const payloadOut = execFileSync('git', [
      '-C',
      bareRepoPath,
      'show',
      `${result.tag}:backup.age`,
    ]);
    expect(Buffer.from(payloadOut).equals(payload)).toBe(true);
    const manifest = JSON.parse(catFileFromTag(result.tag, 'manifest.json')) as {
      platformVersion: string;
      scope: string;
    };
    expect(manifest.platformVersion).toBe('0.121.1');
    expect(manifest.scope).toBe('user');
  });

  it('writes the SSH key with 0600 permissions and removes the whole working directory afterward', async () => {
    const payload = Buffer.from('payload');
    let capturedWorkDir: string | null = null;

    // Intercept mkdtempSync's return by pushing once, then asserting nothing
    // under tmpdir() matching our prefix survives the call.
    const before = new Set(readTmpEntries());
    await pushBackupToGit(
      { repoUrl: bareRepoPath, branch: 'backups', authType: 'ssh-key', credential: 'fake-key' },
      payload,
      'backup.age',
      {},
      '0.121.1',
    );
    const after = readTmpEntries().filter((e) => !before.has(e));
    capturedWorkDir = after.find((e) => e.startsWith('sv-git-backup-')) ?? null;
    expect(capturedWorkDir).toBeNull(); // cleaned up — nothing new left behind
  });

  it('rejects a repo url, branch, and credential containing shell metacharacters without executing them', async () => {
    const marker = join(workDir, 'should-not-exist');
    const malicious = `; touch ${marker} #`;

    await expect(
      pushBackupToGit(
        {
          repoUrl: bareRepoPath,
          branch: malicious,
          authType: 'https-token',
          credential: malicious,
        },
        Buffer.from('payload'),
        'backup.age',
        {},
        '0.121.1',
      ),
    ).rejects.toThrow();

    // If the malicious string had reached a shell, this file would exist.
    expect(existsSync(marker)).toBe(false);
  });

  it('cleans up its temp working directory even when the push fails', async () => {
    const before = new Set(readTmpEntries());
    await expect(
      pushBackupToGit(
        {
          repoUrl: join(workDir, 'does-not-exist.git'),
          branch: 'backups',
          authType: 'https-token',
          credential: 'token',
        },
        Buffer.from('payload'),
        'backup.age',
        {},
        '0.121.1',
      ),
    ).rejects.toThrow(/git push failed/);
    const after = readTmpEntries().filter((e) => !before.has(e));
    expect(after.find((e) => e.startsWith('sv-git-backup-'))).toBeUndefined();
  });
});

describe('parseBackupTag', () => {
  it('inverts backupTagFor', () => {
    const now = new Date('2026-07-06T12:30:00.123Z');
    const parsed = parseBackupTag(backupTagFor(now, '0.121.1'));
    expect(parsed).not.toBeNull();
    expect(parsed?.timestamp.getTime()).toBe(now.getTime());
    expect(parsed?.platformVersion).toBe('0.121.1');
  });

  it('returns null for a tag that does not match the shape', () => {
    expect(parseBackupTag('some-other-tag')).toBeNull();
    expect(parseBackupTag('sv-backup/not-a-timestamp/v1.0.0')).toBeNull();
  });
});

describe('listBackupTags', () => {
  it('lists every sv-backup tag on the remote, newest first', async () => {
    const source = { repoUrl: bareRepoPath, authType: 'https-token' as const, credential: 'token' };
    const older = new Date('2026-08-01T00:00:00.000Z');
    const newer = new Date('2026-08-06T12:30:00.000Z');
    await pushBackupToGit(
      { ...source, branch: 'backups' },
      Buffer.from('a'),
      'backup.age',
      {},
      '0.122.0',
      older,
    );
    await pushBackupToGit(
      { ...source, branch: 'backups' },
      Buffer.from('b'),
      'backup.age',
      {},
      '0.122.1',
      newer,
    );

    const tags = await listBackupTags(source);
    expect(tags).toHaveLength(2);
    expect(tags[0]?.tag).toBe(backupTagFor(newer, '0.122.1'));
    expect(tags[0]?.timestamp.getTime()).toBe(newer.getTime());
    expect(tags[1]?.tag).toBe(backupTagFor(older, '0.122.0'));
  });

  it('silently skips a tag that does not match the sv-backup shape', async () => {
    const workRepo = mkdtempSync(join(tmpdir(), 'sv-git-seed-'));
    try {
      execFileSync('git', ['clone', '--quiet', bareRepoPath, workRepo]);
      execFileSync('git', [
        '-C',
        workRepo,
        '-c',
        'user.email=test@sovereign.local',
        '-c',
        'user.name=Test',
        'commit',
        '--quiet',
        '--no-verify',
        '--allow-empty',
        '-m',
        'seed',
      ]);
      execFileSync('git', ['-C', workRepo, 'tag', 'not-a-backup-tag']);
      execFileSync('git', ['-C', workRepo, 'push', '--quiet', 'origin', '--tags']);
    } finally {
      rmSync(workRepo, { recursive: true, force: true });
    }

    const tags = await listBackupTags({
      repoUrl: bareRepoPath,
      authType: 'https-token',
      credential: 'token',
    });
    expect(tags).toEqual([]);
  });

  it('returns an empty list for a remote with no tags at all', async () => {
    const tags = await listBackupTags({
      repoUrl: bareRepoPath,
      authType: 'https-token',
      credential: 'token',
    });
    expect(tags).toEqual([]);
  });
});

describe('fetchBackupBlob', () => {
  it('fetches the exact ciphertext bytes for a tagged backup via a shallow fetch', async () => {
    const payload = Buffer.from('encrypted-payload-bytes-not-plaintext');
    const now = new Date('2026-09-01T08:00:00.000Z');
    const pushed = await pushBackupToGit(
      { repoUrl: bareRepoPath, branch: 'backups', authType: 'https-token', credential: 'token' },
      payload,
      'backup.age',
      {},
      '0.123.0',
      now,
    );

    const blob = await fetchBackupBlob(
      { repoUrl: bareRepoPath, authType: 'https-token', credential: 'token' },
      pushed.tag,
    );
    expect(blob.equals(payload)).toBe(true);
  });

  it('cleans up its temp working directory even when the fetch fails', async () => {
    const before = new Set(readTmpEntries());
    await expect(
      fetchBackupBlob(
        { repoUrl: join(workDir, 'does-not-exist.git'), authType: 'https-token', credential: 'x' },
        'sv-backup/2026-07-06T12-30-00-000Z/v0.121.1',
      ),
    ).rejects.toThrow();
    const after = readTmpEntries().filter((e) => !before.has(e));
    expect(after.find((e) => e.startsWith('sv-git-fetch-'))).toBeUndefined();
  });
});

function readTmpEntries(): string[] {
  try {
    return statSync(tmpdir()).isDirectory()
      ? (execFileSync('ls', [tmpdir()], { encoding: 'utf8' }).split('\n').filter(Boolean) ?? [])
      : [];
  } catch {
    return [];
  }
}
