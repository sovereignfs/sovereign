import type { PluginScheduleDecl } from '../generated/plugin-schedules';
import { PLUGIN_SCHEDULES } from '../generated/plugin-schedules';
import { runWithBackgroundPlugin } from './background-plugin-context';
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
/** Cap on due handlers processed per tick — bounds one tick's worst-case latency; remaining backlog continues next tick (mirrors runtime/src/jobs.ts's JOBS_PER_TICK). */
const SCHEDULES_PER_TICK = 20;
/** A handler this slow is abandoned by tickOnce, matching runtime/src/user-deletion.ts's DELETION_TIMEOUT_MS. This only stops tickOnce from waiting on it — ScheduleHandler accepts no AbortSignal, so the handler's own async work may keep running in the background. */
const SCHEDULE_HANDLER_TIMEOUT_MS = 30_000;

let timer: NodeJS.Timeout | null = null;
let states: ScheduleState[] = [];
/** Guards startScheduler's setInterval against starting a second tickOnce while the previous one is still in flight. */
let tickInFlight = false;

export function schedulerDisabled(): boolean {
  const v = process.env.SOVEREIGN_SCHEDULER_DISABLED;
  return v === '1' || v === 'true';
}

/** Fresh per-schedule runtime state (exported for unit tests). */
export function toStates(decls: PluginScheduleDecl[]): ScheduleState[] {
  return decls.map((decl) => ({ decl, lastRun: 0, running: false }));
}

/**
 * Run due schedules once, up to `SCHEDULES_PER_TICK`, staleness-first
 * (sorted by `lastRun` ascending so a tick with more due handlers than the
 * cap doesn't always favor whichever schedules happen to sit earlier in
 * declaration order — the untouched remainder is picked up on the very next
 * tick, not after waiting out its full `intervalMinutes`). Exported for unit
 * tests; production use goes through `startScheduler`'s interval. Failures
 * are logged and never thrown — one broken handler must not take down the
 * tick loop or its sibling schedules. `lastRun` is stamped when the
 * invocation *starts* (and stays stamped on failure) so a throwing handler
 * retries on its own interval, not hot on every tick.
 *
 * Each handler is raced against `SCHEDULE_HANDLER_TIMEOUT_MS` so one hung
 * handler can't block the rest of the tick — but since `ScheduleHandler`
 * accepts no `AbortSignal`, a "timeout" only stops `tickOnce` from waiting,
 * it can't cancel the handler's own execution. `state.running` stays `true`
 * for a timed-out schedule until its orphaned promise actually settles, so
 * the guard above (`if (state.running) continue;`) still prevents that
 * specific schedule from being reinvoked while it's notionally still running.
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

  const sorted = [...scheduleStates].sort((a, b) => a.lastRun - b.lastRun);

  let processed = 0;
  for (const state of sorted) {
    if (processed >= SCHEDULES_PER_TICK) break;
    const { decl } = state;
    if (state.running) continue;
    if (disabled.has(decl.pluginId)) continue;
    const now = deps.now();
    if (now - state.lastRun < decl.intervalMinutes * 60_000) continue;

    processed += 1;
    state.lastRun = now;
    state.running = true;

    let handlerSettled = false;
    const handlerPromise = runWithBackgroundPlugin(decl.pluginId, () =>
      decl.handler({
        pluginId: decl.pluginId,
        scheduleId: decl.scheduleId,
        // Synthetic request headers so SDK surfaces that attribute by header
        // (sdk.notifications.send) see the correct plugin identity.
        headers: new Headers({ 'x-sovereign-plugin-id': decl.pluginId }),
      }),
    ).then(
      (value) => {
        handlerSettled = true;
        return value;
      },
      (err: unknown) => {
        handlerSettled = true;
        throw err;
      },
    );

    try {
      await Promise.race([
        handlerPromise,
        new Promise<never>((_, reject) =>
          setTimeout(
            () =>
              reject(
                new Error(
                  `Schedule handler timed out after ${String(SCHEDULE_HANDLER_TIMEOUT_MS / 1000)}s`,
                ),
              ),
            SCHEDULE_HANDLER_TIMEOUT_MS,
          ),
        ),
      ]);
      state.running = false;
    } catch (err) {
      logger.error('scheduler: schedule handler failed', {
        pluginId: decl.pluginId,
        scheduleId: decl.scheduleId,
        err: err instanceof Error ? err.message : String(err),
      });
      if (handlerSettled) {
        // The handler itself threw/rejected (not a timeout) — already
        // settled, safe to clear immediately.
        state.running = false;
      } else {
        // The timeout won the race while the handler is still pending —
        // state.running must stay true until the orphaned promise actually
        // settles, per this function's own doc comment. The trailing
        // .catch() only prevents an unhandled-rejection warning for this
        // now-orphaned chain; the failure itself was already logged above.
        void handlerPromise
          .finally(() => {
            state.running = false;
          })
          .catch(() => {
            /* already logged above; this only silences the orphaned chain */
          });
      }
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
    if (tickInFlight) {
      logger.warn('scheduler: previous tick still in flight — skipping this interval');
      return;
    }
    tickInFlight = true;
    void tickOnce(states, deps).finally(() => {
      tickInFlight = false;
    });
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
  tickInFlight = false;
}
