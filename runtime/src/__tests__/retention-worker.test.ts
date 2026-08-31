import { afterEach, describe, expect, it } from 'vitest';
import {
  type RetentionWorkerDeps,
  parseRetentionDays,
  retentionWorkerTickOnce,
  startRetentionWorker,
  stopRetentionWorker,
} from '../retention-worker';

function deps(overrides: Partial<RetentionWorkerDeps> = {}): RetentionWorkerDeps {
  return {
    now: () => 1_000_000_000,
    getDeliveryLogsRetentionDays: async () => null,
    getActivityLogRetentionDays: async () => null,
    pruneDeliveryLogs: async () => undefined,
    pruneActivityLog: async () => undefined,
    ...overrides,
  };
}

afterEach(() => {
  stopRetentionWorker();
  // No env-var gate to reset — unlike backup-worker, this worker always starts.
});

describe('parseRetentionDays', () => {
  it('accepts a positive integer string', () => {
    expect(parseRetentionDays('30')).toBe(30);
    expect(parseRetentionDays('1')).toBe(1);
  });

  it('rejects unset, zero, negative, non-integer, and non-numeric values', () => {
    expect(parseRetentionDays(null)).toBeNull();
    expect(parseRetentionDays('0')).toBeNull();
    expect(parseRetentionDays('-5')).toBeNull();
    expect(parseRetentionDays('3.5')).toBeNull();
    expect(parseRetentionDays('not-a-number')).toBeNull();
  });
});

describe('retentionWorkerTickOnce', () => {
  it('prunes nothing when neither window is configured — no default-on pruning', async () => {
    const d = deps();
    await retentionWorkerTickOnce(d);
    // Nothing to assert on the fakes themselves (they're plain async no-ops),
    // so assert indirectly: a second, spy-backed run confirms zero calls.
    let pruneDeliveryCalls = 0;
    let pruneActivityCalls = 0;
    await retentionWorkerTickOnce(
      deps({
        pruneDeliveryLogs: async () => {
          pruneDeliveryCalls++;
        },
        pruneActivityLog: async () => {
          pruneActivityCalls++;
        },
      }),
    );
    expect(pruneDeliveryCalls).toBe(0);
    expect(pruneActivityCalls).toBe(0);
  });

  it('prunes delivery logs at the configured cutoff when that window alone is set', async () => {
    let cutoffSeconds: number | null = null;
    let activityCalled = false;
    await retentionWorkerTickOnce(
      deps({
        now: () => 1_000_000_000,
        getDeliveryLogsRetentionDays: async () => 30,
        pruneDeliveryLogs: async (cutoff) => {
          cutoffSeconds = cutoff;
        },
        pruneActivityLog: async () => {
          activityCalled = true;
        },
      }),
    );
    expect(cutoffSeconds).toBe(1_000_000_000 - 30 * 86_400);
    expect(activityCalled).toBe(false);
  });

  it('prunes the activity log independently of the delivery-log window', async () => {
    let cutoffSeconds: number | null = null;
    let deliveryCalled = false;
    await retentionWorkerTickOnce(
      deps({
        now: () => 2_000_000_000,
        getActivityLogRetentionDays: async () => 7,
        pruneActivityLog: async (cutoff) => {
          cutoffSeconds = cutoff;
        },
        pruneDeliveryLogs: async () => {
          deliveryCalled = true;
        },
      }),
    );
    expect(cutoffSeconds).toBe(2_000_000_000 - 7 * 86_400);
    expect(deliveryCalled).toBe(false);
  });

  it('prunes both independently when both windows are set', async () => {
    const calls: string[] = [];
    await retentionWorkerTickOnce(
      deps({
        getDeliveryLogsRetentionDays: async () => 90,
        getActivityLogRetentionDays: async () => 365,
        pruneDeliveryLogs: async () => {
          calls.push('delivery');
        },
        pruneActivityLog: async () => {
          calls.push('activity');
        },
      }),
    );
    expect(calls.sort()).toEqual(['activity', 'delivery']);
  });
});

describe('startRetentionWorker / stopRetentionWorker', () => {
  it('starts a real tick loop and stops it cleanly', () => {
    startRetentionWorker(deps(), 60_000);
    // Starting twice must not create a second timer — matches
    // backup-worker.ts's/scheduler.ts's own idempotent-start contract.
    startRetentionWorker(deps(), 60_000);
    stopRetentionWorker();
    // Stopping twice must not throw.
    stopRetentionWorker();
  });
});
