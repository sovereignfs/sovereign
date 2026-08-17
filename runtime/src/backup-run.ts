import { spawnSync } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import { findWorkspaceRoot, type BackupJobRow } from '@sovereignfs/db';
import { logger } from './logger';

const SUBPROCESS_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes — generous ceiling for a large instance archive
const MAX_CAPTURED_OUTPUT_CHARS = 4000; // keep a verbose subprocess from blowing up the stored error message

interface BackupJobOptions {
  excludePlugins?: string[];
}

function parseOptions(optionsJson: string | null): BackupJobOptions {
  if (!optionsJson) return {};
  try {
    const parsed: unknown = JSON.parse(optionsJson);
    return typeof parsed === 'object' && parsed !== null ? (parsed as BackupJobOptions) : {};
  } catch {
    return {};
  }
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
 * wired in here yet: the requester's passphrase is never persisted, and no
 * mechanism yet exists to carry it from wherever a job is enqueued through to
 * whichever later tick actually claims and runs it. That's unresolved design
 * work, not a coding gap — solving it belongs to whichever task builds the
 * first real enqueue path (epic tasks 8.17/8.18), which decide passphrase
 * collection in the first place.
 *
 * User-scope jobs (`assembleExport()`, in-process) are not wired at all yet —
 * no UI exists to enqueue one (epic task 8.18).
 */
export async function runInstanceBackup(
  job: BackupJobRow,
): Promise<{ archivePath: string; sizeBytes: number }> {
  if (job.scope === 'user') {
    throw new Error(
      'User-scope backup jobs are not implemented yet (epic task 8.18) — no enqueue path exists.',
    );
  }

  const options = parseOptions(job.optionsJson);
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
