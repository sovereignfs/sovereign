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

/** Tag shape shared by both backup scopes (RFC 0064): `sv-backup/<timestamp>/v<platformVersion>`. */
export function backupTagFor(now: Date, platformVersion: string): string {
  const timestamp = now.toISOString().replace(/[:.]/g, '-');
  return `sv-backup/${timestamp}/v${platformVersion}`;
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

    let pushEnv: Record<string, string>;
    if (destination.authType === 'ssh-key') {
      const sshKeyPath = join(workDir, '.sv-ssh-key');
      const key = destination.credential.endsWith('\n')
        ? destination.credential
        : `${destination.credential}\n`;
      writeFileSync(sshKeyPath, key, { mode: 0o600 });
      const knownHosts = join(workDir, '.sv-known-hosts');
      writeFileSync(knownHosts, '');
      pushEnv = {
        GIT_SSH_COMMAND: `ssh -i ${sshKeyPath} -o IdentitiesOnly=yes -o UserKnownHostsFile=${knownHosts} -o StrictHostKeyChecking=accept-new`,
      };
    } else {
      // GIT_ASKPASS is invoked once per distinct prompt ("Username for...",
      // "Password for..."); returning the token for both is the broadly
      // compatible default across GitHub/GitLab/Gitea/Bitbucket, each of
      // which accepts a bare token in at least one of the two fields
      // regardless of what's in the other. A host requiring a specific,
      // different username is a known gap, not handled here.
      const askpassPath = join(workDir, '.sv-askpass.sh');
      writeFileSync(askpassPath, '#!/bin/sh\nprintf %s "$SV_GIT_CREDENTIAL"\n', { mode: 0o700 });
      pushEnv = { GIT_ASKPASS: askpassPath, SV_GIT_CREDENTIAL: destination.credential };
    }

    runGit(workDir, ['push', destination.repoUrl, `refs/tags/${tag}`], pushEnv);

    return { tag, commitSha };
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
}
