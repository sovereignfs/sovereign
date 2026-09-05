import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
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
import {
  fetchBackupBlob,
  type GitPushAuthType,
  type GitPushDestination,
  pushBackupToGit,
} from './git-backup';
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
  /** Opts this job into a git push (epic task 8.17) — see `resolveInstanceGitPushConfig()`. */
  pushToGit?: boolean;
}

interface UserBackupJobOptions {
  includeFiles?: boolean;
  excludePluginIds?: string[];
  /** A connected `plugins/account` backup-destination id — opts this job into a git push (epic 8.39). */
  pushDestinationId?: string;
}

interface RestoreFetchJobOptions {
  destinationId?: string;
  tag?: string;
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

/**
 * Instance-scope git-push destination (epic task 8.17) — unlike the
 * per-user destination above, this is plain env-var config an operator sets
 * in `.env`/Compose, not a `plugin_connections`/`plugin_secrets` row: RFC
 * 0064 (`docs/rfcs/0064-git-backed-operator-backups.md`) documents
 * `SV_BACKUP_GIT_REPOSITORY`/`SV_BACKUP_GIT_BRANCH`/`SV_BACKUP_GIT_TOKEN` as
 * a `docs/self-hosting.md`-level config surface. HTTPS-token auth only —
 * RFC 0064 states SSH URLs rely on the operator's own ambient SSH
 * agent/key, not new plumbing here.
 *
 * Exported for this module's own tests, not for reuse by
 * `plugins/console/app/backups/page.tsx` — the SDK boundary rule forbids a
 * plugin (Console included) from importing `runtime/src` at all. Console's
 * own "is git push available" check duplicates just the two env var *names*
 * directly (`entitlements/page.tsx`'s own `SOVEREIGN_ADMIN_KEY` read is the
 * established precedent for this), never this function or its logic.
 */
export function resolveInstanceGitPushConfig(): {
  repoUrl: string;
  branch: string;
  token: string;
  /** Optional age-recipient (epic task 8.41, workstream 0023 leg 5) — plain
   *  config, not a secret, since a public recipient string can't decrypt
   *  anything. `null` when unset, matching the passphrase-only behavior this
   *  push already had before this leg. */
  ageRecipient: string | null;
} | null {
  const repoUrl = process.env.SV_BACKUP_GIT_REPOSITORY;
  const token = process.env.SV_BACKUP_GIT_TOKEN;
  if (!repoUrl || !token) return null;
  return {
    repoUrl,
    branch: process.env.SV_BACKUP_GIT_BRANCH || 'backups',
    token,
    ageRecipient: process.env.SV_BACKUP_GIT_AGE_RECIPIENT || null,
  };
}

/**
 * Optional git-push step for an instance-scope backup (epic task 8.17,
 * extended by epic task 8.41 / workstream 0023 leg 5). When no age recipient
 * is configured, this is unchanged from 8.17's original behavior: the same
 * passphrase ciphertext already written to `job.archivePath` is pushed as-is.
 *
 * When `SV_BACKUP_GIT_AGE_RECIPIENT` *is* configured, the pushed copy is a
 * **separate** encryption pass over the original plaintext — to the
 * recipient, not the passphrase — mirroring `pushUserBackupToDestination`
 * above and for the identical reason: the passphrase is a one-off value
 * typed fresh into the Console trigger form for this specific request and
 * never persisted anywhere, while the recipient corresponds to a long-lived
 * identity file the operator holds indefinitely. Every git-pulled instance
 * backup should be decryptable by that one held identity regardless of which
 * passphrase protected that particular direct-download copy — combining both
 * into a single multi-recipient `age` file (which the format does support)
 * was considered and rejected: it would make the git copy *also*
 * passphrase-decryptable, silently reproducing the exact "decrypts only with
 * the matching identity" property epic task 8.41's own review checklist
 * requires *not* to hold.
 *
 * Same "never fail the job over a push failure" contract as the user-scope
 * version — recorded on the job's own `pushStatus`/`pushError` only, since
 * there's no per-destination connection row to mark here.
 */
async function pushInstanceBackupToGit(
  pdb: PlatformDb,
  job: BackupJobRow,
  plaintext: Buffer,
  passphraseCiphertext: Buffer,
): Promise<void> {
  try {
    const config = resolveInstanceGitPushConfig();
    if (!config) {
      throw new Error(
        'Git push was requested but SV_BACKUP_GIT_REPOSITORY/SV_BACKUP_GIT_TOKEN are not configured.',
      );
    }
    const platformVersion = getPlatformVersion();
    const destination: GitPushDestination = {
      repoUrl: config.repoUrl,
      branch: config.branch,
      authType: 'https-token',
      credential: config.token,
    };
    const encryptionMode = config.ageRecipient ? 'recipient' : 'passphrase';
    const payload = config.ageRecipient
      ? Buffer.from(await encryptToRecipients(plaintext, [config.ageRecipient]), 'base64url')
      : passphraseCiphertext;
    await pushBackupToGit(
      destination,
      payload,
      'sovereign-backup.tar.gz.age',
      {
        createdAt: Math.floor(Date.now() / 1000),
        platformVersion,
        scope: 'instance',
        encryptionMode,
      },
      platformVersion,
    );
    await markBackupJobPushResult(pdb, job.id, { status: 'succeeded' });
    logger.info('backup-run: pushed instance backup to git destination', {
      jobId: job.id,
      encryptionMode,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error('backup-run: instance git push failed', { jobId: job.id, err: message });
    try {
      await markBackupJobPushResult(pdb, job.id, { status: 'failed', error: message });
    } catch (markErr) {
      logger.error('backup-run: failed to record instance git push failure', {
        jobId: job.id,
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
 * spawn the `backup`/`restore` CLI logic (RFC 0084's own "existing CLI,
 * unchanged archive logic" design) as a child process via an argv array —
 * never a shell string (see docs/architecture-rules.md's shell-injection
 * rule) — with a hard timeout so a hung subprocess cannot leave the job
 * `running` forever.
 *
 * Docker-spawn gap CLOSED (epic task 8.16): the production `runner` image
 * has no `pnpm`/`tsx`/full `node_modules` to run `bin/sv.ts` itself, so this
 * spawns a dedicated, `tsup`-bundled artifact instead —
 * `runtime/dist-cli/sv-backup-cli.js` (built by `pnpm run build:cli`, copied
 * into `runner` by the Dockerfile) — runnable with plain `node`, no other
 * tooling required. `bin/sv-backup-cli.ts` and `bin/sv.ts` both register the
 * exact same command objects from `bin/backup-restore.ts`, so this is not a
 * second implementation. Falls back to `pnpm sv backup` when the bundle
 * hasn't been built (native `pnpm dev`/`tools` checkouts) — unchanged
 * behavior there.
 *
 * Postgres-dialect only: `sv backup`'s SQLite (sqld) path is explicitly not
 * implemented yet (`bin/backup-restore.ts`'s own error message) — building
 * it needs its own RFC first (see `docs/research/0017-sqld-backup-and-restore.md`),
 * an accepted, tracked-separately limitation, not something this fix
 * resolves. `pg_dump`/`pg_restore` (Postgres path) and `git` (the git-push/
 * restore-fetch path used by user-scope jobs below) are both now installed
 * in `runner` — see the Dockerfile.
 *
 * Encryption (RFC 0084: "always applied — no opt-out", epic task 8.17)
 * mirrors `runUserBackup` below: the CLI writes a **raw** archive to a
 * sibling temp path (never `job.archivePath` directly), which is then
 * encrypted with the requester's passphrase (taken, single-use, from
 * `backup-passphrase-store.ts`) before being written to `job.archivePath` —
 * the temp file is deleted either way, including on every error path.
 * `--exclude-plugin <id>` (repeatable) is passed straight through from
 * `optionsJson.excludePlugins` to the CLI.
 */
export async function runInstanceBackup(
  job: BackupJobRow,
): Promise<{ archivePath: string; sizeBytes: number }> {
  const options = parseOptions<InstanceBackupJobOptions>(job.optionsJson);

  const passphrase = takeBackupPassphrase(job.id);
  if (!passphrase) {
    throw new Error(
      'No passphrase available for this job (the server may have restarted before it was ' +
        'claimed) — please trigger a new backup.',
    );
  }

  const root = findWorkspaceRoot();
  const rawArchivePath = `${job.archivePath}.raw`;
  const excludeArgs = (options.excludePlugins ?? []).flatMap((id) => ['--exclude-plugin', id]);
  // The bundled CLI (production runner image) takes priority when present;
  // `pnpm sv backup` (dev/tools, unchanged) is the fallback. Neither path is
  // ever silently skipped — exactly one of the two always runs.
  const bundledCli = join(root, 'runtime', 'dist-cli', 'sv-backup-cli.js');
  const [command, commandArgs] = existsSync(bundledCli)
    ? ['node', [bundledCli, 'backup', '--out', rawArchivePath, ...excludeArgs]]
    : ['pnpm', ['sv', 'backup', '--out', rawArchivePath, ...excludeArgs]];

  try {
    const result = spawnSync(command, commandArgs, {
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
    if (!existsSync(rawArchivePath)) {
      throw new Error(
        `\`sv backup\` reported success but no archive was found at ${rawArchivePath}.`,
      );
    }

    const plaintext = readFileSync(rawArchivePath);
    const ciphertext = await encrypt(plaintext, passphrase);
    const bytes = Buffer.from(ciphertext, 'base64url');
    mkdirSync(dirname(job.archivePath), { recursive: true });
    writeFileSync(job.archivePath, bytes);

    logger.info('backup-run: instance backup complete', {
      jobId: job.id,
      archivePath: job.archivePath,
    });

    if (options.pushToGit) {
      const pdb = await getPlatformDb();
      await pushInstanceBackupToGit(pdb, job, plaintext, bytes);
    }

    return { archivePath: job.archivePath, sizeBytes: bytes.length };
  } finally {
    if (existsSync(rawArchivePath)) unlinkSync(rawArchivePath);
  }
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

/**
 * Default production `runBackup` for a `kind: 'restore-fetch'` job
 * (workstream 0023 leg 4, epic task 8.40) — the async half of in-app git
 * restore. Runs entirely in-process, same as `runUserBackup`, not affected
 * by the Docker `sv`-CLI-spawn gap. Pulls exactly one tagged ciphertext blob
 * down from the user's connected git destination and writes it to
 * `job.archivePath` untouched — this function never decrypts anything, never
 * even inspects the bytes beyond moving them; the existing signed-download
 * route then serves them exactly like a real backup's archive, and the
 * browser is the only place that ever holds the identity needed to read them.
 */
export async function runRestoreFetch(
  job: BackupJobRow,
): Promise<{ archivePath: string; sizeBytes: number }> {
  if (!job.requestedByUserId) {
    throw new Error('Restore-fetch job has no requestedByUserId — cannot run.');
  }
  const userId = job.requestedByUserId;
  const options = parseOptions<RestoreFetchJobOptions>(job.optionsJson);
  if (!options.destinationId || !options.tag) {
    throw new Error('Restore-fetch job is missing its destination or tag.');
  }

  const pdb = await getPlatformDb();
  const context = { tenantId: DEFAULT_TENANT_ID, pluginId: BACKUP_DESTINATION_PLUGIN_ID, userId };
  const connection = await getPluginConnection(pdb, options.destinationId, context);
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

  const blob = await fetchBackupBlob(
    { repoUrl: destination.repoUrl, authType: destination.authType, credential },
    options.tag,
  );

  mkdirSync(dirname(job.archivePath), { recursive: true });
  writeFileSync(job.archivePath, blob);

  await markPluginConnectionUsed(pdb, options.destinationId, context);
  logger.info('backup-run: restore-fetch complete', { jobId: job.id, tag: options.tag });

  return { archivePath: job.archivePath, sizeBytes: blob.length };
}
