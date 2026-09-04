import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * Shared git-push primitive for both backup scopes (workstream 0023 leg 3,
 * epic task 8.39 — reused by the future operator scope, epic task 8.17,
 * rather than each duplicating shell-out logic). One orphan commit per
 * backup, tagged `sv-backup/<timestamp>/v<platformVersion>` (RFC 0064) —
 * `git init` on a fresh temp directory always starts on an unborn branch, so
 * the very first commit there is an orphan commit with no parent, no
 * `--orphan` checkout dance required.
 *
 * Every `git` invocation goes through `execFileSync` with an argv array —
 * never an interpolated shell string (docs/architecture-rules.md) — so no
 * user-supplied value (repo URL, branch, token, SSH key) ever reaches a
 * shell. The credential itself never appears as a literal argv element or
 * embedded in the remote URL either, both of which are visible to any user
 * on the host via `ps`: it's passed exclusively through environment
 * variables read by a short-lived `GIT_ASKPASS` script (HTTPS token) or an
 * `IdentityFile` (SSH key) written to a 0600 temp file for the duration of
 * the push only, removed in a `finally` block alongside the rest of the
 * working directory.
 */

export type GitPushAuthType = 'https-token' | 'ssh-key';

export interface GitPushDestination {
  repoUrl: string;
  branch: string;
  authType: GitPushAuthType;
  /** Access token (https-token) or SSH private key contents (ssh-key). */
  credential: string;
}

export interface GitPushResult {
  tag: string;
  commitSha: string;
}

/** What `listBackupTags`/`fetchBackupBlob` (leg 4) need — no `branch`, unlike a push. */
export type GitCredentialSource = Pick<GitPushDestination, 'repoUrl' | 'authType' | 'credential'>;

export interface BackupTagInfo {
  tag: string;
  timestamp: Date;
  platformVersion: string;
}

const GIT_TIMEOUT_MS = 2 * 60 * 1000; // a single small backup payload, not a large repo clone
const MAX_CAPTURED_OUTPUT_CHARS = 2000;

function truncate(text: string): string {
  return text.length > MAX_CAPTURED_OUTPUT_CHARS
    ? `${text.slice(0, MAX_CAPTURED_OUTPUT_CHARS)}\n… (truncated)`
    : text;
}

function runGit(cwd: string, args: string[], env?: Record<string, string>): string {
  try {
    return execFileSync('git', args, {
      cwd,
      timeout: GIT_TIMEOUT_MS,
      encoding: 'utf8',
      env: env ? { ...process.env, ...env } : process.env,
    });
  } catch (err) {
    const e = err as { stderr?: string; message?: string; signal?: string | null };
    if (e.signal) {
      throw new Error(`git ${args[0]} was killed (signal ${e.signal}), likely a timeout.`);
    }
    const detail = truncate((e.stderr ?? e.message ?? 'unknown error').trim());
    throw new Error(`git ${args[0]} failed: ${detail}`);
  }
}

/** Same as `runGit`, but returns raw bytes — for reading a binary blob (e.g. `git show <tag>:backup.age`). */
function runGitBuffer(cwd: string, args: string[], env?: Record<string, string>): Buffer {
  try {
    return execFileSync('git', args, {
      cwd,
      timeout: GIT_TIMEOUT_MS,
      env: env ? { ...process.env, ...env } : process.env,
    });
  } catch (err) {
    const e = err as { stderr?: Buffer; message?: string; signal?: string | null };
    if (e.signal) {
      throw new Error(`git ${args[0]} was killed (signal ${e.signal}), likely a timeout.`);
    }
    const detail = truncate((e.stderr?.toString('utf8') ?? e.message ?? 'unknown error').trim());
    throw new Error(`git ${args[0]} failed: ${detail}`);
  }
}

/**
 * Build the environment variables that authenticate a `git` invocation
 * against `source`, writing whatever credential material the chosen
 * `authType` needs (an SSH identity file, or an askpass script for an HTTPS
 * token) into `workDir` — never as a literal argv element or embedded in a
 * URL, both `ps`-visible to any user on the host. Shared by push (leg 3),
 * list, and fetch (leg 4) — all three authenticate identically; only what
 * they do with the authenticated connection differs.
 */
function buildGitCredentialEnv(
  workDir: string,
  source: GitCredentialSource,
): Record<string, string> {
  if (source.authType === 'ssh-key') {
    const sshKeyPath = join(workDir, '.sv-ssh-key');
    const key = source.credential.endsWith('\n') ? source.credential : `${source.credential}\n`;
    writeFileSync(sshKeyPath, key, { mode: 0o600 });
    const knownHosts = join(workDir, '.sv-known-hosts');
    writeFileSync(knownHosts, '');
    return {
      GIT_SSH_COMMAND: `ssh -i ${sshKeyPath} -o IdentitiesOnly=yes -o UserKnownHostsFile=${knownHosts} -o StrictHostKeyChecking=accept-new`,
    };
  }
  // GIT_ASKPASS is invoked once per distinct prompt ("Username for...",
  // "Password for..."); returning the token for both is the broadly
  // compatible default across GitHub/GitLab/Gitea/Bitbucket, each of which
  // accepts a bare token in at least one of the two fields regardless of
  // what's in the other. A host requiring a specific, different username is
  // a known gap, not handled here.
  const askpassPath = join(workDir, '.sv-askpass.sh');
  writeFileSync(askpassPath, '#!/bin/sh\nprintf %s "$SV_GIT_CREDENTIAL"\n', { mode: 0o700 });
  return { GIT_ASKPASS: askpassPath, SV_GIT_CREDENTIAL: source.credential };
}

/** Tag shape shared by both backup scopes (RFC 0064): `sv-backup/<timestamp>/v<platformVersion>`. */
export function backupTagFor(now: Date, platformVersion: string): string {
  const timestamp = now.toISOString().replace(/[:.]/g, '-');
  return `sv-backup/${timestamp}/v${platformVersion}`;
}

const BACKUP_TAG_PATTERN =
  /^sv-backup\/(\d{4})-(\d{2})-(\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z\/v(.+)$/;

/** Inverse of `backupTagFor` — parses a tag name back into its timestamp and platform version. */
export function parseBackupTag(tag: string): { timestamp: Date; platformVersion: string } | null {
  const match = BACKUP_TAG_PATTERN.exec(tag);
  if (!match) return null;
  const [, y, mo, d, h, mi, s, ms, platformVersion] = match;
  if (platformVersion === undefined) return null; // guaranteed by the pattern — narrows the type
  const timestamp = new Date(`${y}-${mo}-${d}T${h}:${mi}:${s}.${ms}Z`);
  if (Number.isNaN(timestamp.getTime())) return null;
  return { timestamp, platformVersion };
}

/**
 * List every `sv-backup/*` tag on `source`'s remote, newest first — a plain
 * `git ls-remote --tags`, synchronous, no local clone or job needed (RFC
 * 0064's "listing is sync" design). A tag that doesn't match the expected
 * shape (e.g. a user's own unrelated tag on the same repo) is silently
 * skipped rather than surfaced as a malformed entry.
 */
export async function listBackupTags(source: GitCredentialSource): Promise<BackupTagInfo[]> {
  const workDir = mkdtempSync(join(tmpdir(), 'sv-git-list-'));
  try {
    const env = buildGitCredentialEnv(workDir, source);
    const output = runGit(workDir, ['ls-remote', '--tags', source.repoUrl], env);
    const tags: BackupTagInfo[] = [];
    for (const line of output.split('\n')) {
      const tabIndex = line.indexOf('\t');
      if (tabIndex === -1) continue;
      const ref = line.slice(tabIndex + 1).trim();
      const tag = ref.replace(/^refs\/tags\//, '');
      const parsed = parseBackupTag(tag);
      if (!parsed) continue;
      tags.push({ tag, ...parsed });
    }
    tags.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    return tags;
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
}

/**
 * Shallow-fetch a single tagged backup commit and read `payloadFilename`
 * (the ciphertext blob) straight out of its tree via `git show`, without a
 * full checkout. `--depth=1` fetches exactly this one orphan commit's
 * objects, not any history.
 */
export async function fetchBackupBlob(
  source: GitCredentialSource,
  tag: string,
  payloadFilename = 'backup.age',
): Promise<Buffer> {
  const workDir = mkdtempSync(join(tmpdir(), 'sv-git-fetch-'));
  try {
    runGit(workDir, ['init', '--quiet']);
    const env = buildGitCredentialEnv(workDir, source);
    runGit(
      workDir,
      ['fetch', '--quiet', '--depth=1', source.repoUrl, `refs/tags/${tag}:refs/tags/${tag}`],
      env,
    );
    return runGitBuffer(workDir, ['show', `${tag}:${payloadFilename}`]);
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
}

/**
 * Commit `payload` (already-encrypted bytes — this module never sees
 * plaintext) plus a small plaintext, non-secret `manifest` alongside it as a
 * single orphan commit, tag it, and push just that tag to `destination`.
 */
export async function pushBackupToGit(
  destination: GitPushDestination,
  payload: Buffer,
  payloadFilename: string,
  manifest: Record<string, unknown>,
  platformVersion: string,
  now: Date = new Date(),
): Promise<GitPushResult> {
  const workDir = mkdtempSync(join(tmpdir(), 'sv-git-backup-'));
  try {
    runGit(workDir, ['init', '--quiet', '--initial-branch', destination.branch]);

    writeFileSync(join(workDir, payloadFilename), payload);
    writeFileSync(join(workDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
    runGit(workDir, ['add', '-A']);

    const tag = backupTagFor(now, platformVersion);
    runGit(workDir, [
      '-c',
      'user.email=backup@sovereign.local',
      '-c',
      'user.name=Sovereign Backup',
      'commit',
      '--quiet',
      '--no-verify',
      '-m',
      `Sovereign backup ${tag}`,
    ]);
    const commitSha = runGit(workDir, ['rev-parse', 'HEAD']).trim();
    runGit(workDir, ['tag', tag]);

    const pushEnv = buildGitCredentialEnv(workDir, destination);
    runGit(workDir, ['push', destination.repoUrl, `refs/tags/${tag}`], pushEnv);

    return { tag, commitSha };
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
}
