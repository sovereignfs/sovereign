import { randomUUID } from 'node:crypto';
import {
  claimNextJob as dbClaimNextJob,
  completeJobFailure as dbCompleteJobFailure,
  completeJobSuccess as dbCompleteJobSuccess,
  recordActivity,
  updateJobProgress as dbUpdateJobProgress,
  type CompleteJobFailureResult,
  type PluginJobRow,
} from '@sovereignfs/db';
import type { PluginJobDecl } from '../generated/plugin-jobs';
import { PLUGIN_JOBS } from '../generated/plugin-jobs';
import { runWithBackgroundPlugin } from './background-plugin-context';
import { getPlatformDb } from './db';
import { logger } from './logger';
import { getDisabledPluginIds } from './plugin-status';

/**
 * Runtime job worker loop (RFC 0046). Claims due jobs one at a time —
 * atomically, via `claimNextJob`'s `UPDATE ... RETURNING` (multi-node safe on
 * Postgres, see its doc comment in `@sovereignfs/db`) — runs the
 * manifest-declared handler, and records the outcome.
 *
 * Unlike the Phase 1 scheduler (`./scheduler.ts`), job state lives entirely
 * in `plugin_jobs`: there is no in-memory "is this running" tracking to lose
 * on restart. A job already `running` simply isn't matched by
 * `claimNextJob`'s status filter, so a crash mid-job leaves it visibly
 * `running` (surfaced by `getJobHealthSummary`'s `stuckCount`) rather than
 * silently re-run — deliberately no automatic reclaim; an operator
 * investigates via admin health.
 *
 * All persistence is behind `JobWorkerDeps` (DI, not module mocking) —
 * same convention as `SchedulerDeps` in `./scheduler.ts`.
 */

export interface JobWorkerDeps {
  /** Plugin ids currently disabled — their jobs are skipped, not claimed. */
  getDisabledIds: () => Promise<string[]>;
  /** Epoch seconds (matches `plugin_jobs.run_at`'s unit — NOT milliseconds). */
  now: () => number;
  claimNextJob: (opts: {
    disabledPluginIds: string[];
    now: number;
  }) => Promise<PluginJobRow | undefined>;
  completeJobSuccess: (job: PluginJobRow) => Promise<void>;
  completeJobFailure: (job: PluginJobRow, error: string) => Promise<CompleteJobFailureResult>;
  reportProgress: (jobId: string, progress: number, message: string | null) => Promise<void>;
  /** Records an operator-visible activity event for a terminal or rescheduled failure. */
  recordJobFailure: (job: PluginJobRow, error: string) => Promise<void>;
}

const JOB_TICK_MS = 5_000;
/** Cap on jobs drained per tick — bounds one tick's worst-case latency; remaining backlog continues next tick. */
const JOBS_PER_TICK = 20;

let timer: NodeJS.Timeout | null = null;

export function jobWorkerDisabled(): boolean {
  const v = process.env.SOVEREIGN_JOB_WORKER_DISABLED;
  return v === '1' || v === 'true';
}

/** `<pluginId>:<type>` → handler declaration, for O(1) lookup at claim time. */
export function buildJobHandlerIndex(decls: PluginJobDecl[]): Map<string, PluginJobDecl> {
  return new Map(decls.map((d) => [`${d.pluginId}:${d.type}`, d]));
}

/** The minimal manifest slice this module needs — keeps tests independent of the full schema. */
export interface JobsPermissionManifest {
  id: string;
  permissions: readonly string[];
}

/** Enforced by every `sdk.jobs.*` host method — same pattern as `requireCryptoPluginContext`. */
export function requireJobsPluginContext(
  pluginId: string,
  manifest: JobsPermissionManifest | undefined,
): void {
  if (!manifest) {
    throw new Error(`Calling plugin "${pluginId}" is not installed.`);
  }
  if (!manifest.permissions.includes('jobs:write')) {
    throw new Error(`Plugin "${pluginId}" does not have the "jobs:write" permission.`);
  }
}

async function productionRecordJobFailure(job: PluginJobRow, error: string): Promise<void> {
  const pdb = await getPlatformDb();
  await recordActivity(pdb, {
    id: randomUUID(),
    actorId: null,
    actorType: 'system',
    action: `${job.pluginId}:job.failed`,
    subjectUserId: job.createdBy,
    targetType: 'plugin_job',
    targetId: job.id,
    pluginId: job.pluginId,
    visibility: 'admin',
    summary: `Job "${job.type}" failed: ${error}`,
    metadata: null,
  });
}

async function productionDisabledIds(): Promise<string[]> {
  return getDisabledPluginIds(await getPlatformDb());
}

function productionDeps(): JobWorkerDeps {
  return {
    getDisabledIds: productionDisabledIds,
    now: () => Math.floor(Date.now() / 1000),
    claimNextJob: async (opts) => dbClaimNextJob(await getPlatformDb(), opts),
    completeJobSuccess: async (job) => dbCompleteJobSuccess(await getPlatformDb(), job),
    completeJobFailure: async (job, error) =>
      dbCompleteJobFailure(await getPlatformDb(), job, error),
    reportProgress: async (jobId, progress, message) =>
      dbUpdateJobProgress(await getPlatformDb(), jobId, progress, message),
    recordJobFailure: productionRecordJobFailure,
  };
}

/**
 * Run one claimed job to completion: look up its handler, invoke it, and
 * record success/failure. A missing handler (plugin removed the job type, or
 * a stale row outlived a manifest change) and a malformed payload are both
 * treated as ordinary failures — they flow through the same retry/backoff
 * accounting as a thrown handler, converging on terminal failure once
 * `maxAttempts` is exhausted rather than needing a special-cased dead end.
 * Exported for unit tests.
 */
export async function runClaimedJob(
  job: PluginJobRow,
  handlers: Map<string, PluginJobDecl>,
  deps: JobWorkerDeps,
): Promise<void> {
  const finishFailure = async (error: string): Promise<void> => {
    const result = await deps.completeJobFailure(job, error);
    if (result.outcome === 'failed' || result.outcome === 'rescheduled') {
      await deps.recordJobFailure(job, error);
    }
  };

  const decl = handlers.get(`${job.pluginId}:${job.type}`);
  if (!decl) {
    await finishFailure(`no handler registered for job type "${job.type}"`);
    return;
  }

  let payload: unknown;
  try {
    payload = job.payload !== null ? (JSON.parse(job.payload) as unknown) : undefined;
  } catch (err) {
    await finishFailure(
      `failed to parse job payload: ${err instanceof Error ? err.message : String(err)}`,
    );
    return;
  }

  const ctx = {
    pluginId: job.pluginId,
    jobId: job.id,
    type: job.type,
    attempt: job.attempts,
    // Synthetic request headers so SDK surfaces that attribute by header
    // (sdk.notifications.send, sdk.jobs.enqueue) see the correct plugin identity.
    headers: new Headers({ 'x-sovereign-plugin-id': job.pluginId }),
    reportProgress: (progress: number, message?: string) =>
      deps.reportProgress(job.id, progress, message ?? null),
  };

  try {
    await runWithBackgroundPlugin(job.pluginId, () => decl.handler(ctx, payload));
    await deps.completeJobSuccess(job);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error('jobs: handler failed', {
      pluginId: job.pluginId,
      jobId: job.id,
      type: job.type,
      err: message,
    });
    await finishFailure(message);
  }
}

/**
 * Claim and run due jobs once, up to `JOBS_PER_TICK`. Exported for unit
 * tests; production use goes through `startJobWorker`'s interval. A failure
 * reading disabled plugins skips the whole tick (fail-closed) rather than
 * risking a disabled plugin's job running.
 */
export async function tickOnce(
  handlers: Map<string, PluginJobDecl>,
  deps: JobWorkerDeps,
): Promise<void> {
  let disabled: string[];
  try {
    disabled = await deps.getDisabledIds();
  } catch (err) {
    logger.error('jobs: failed to read disabled plugins — skipping tick', {
      err: err instanceof Error ? err.message : String(err),
    });
    return;
  }

  for (let i = 0; i < JOBS_PER_TICK; i++) {
    const job = await deps.claimNextJob({ disabledPluginIds: disabled, now: deps.now() });
    if (!job) break;
    await runClaimedJob(job, handlers, deps);
  }
}

/**
 * Start the job worker tick loop. Called once from `runtime/instrumentation.ts`
 * at server startup (Node.js runtime only), alongside `startScheduler`. No-ops
 * when no plugin declares a job type or when the operator set
 * `SOVEREIGN_JOB_WORKER_DISABLED`.
 */
export function startJobWorker(
  decls: PluginJobDecl[] = PLUGIN_JOBS,
  deps: JobWorkerDeps = productionDeps(),
  tickMs: number = JOB_TICK_MS,
): void {
  if (timer) return;
  if (jobWorkerDisabled()) {
    logger.info('jobs: worker disabled via SOVEREIGN_JOB_WORKER_DISABLED');
    return;
  }
  if (decls.length === 0) return;

  const handlers = buildJobHandlerIndex(decls);
  logger.info('jobs: worker started', {
    types: decls.map((d) => `${d.pluginId}:${d.type}`),
  });

  timer = setInterval(() => {
    void tickOnce(handlers, deps);
  }, tickMs);
  // Never hold an otherwise-exiting process open just to keep ticking.
  timer.unref();
}

/** Stop the job worker tick loop (SIGTERM). An in-flight job finishes on its own. */
export function stopJobWorker(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
