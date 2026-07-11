import type { PluginScheduleDecl } from '../generated/plugin-schedules';
import { PLUGIN_SCHEDULES } from '../generated/plugin-schedules';
import { getPlatformDb } from './db';
import { logger } from './logger';
import { getDisabledPluginIds } from './plugin-status';

/**
 * Minimal in-process plugin scheduler — the scoped-down Phase 1 of RFC 0046.
 *
 * One ~60s tick walks every manifest-declared schedule (composed into
 * `runtime/generated/plugin-schedules.ts` by `scripts/generate-registry.ts`)
 * and invokes its handler when at least `intervalMinutes` have elapsed since
 * the last invocation *started*. Deliberately NOT a job queue: no persistence,
 * no retries, no backoff — `lastRun` lives in memory, so a restart re-arms
 * every schedule, and each replica of a multi-node deployment ticks
 * independently. Handlers own their idempotency (claim work with conditional
 * updates before acting) — that contract is documented on `ScheduleHandler`
 * in `@sovereignfs/sdk` and in docs/plugin-development.md.
 */

export interface ScheduleState {
  decl: PluginScheduleDecl;
  /** Epoch ms when the last invocation started; 0 = never ran this process. */
  lastRun: number;
  /** Guards against overlapping invocations when a handler outlives its interval. */
  running: boolean;
}

export interface SchedulerDeps {
  /** Plugin ids currently disabled — their schedules are skipped, not dropped. */
  getDisabledIds: () => Promise<string[]>;
  now: () => number;
}

const TICK_MS = 60_000;

let timer: NodeJS.Timeout | null = null;
let states: ScheduleState[] = [];

export function schedulerDisabled(): boolean {
  const v = process.env.SOVEREIGN_SCHEDULER_DISABLED;
  return v === '1' || v === 'true';
}

/** Fresh per-schedule runtime state (exported for unit tests). */
export function toStates(decls: PluginScheduleDecl[]): ScheduleState[] {
  return decls.map((decl) => ({ decl, lastRun: 0, running: false }));
}

/**
 * Run every due schedule once. Exported for unit tests; production use goes
 * through `startScheduler`'s interval. Failures are logged and never thrown —
 * one broken handler must not take down the tick loop or its sibling
 * schedules. `lastRun` is stamped when the invocation *starts* (and stays
 * stamped on failure) so a throwing handler retries on its own interval, not
 * hot on every tick.
 */
export async function tickOnce(
  scheduleStates: ScheduleState[],
  deps: SchedulerDeps,
): Promise<void> {
  if (scheduleStates.length === 0) return;

  let disabled: Set<string>;
  try {
    disabled = new Set(await deps.getDisabledIds());
  } catch (err) {
    logger.error('scheduler: failed to read disabled plugins — skipping tick', {
      err: err instanceof Error ? err.message : String(err),
    });
    return;
  }

  for (const state of scheduleStates) {
    const { decl } = state;
    if (state.running) continue;
    if (disabled.has(decl.pluginId)) continue;
    const now = deps.now();
    if (now - state.lastRun < decl.intervalMinutes * 60_000) continue;

    state.lastRun = now;
    state.running = true;
    try {
      await decl.handler({
        pluginId: decl.pluginId,
        scheduleId: decl.scheduleId,
        // Synthetic request headers so SDK surfaces that attribute by header
        // (sdk.notifications.send) see the correct plugin identity.
        headers: new Headers({ 'x-sovereign-plugin-id': decl.pluginId }),
      });
    } catch (err) {
      logger.error('scheduler: schedule handler failed', {
        pluginId: decl.pluginId,
        scheduleId: decl.scheduleId,
        err: err instanceof Error ? err.message : String(err),
      });
    } finally {
      state.running = false;
    }
  }
}

async function productionDisabledIds(): Promise<string[]> {
  return getDisabledPluginIds(await getPlatformDb());
}

/**
 * Start the tick loop. Called once from `runtime/instrumentation.ts` at
 * server startup (Node.js runtime only). No-ops when no plugin declares a
 * schedule or when the operator set `SOVEREIGN_SCHEDULER_DISABLED`.
 */
export function startScheduler(
  decls: PluginScheduleDecl[] = PLUGIN_SCHEDULES,
  deps: SchedulerDeps = { getDisabledIds: productionDisabledIds, now: Date.now },
  tickMs: number = TICK_MS,
): void {
  if (timer) return;
  if (schedulerDisabled()) {
    logger.info('scheduler: disabled via SOVEREIGN_SCHEDULER_DISABLED');
    return;
  }
  if (decls.length === 0) return;

  states = toStates(decls);
  logger.info('scheduler: started', {
    schedules: decls.map((d) => `${d.pluginId}:${d.scheduleId}@${String(d.intervalMinutes)}m`),
  });

  timer = setInterval(() => {
    void tickOnce(states, deps);
  }, tickMs);
  // Never hold an otherwise-exiting process open just to keep ticking.
  timer.unref();
}

/** Stop the tick loop (SIGTERM). In-flight handlers finish on their own. */
export function stopScheduler(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  states = [];
}
