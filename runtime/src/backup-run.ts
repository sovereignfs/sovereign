import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import {
  DEFAULT_TENANT_ID,
  findWorkspaceRoot,
  getPluginConnection,
  getPluginSecret,
  markBackupJobPushResult,
  markPluginConnectionError,
  markPluginConnectionUsed,
  type BackupJobRow,
  type PlatformDb,
} from '@sovereignfs/db';
import { encrypt, encryptToRecipients } from './backup-encryption';
import { takeBackupPassphrase } from './backup-passphrase-store';
import { getPlatformDb } from './db';
import { type GitPushAuthType, pushBackupToGit } from './git-backup';
import { logger } from './logger';
import { getPlatformVersion } from './platform-version';
import { assembleExport } from './portability/assemble';
import {
  eligibleExportPlugins,
  gatherPlatformExport,
  installedPluginsRoster,
} from './portability/platform';
import { decryptSecretValue } from './secrets';

const SUBPROCESS_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes — generous ceiling for a large instance archive
const MAX_CAPTURED_OUTPUT_CHARS = 4000; // keep a verbose subprocess from blowing up the stored error message

interface InstanceBackupJobOptions {
  excludePlugins?: string[];
}

interface UserBackupJobOptions {
  includeFiles?: boolean;
  excludePluginIds?: string[];
  /** A connected `plugins/account` backup-destination id — opts this job into a git push (epic 8.39). */
  pushDestinationId?: string;
}

// Matches plugins/account/app/_lib/backup-destinations.ts's PROVIDER_KIND
// owner — connections/secrets for this feature are always created under the
// account plugin's own id, regardless of which job later reads them back.
const BACKUP_DESTINATION_PLUGIN_ID = 'fs.sovereign.account';

interface BackupDestinationMetadata {
  repoUrl?: unknown;
  branch?: unknown;
  authType?: unknown;
  ageRecipient?: unknown;
}

function parseDestinationMetadata(metadataJson: string | null): {
  repoUrl: string;
  branch: string;
  authType: GitPushAuthType;
  ageRecipient: string;
} {
  const raw = metadataJson ? (JSON.parse(metadataJson) as BackupDestinationMetadata) : {};
  const repoUrl = typeof raw.repoUrl === 'string' ? raw.repoUrl : '';
  const branch = typeof raw.branch === 'string' ? raw.branch : '';
  const authType: GitPushAuthType = raw.authType === 'ssh-key' ? 'ssh-key' : 'https-token';
  const ageRecipient = typeof raw.ageRecipient === 'string' ? raw.ageRecipient : '';
  if (!repoUrl || !branch || !ageRecipient) {
    throw new Error(
      'Backup destination is missing required configuration (repo URL, branch, or age recipient).',
    );
  }
  return { repoUrl, branch, authType, ageRecipient };
}

/** Light heuristic only — an unrecognized failure always falls back to the safe 'error' status. */
function classifyPushFailure(message: string): 'error' | 'needs_reauth' {
  return /authentication failed|permission denied|unauthorized|403|401|invalid credentials/i.test(
    message,
  )
    ? 'needs_reauth'
    : 'error';
}

/**
 * Optional git-push step for a user-scope backup (workstream 0023 leg 3,
 * epic task 8.39) — encrypts the same plaintext export bundle a second time,
 * to the destination's age recipient rather than the requester's passphrase
 * (never the same ciphertext: the whole point of a personal git destination
 * is that it's decryptable only with the user's own downloaded private key,
 * never a passphrase that could be guessed or brute-forced by whoever
 * controls the git host), then pushes it as a tagged orphan commit.
 *
 * Deliberately swallows every failure here rather than letting it propagate:
 * per this leg's own "do not proceed if" clause, a failed push must never
 * turn an otherwise-successful archive generation into a failed job. Failure
 * is instead recorded on the connection (`markPluginConnectionError`) and on
 * the job's own `pushStatus`/`pushError` fields, both of which the read path
 * surfaces distinctly from job `status`.
 */
async function pushUserBackupToDestination(
  pdb: PlatformDb,
  job: BackupJobRow,
  destinationId: string,
  userId: string,
  plaintext: Buffer,
): Promise<void> {
  const context = { tenantId: DEFAULT_TENANT_ID, pluginId: BACKUP_DESTINATION_PLUGIN_ID, userId };
  try {
    const connection = await getPluginConnection(pdb, destinationId, context);
    if (!connection) throw new Error('Backup destination not found or no longer connected.');
    if (!connection.secretRef) throw new Error('Backup destination has no stored credential.');

    const destination = parseDestinationMetadata(connection.metadata);
    const secretRow = await getPluginSecret(pdb, connection.secretRef, context);
    if (!secretRow) throw new Error('Backup destination credential could not be read.');
    const credential = decryptSecretValue(secretRow.ciphertext, {
      tenantId: context.tenantId,
      pluginId: context.pluginId,
      scope: secretRow.scope,
      userId: context.userId,
    });

    const ciphertext = await encryptToRecipients(plaintext, [destination.ageRecipient]);
    const platformVersion = getPlatformVersion();

    await pushBackupToGit(
      {
        repoUrl: destination.repoUrl,
        branch: destination.branch,
        authType: destination.authType,
        credential,
      },
      Buffer.from(ciphertext, 'base64url'),
      'backup.age',
      {
        createdAt: Math.floor(Date.now() / 1000),
        platformVersion,
        scope: 'user',
      },
      platformVersion,
    );

    await markPluginConnectionUsed(pdb, destinationId, context);
    await markBackupJobPushResult(pdb, job.id, { status: 'succeeded' });
    logger.info('backup-run: pushed user backup to git destination', {
      jobId: job.id,
      destinationId,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error('backup-run: git push failed', { jobId: job.id, destinationId, err: message });
    try {
      await markPluginConnectionError(
        pdb,
        destinationId,
        context,
        message,
        classifyPushFailure(message),
      );
      await markBackupJobPushResult(pdb, job.id, { status: 'failed', error: message });
    } catch (markErr) {
      logger.error('backup-run: failed to record git push failure', {
        jobId: job.id,
        destinationId,
        err: markErr instanceof Error ? markErr.message : String(markErr),
      });
    }
  }
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

  const plaintext = Buffer.from(zip);
  const ciphertext = await encrypt(plaintext, passphrase);
  const bytes = Buffer.from(ciphertext, 'base64url');
  mkdirSync(dirname(job.archivePath), { recursive: true });
  writeFileSync(job.archivePath, bytes);

  logger.info('backup-run: user backup complete', { jobId: job.id, archivePath: job.archivePath });

  if (options.pushDestinationId) {
    const pdb = await getPlatformDb();
    await pushUserBackupToDestination(pdb, job, options.pushDestinationId, userId, plaintext);
  }

  return { archivePath: job.archivePath, sizeBytes: bytes.length };
}
