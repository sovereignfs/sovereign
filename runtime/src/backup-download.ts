import { createHmac, timingSafeEqual } from 'node:crypto';
import { join, resolve, sep } from 'node:path';
import { findWorkspaceRoot } from '@sovereignfs/db';

const TOKEN_VERSION = 'sv1';
const DEFAULT_TTL_SECONDS = 48 * 60 * 60;
const MAX_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days — generous upper bound, never unbounded
const SIGNING_SECRET_ENV = ['SOVEREIGN_AUTH_SECRET', 'AUTH_SECRET'] as const;

function signingSecret(): string {
  for (const key of SIGNING_SECRET_ENV) {
    const value = process.env[key];
    if (value) return value;
  }
  throw new Error('SOVEREIGN_AUTH_SECRET or AUTH_SECRET is required for backup download tokens.');
}

function b64(input: string): string {
  return Buffer.from(input).toString('base64url');
}

function sign(payload: string): string {
  return createHmac('sha256', signingSecret()).update(payload).digest('base64url');
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

interface BackupDownloadTokenPayload {
  version: typeof TOKEN_VERSION;
  jobId: string;
  expiresAt: number;
}

/**
 * Create a signed, single-job, time-bounded backup download token (RFC 0084,
 * epic task 8.16), in the same construction style as
 * `runtime/src/storage.ts`'s `createStorageToken`/`verifyStorageToken`. TTL
 * defaults to 48h (vs. the storage route's 1h ceiling) since backup archives
 * are generated asynchronously and the requester may not come back right
 * away. The token only proves "this job's archive may be downloaded" — it
 * never carries the passphrase needed to decrypt the archive itself.
 */
export function createBackupDownloadToken(input: {
  jobId: string;
  expiresInSeconds?: number;
}): string {
  const ttl = Math.min(Math.max(input.expiresInSeconds ?? DEFAULT_TTL_SECONDS, 1), MAX_TTL_SECONDS);
  const payload: BackupDownloadTokenPayload = {
    version: TOKEN_VERSION,
    jobId: input.jobId,
    expiresAt: Math.floor(Date.now() / 1000) + ttl,
  };
  const encoded = b64(JSON.stringify(payload));
  return `${encoded}.${sign(encoded)}`;
}

/** Verify and decode a backup download token. Throws on any invalid, tampered, or expired token. */
export function verifyBackupDownloadToken(token: string): BackupDownloadTokenPayload {
  const [encoded, signature] = token.split('.');
  if (!encoded || !signature || !safeEqual(sign(encoded), signature)) {
    throw new Error('Invalid backup download token signature.');
  }
  const parsed = JSON.parse(
    Buffer.from(encoded, 'base64url').toString('utf8'),
  ) as BackupDownloadTokenPayload;
  if (parsed.version !== TOKEN_VERSION) {
    throw new Error('Unsupported backup download token version.');
  }
  if (parsed.expiresAt <= Math.floor(Date.now() / 1000)) {
    throw new Error('Backup download token has expired.');
  }
  return parsed;
}

/** Absolute path to the directory `sv backup` writes archives into (matches `bin/helpers.ts`). */
export function backupsDir(): string {
  return join(findWorkspaceRoot(), 'backups');
}

/**
 * Deterministic archive path for a queued backup job, computed from its id
 * alone so `enqueueBackupJob` can populate the schema's `NOT NULL`
 * `archivePath` column up front, before the job has actually run.
 *
 * Extension depends on `scope`: instance-scope produces a `sv backup`
 * archive (`.tar.gz`, itself SQLCipher-encrypted only if the source DBs
 * are); user-scope produces an age-encrypted ZIP (`.zip.age`) — this is the
 * literal filename the download route hands back via `Content-Disposition`
 * (`resolveBackupArchivePath`'s caller derives it from this same path), so
 * getting the extension right isn't cosmetic — a `.tar.gz` name on
 * something that isn't a tarball would mislead whoever downloads it about
 * how to open it.
 */
export function backupArchivePathForJob(jobId: string, scope: 'instance' | 'user'): string {
  const ext = scope === 'user' ? 'zip.age' : 'tar.gz';
  return join(backupsDir(), `sovereign-backup-${jobId}.${ext}`);
}

/**
 * Deterministic path for a `restore-fetch` job (workstream 0023 leg 4, epic
 * 8.40) — same up-front-computation reasoning as `backupArchivePathForJob`.
 * The extension is always `.age`: the fetched blob is recipient-mode
 * ciphertext straight from the user's git destination, never decrypted
 * server-side (never even inspected — only the `Decrypter` in the browser
 * ever sees the plaintext).
 */
export function restoreFetchArchivePathForJob(jobId: string): string {
  return join(backupsDir(), `sovereign-restore-${jobId}.age`);
}

/**
 * Resolve a `backup_jobs.archivePath` value to an absolute file path,
 * refusing to serve anything outside `backupsDir()` even if a future bug
 * ever wrote a traversal sequence or an unrelated absolute path into the
 * column. `archivePath` is stored as an absolute path (RFC 0084's own
 * design — the worker captures whatever `sv backup`/`assembleExport()`
 * produced), so this is a containment check, not a join.
 */
export function resolveBackupArchivePath(archivePath: string): string | null {
  const base = backupsDir();
  const resolved = resolve(base, archivePath);
  if (resolved !== base && !resolved.startsWith(base + sep)) return null;
  return resolved;
}
