import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { DEFAULT_TENANT_ID, findWorkspaceRoot, type BackupJobRow } from '@sovereignfs/db';
import { encrypt } from './backup-encryption';
import { takeBackupPassphrase } from './backup-passphrase-store';
import { logger } from './logger';
import { getPlatformVersion } from './platform-version';
import { assembleExport } from './portability/assemble';
import {
  eligibleExportPlugins,
  gatherPlatformExport,
  installedPluginsRoster,
} from './portability/platform';

const SUBPROCESS_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes — generous ceiling for a large instance archive
const MAX_CAPTURED_OUTPUT_CHARS = 4000; // keep a verbose subprocess from blowing up the stored error message

interface InstanceBackupJobOptions {
  excludePlugins?: string[];
}

interface UserBackupJobOptions {
  includeFiles?: boolean;
  excludePluginIds?: string[];
}

function parseOptions<T>(optionsJson: string | null): T {
  if (!optionsJson) return {} as T;
  try {
    const parsed: unknown = JSON.parse(optionsJson);
    return typeof parsed === 'object' && parsed !== null ? (parsed as T) : ({} as T);
  } catch {
    return {} as T;
  }
}

/** Matches `runtime/app/api/account/export/route.ts`'s own computed-key read
 *  (avoids Next inlining NEXT_PUBLIC_* at build time for a value that must
 *  track the runtime env). */
function sourceInstance(): string | null {
  const key = 'NEXT_PUBLIC_RUNTIME_URL';
  return process.env[key] ?? null;
}

function truncate(text: string): string {
  return text.length > MAX_CAPTURED_OUTPUT_CHARS
    ? `${text.slice(0, MAX_CAPTURED_OUTPUT_CHARS)}\n… (truncated)`
    : text;
}

/**
 * Default production `runBackup` for `backup-worker.ts`. Instance-scope jobs
 * spawn the existing `pnpm sv backup` CLI (RFC 0084's own "existing CLI,
 * unchanged archive logic" design) as a child process via an argv array —
 * never a shell string (see docs/architecture-rules.md's shell-injection
 * rule) — with a hard timeout so a hung subprocess cannot leave the job
 * `running` forever.
 *
 * KNOWN GAP, not resolved here: this only works where `pnpm`/`tsx`/`bin/sv.ts`
 * are actually present in the running container. They are in a native
 * `pnpm dev` checkout and in the separate `tools` Docker image, but NOT in
 * the minimal `runner` production image that actually serves this worker —
 * `Dockerfile`'s `runner` stage copies only the traced Next.js standalone
 * output, no `bin/`/`scripts/`/`tsx`. Every instance-scope job fails cleanly
 * with an actionable `errorMessage` in that topology today (see below),
 * rather than silently doing nothing or crashing the worker loop — but no
 * job actually succeeds there until this is resolved (bundle the CLI into
 * `runner`, or run this worker from a `tools`-capable process instead — a
 * deliberate follow-up decision, not made here). Separately, `sv backup`'s
 * own Postgres path requires `pg_dump`, not installed in any current image,
 * and its SQLite (sqld) path is explicitly not implemented yet (`bin/sv.ts`'s
 * own error message) — both pre-existing CLI gaps, not introduced by this
 * worker.
 *
 * Encryption (RFC 0084: "always applied — no opt-out") is intentionally not
 * wired in here yet for the instance-scope path specifically: the
 * requester's passphrase is never persisted, and no mechanism yet exists to
 * carry it from wherever an instance-scope job is enqueued through to
 * whichever later tick actually claims and runs it. That's unresolved design
 * work, not a coding gap — solving it belongs to epic task 8.17 (Console
 * instance backup UI), which decides passphrase collection for that scope.
 * User-scope jobs are encrypted — see `runUserBackup` below, which solves
 * the identical carry-the-passphrase problem for its own scope via
 * `backup-passphrase-store.ts`.
 */
export async function runInstanceBackup(
  job: BackupJobRow,
): Promise<{ archivePath: string; sizeBytes: number }> {
  const options = parseOptions<InstanceBackupJobOptions>(job.optionsJson);
  if (options.excludePlugins && options.excludePlugins.length > 0) {
    throw new Error(
      '`sv backup --exclude-plugin` does not exist yet (epic task 8.17) — cannot honor ' +
        'optionsJson.excludePlugins for this job.',
    );
  }

  const root = findWorkspaceRoot();
  const result = spawnSync('pnpm', ['sv', 'backup', '--out', job.archivePath], {
    cwd: root,
    timeout: SUBPROCESS_TIMEOUT_MS,
    encoding: 'utf8',
  });

  if (result.error) {
    throw new Error(`Failed to spawn \`sv backup\`: ${result.error.message}`);
  }
  if (result.signal) {
    const minutes = String(SUBPROCESS_TIMEOUT_MS / 60_000);
    throw new Error(
      `\`sv backup\` was killed (signal ${result.signal}) — likely the ${minutes}-minute timeout.`,
    );
  }
  if (result.status !== 0) {
    const stderr = truncate((result.stderr ?? '').trim());
    throw new Error(
      `\`sv backup\` exited with code ${String(result.status)}: ${stderr || '(no output)'}`,
    );
  }
  if (!existsSync(job.archivePath)) {
    throw new Error(
      `\`sv backup\` reported success but no archive was found at ${job.archivePath}.`,
    );
  }

  logger.info('backup-run: instance backup complete', {
    jobId: job.id,
    archivePath: job.archivePath,
  });
  return { archivePath: job.archivePath, sizeBytes: statSync(job.archivePath).size };
}

/**
 * Default production `runBackup` for a user-scope job (epic task 8.18).
 * Runs entirely in-process — no subprocess, so unlike `runInstanceBackup`
 * this is unaffected by the production Docker `sv`-CLI-spawn gap.
 *
 * Encryption is mandatory (RFC 0084: "always applied — no opt-out"). The
 * requester's passphrase was handed to `backup-passphrase-store.ts` at
 * enqueue time (`POST /api/account/backup-jobs`) and is taken — single-use —
 * here, never persisted to the `backup_jobs` row or logged. If the entry is
 * gone (process restarted between enqueue and claim, or the job somehow sat
 * queued past the store's TTL), this fails the job cleanly rather than ever
 * falling back to no encryption.
 */
export async function runUserBackup(
  job: BackupJobRow,
): Promise<{ archivePath: string; sizeBytes: number }> {
  if (!job.requestedByUserId) {
    throw new Error('User-scope backup job has no requestedByUserId — cannot run.');
  }
  const userId = job.requestedByUserId;

  const passphrase = takeBackupPassphrase(job.id);
  if (!passphrase) {
    throw new Error(
      'No passphrase available for this job (the server may have restarted before it was ' +
        'claimed) — please trigger a new backup.',
    );
  }

  const options = parseOptions<UserBackupJobOptions>(job.optionsJson);
  const [platform, exportPlugins, installedPlugins] = await Promise.all([
    gatherPlatformExport(userId, null),
    eligibleExportPlugins(),
    installedPluginsRoster(),
  ]);

  const zip = await assembleExport({
    userId,
    tenantId: DEFAULT_TENANT_ID,
    platform,
    platformVersion: getPlatformVersion(),
    sourceInstance: sourceInstance(),
    exportPlugins,
    installedPlugins,
    options: {
      includeFiles: options.includeFiles ?? true,
      excludePluginIds: options.excludePluginIds,
    },
  });

  const ciphertext = await encrypt(Buffer.from(zip), passphrase);
  const bytes = Buffer.from(ciphertext, 'base64url');
  mkdirSync(dirname(job.archivePath), { recursive: true });
  writeFileSync(job.archivePath, bytes);

  logger.info('backup-run: user backup complete', { jobId: job.id, archivePath: job.archivePath });
  return { archivePath: job.archivePath, sizeBytes: bytes.length };
}
