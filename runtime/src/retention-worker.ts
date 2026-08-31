import { getPlatformSetting, pruneActivityLog, pruneDeliveryLogs } from '@sovereignfs/db';
import { getPlatformDb } from './db';
import { logger } from './logger';

/**
 * Operator-configured log retention (GDPR-7, Art. 5(1)(e)). One ~6h tick
 * reads the two retention windows from `platform_settings` and, only for
 * whichever is actually set, deletes rows older than it. No default-on
 * pruning anywhere in this file — an instance with neither setting configured
 * never deletes a row, matching research 0007's own recommendation to ship
 * the mechanism with no default rather than guess a window operators didn't
 * ask for.
 *
 * Two independent settings, not one shared window — `pruneDeliveryLogs`
 * (`email_delivery_log`/`push_delivery_log`/`data_access_log`) and
 * `pruneActivityLog` (`activity_log`) trade off differently (storage
 * limitation vs. audit integrity/accountability); see each function's own
 * doc comment in `@sovereignfs/db`.
 *
 * Always started (unlike `backup-worker.ts`, which is opt-in because it has
 * no reachable enqueue path yet) — this worker's settings are reachable from
 * Console the moment this ships, and a 6h tick that reads two unset settings
 * and does nothing is negligible overhead, not "pure overhead for a feature
 * no one can reach."
 */

export const RETENTION_DELIVERY_LOGS_DAYS_SETTING = 'retention_delivery_logs_days';
export const RETENTION_ACTIVITY_LOG_DAYS_SETTING = 'retention_activity_log_days';

const TICK_MS = 6 * 60 * 60 * 1000;

let timer: NodeJS.Timeout | null = null;

export interface RetentionWorkerDeps {
  /** Epoch seconds (matches the log tables' own columns — NOT milliseconds). */
  now: () => number;
  getDeliveryLogsRetentionDays: () => Promise<number | null>;
  getActivityLogRetentionDays: () => Promise<number | null>;
  pruneDeliveryLogs: (cutoffSeconds: number) => Promise<void>;
  pruneActivityLog: (cutoffSeconds: number) => Promise<void>;
}

/** A stored setting value, parsed back to a positive integer day count — anything else (unset, non-numeric, zero, negative) means "no window configured." */
export function parseRetentionDays(raw: string | null): number | null {
  if (raw === null) return null;
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function daysToCutoff(nowSeconds: number, days: number): number {
  return nowSeconds - days * 86_400;
}

/** Run one tick: prune whichever of the two retention windows is actually configured. Exported for unit tests; production use goes through `startRetentionWorker`'s interval. */
export async function retentionWorkerTickOnce(deps: RetentionWorkerDeps): Promise<void> {
  const now = deps.now();

  const deliveryDays = await deps.getDeliveryLogsRetentionDays();
  if (deliveryDays !== null) {
    await deps.pruneDeliveryLogs(daysToCutoff(now, deliveryDays));
    logger.info('retention-worker: pruned delivery/access logs', { retentionDays: deliveryDays });
  }

  const activityDays = await deps.getActivityLogRetentionDays();
  if (activityDays !== null) {
    await deps.pruneActivityLog(daysToCutoff(now, activityDays));
    logger.info('retention-worker: pruned activity log', { retentionDays: activityDays });
  }
}

function productionDeps(): RetentionWorkerDeps {
  return {
    now: () => Math.floor(Date.now() / 1000),
    getDeliveryLogsRetentionDays: async () =>
      parseRetentionDays(
        await getPlatformSetting(await getPlatformDb(), RETENTION_DELIVERY_LOGS_DAYS_SETTING),
      ),
    getActivityLogRetentionDays: async () =>
      parseRetentionDays(
        await getPlatformSetting(await getPlatformDb(), RETENTION_ACTIVITY_LOG_DAYS_SETTING),
      ),
    pruneDeliveryLogs: async (cutoffSeconds) =>
      pruneDeliveryLogs(await getPlatformDb(), cutoffSeconds),
    pruneActivityLog: async (cutoffSeconds) =>
      pruneActivityLog(await getPlatformDb(), cutoffSeconds),
  };
}

/** Start the retention tick loop. Called once from `runtime/instrumentation.ts` at server startup. */
export function startRetentionWorker(
  deps: RetentionWorkerDeps = productionDeps(),
  tickMs: number = TICK_MS,
): void {
  if (timer) return;
  logger.info('retention-worker: started');
  timer = setInterval(() => {
    void retentionWorkerTickOnce(deps);
  }, tickMs);
  timer.unref();
}

/** Stop the tick loop (SIGTERM). An in-flight prune finishes on its own. */
export function stopRetentionWorker(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
