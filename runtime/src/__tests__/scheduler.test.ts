import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PluginScheduleDecl } from '../../generated/plugin-schedules';
import { getBackgroundPluginContext } from '../background-plugin-context';
import {
  schedulerDisabled,
  startScheduler,
  stopScheduler,
  tickOnce,
  toStates,
  type SchedulerDeps,
} from '../scheduler';

function decl(overrides: Partial<PluginScheduleDecl> = {}): PluginScheduleDecl {
  return {
    pluginId: 'com.example.notes',
    scheduleId: 'sync',
    intervalMinutes: 5,
    handler: vi.fn(async () => undefined),
    ...overrides,
  };
}

function deps(overrides: Partial<SchedulerDeps> = {}): SchedulerDeps {
  return {
    getDisabledIds: async () => [],
    now: () => 1_000_000_000_000,
    ...overrides,
  };
}

afterEach(() => {
  stopScheduler();
  vi.useRealTimers();
  delete process.env.SOVEREIGN_SCHEDULER_DISABLED;
});

describe('tickOnce', () => {
  it('invokes a never-run schedule on the first tick', async () => {
    const d = decl();
    const states = toStates([d]);
    await tickOnce(states, deps());
    expect(d.handler).toHaveBeenCalledTimes(1);
  });

  it('passes plugin identity and synthetic attribution headers to the handler', async () => {
    let seen: { pluginId: string; scheduleId: string; headers: Headers } | undefined;
    const handler = async (ctx: { pluginId: string; scheduleId: string; headers: Headers }) => {
      seen = ctx;
    };
    const states = toStates([decl({ handler })]);
    await tickOnce(states, deps());
    expect(seen?.pluginId).toBe('com.example.notes');
    expect(seen?.scheduleId).toBe('sync');
    expect(seen?.headers.get('x-sovereign-plugin-id')).toBe('com.example.notes');
  });

  it('makes the plugin id available via getBackgroundPluginContext() during the handler, and clears it after', async () => {
    let seenDuring: string | undefined;
    const handler = async () => {
      seenDuring = getBackgroundPluginContext();
    };
    const states = toStates([decl({ pluginId: 'fs.sovereign.tasks', handler })]);

    expect(getBackgroundPluginContext()).toBeUndefined();
    await tickOnce(states, deps());
    expect(seenDuring).toBe('fs.sovereign.tasks');
    expect(getBackgroundPluginContext()).toBeUndefined();
  });

  it('does not re-invoke before intervalMinutes has elapsed', async () => {
    const d = decl({ intervalMinutes: 5 });
    const states = toStates([d]);
    let nowMs = 1_000_000_000_000;
    const testDeps = deps({ now: () => nowMs });

    await tickOnce(states, testDeps);
    nowMs += 4 * 60_000; // 4 min < 5 min interval
    await tickOnce(states, testDeps);
    expect(d.handler).toHaveBeenCalledTimes(1);

    nowMs += 60_000; // now 5 min since first run
    await tickOnce(states, testDeps);
    expect(d.handler).toHaveBeenCalledTimes(2);
  });

  it('skips schedules whose plugin is disabled without dropping state', async () => {
    const d = decl();
    const states = toStates([d]);
    const disabled = deps({ getDisabledIds: async () => ['com.example.notes'] });

    await tickOnce(states, disabled);
    expect(d.handler).not.toHaveBeenCalled();

    // Re-enabled: runs on the next tick.
    await tickOnce(states, deps());
    expect(d.handler).toHaveBeenCalledTimes(1);
  });

  it('contains a throwing handler and keeps sibling schedules running', async () => {
    const bad = decl({
      pluginId: 'com.example.bad',
      handler: vi.fn(async () => {
        throw new Error('boom');
      }),
    });
    const good = decl({ pluginId: 'com.example.good' });
    const states = toStates([bad, good]);

    await expect(tickOnce(states, deps())).resolves.toBeUndefined();
    expect(good.handler).toHaveBeenCalledTimes(1);
  });

  it('does not hot-retry a throwing handler on the next tick', async () => {
    const bad = decl({
      handler: vi.fn(async () => {
        throw new Error('boom');
      }),
    });
    const states = toStates([bad]);
    let nowMs = 1_000_000_000_000;
    const testDeps = deps({ now: () => nowMs });

    await tickOnce(states, testDeps);
    nowMs += 60_000; // next tick, interval (5m) not yet elapsed
    await tickOnce(states, testDeps);
    expect(bad.handler).toHaveBeenCalledTimes(1);
  });

  it('skips a schedule whose previous invocation is still running', async () => {
    let release: () => void = () => undefined;
    const blocked = new Promise<void>((r) => (release = r));
    const handler = vi.fn(async () => blocked);
    const d = decl({ intervalMinutes: 1, handler });
    const states = toStates([d]);
    let nowMs = 1_000_000_000_000;
    const testDeps = deps({ now: () => nowMs });

    const first = tickOnce(states, testDeps);
    nowMs += 10 * 60_000; // interval long since elapsed, but still running
    await tickOnce(states, testDeps);
    expect(handler).toHaveBeenCalledTimes(1);

    release();
    await first;
  });

  it('skips the whole tick when the disabled-plugin lookup fails', async () => {
    const d = decl();
    const states = toStates([d]);
    await tickOnce(
      states,
      deps({
        getDisabledIds: async () => {
          throw new Error('db down');
        },
      }),
    );
    expect(d.handler).not.toHaveBeenCalled();
  });

  it('processes at most SCHEDULES_PER_TICK due handlers per tick, leaving the remainder due for the very next tick', async () => {
    const decls = Array.from({ length: 25 }, (_, i) =>
      decl({ pluginId: `com.example.p${String(i)}`, scheduleId: 's', intervalMinutes: 1 }),
    );
    const states = toStates(decls);
    let nowMs = 1_000_000_000_000;
    const testDeps = deps({ now: () => nowMs });

    await tickOnce(states, testDeps);
    const calledAfterFirstTick = decls.filter((d) => vi.mocked(d.handler).mock.calls.length > 0);
    expect(calledAfterFirstTick).toHaveLength(20);
    const untouched = states.filter((s) => s.lastRun === 0);
    expect(untouched).toHaveLength(5);

    // The very next tick (not a full intervalMinutes later) picks up the
    // remainder -- it was never waiting out its own interval, just capped.
    nowMs += 1;
    await tickOnce(states, testDeps);
    const calledAfterSecondTick = decls.filter((d) => vi.mocked(d.handler).mock.calls.length > 0);
    expect(calledAfterSecondTick).toHaveLength(25);
  });

  it('abandons a handler after SCHEDULE_HANDLER_TIMEOUT_MS, logging it, without blocking a second due handler in the same tick', async () => {
    vi.useFakeTimers();
    let releaseHung: () => void = () => undefined;
    const hungPromise = new Promise<void>((resolve) => {
      releaseHung = resolve;
    });
    const hung = decl({ pluginId: 'com.example.hung', handler: vi.fn(async () => hungPromise) });
    const fast = decl({ pluginId: 'com.example.fast' });
    const states = toStates([hung, fast]);

    const tickPromise = tickOnce(states, deps());
    await vi.advanceTimersByTimeAsync(30_000);
    await tickPromise;

    expect(hung.handler).toHaveBeenCalledTimes(1);
    expect(fast.handler).toHaveBeenCalledTimes(1);
    // The orphaned promise hasn't settled yet -- running must stay true.
    expect(states[0]?.running).toBe(true);

    releaseHung();
    await vi.advanceTimersByTimeAsync(0);
    expect(states[0]?.running).toBe(false);
  });

  it("keeps a timed-out schedule's running flag true until its orphaned promise settles, so a tick within that window still skips it", async () => {
    vi.useFakeTimers();
    let releaseHung: () => void = () => undefined;
    const hungPromise = new Promise<void>((resolve) => {
      releaseHung = resolve;
    });
    const hung = decl({
      pluginId: 'com.example.hung',
      intervalMinutes: 1,
      handler: vi.fn(async () => hungPromise),
    });
    const states = toStates([hung]);
    let nowMs = 1_000_000_000_000;
    const testDeps = deps({ now: () => nowMs });

    const first = tickOnce(states, testDeps);
    await vi.advanceTimersByTimeAsync(30_000);
    await first;
    expect(hung.handler).toHaveBeenCalledTimes(1);

    // Interval long since elapsed, but the schedule is still notionally
    // running (orphaned promise not yet settled) -- must be skipped.
    nowMs += 10 * 60_000;
    await tickOnce(states, testDeps);
    expect(hung.handler).toHaveBeenCalledTimes(1);

    releaseHung();
    await vi.advanceTimersByTimeAsync(0);
    expect(states[0]?.running).toBe(false);

    // Now that it's actually settled, it's picked up again.
    await tickOnce(states, testDeps);
    expect(hung.handler).toHaveBeenCalledTimes(2);
  });
});

describe('startScheduler / stopScheduler', () => {
  it('ticks on the configured interval and stops cleanly', async () => {
    vi.useFakeTimers();
    const d = decl({ intervalMinutes: 1 });
    startScheduler([d], deps({ now: Date.now }), 1_000);

    await vi.advanceTimersByTimeAsync(1_000);
    expect(d.handler).toHaveBeenCalledTimes(1);

    stopScheduler();
    await vi.advanceTimersByTimeAsync(5_000);
    expect(d.handler).toHaveBeenCalledTimes(1);
  });

  it('does not start when SOVEREIGN_SCHEDULER_DISABLED is set', async () => {
    vi.useFakeTimers();
    process.env.SOVEREIGN_SCHEDULER_DISABLED = '1';
    expect(schedulerDisabled()).toBe(true);

    const d = decl({ intervalMinutes: 1 });
    startScheduler([d], deps({ now: Date.now }), 1_000);
    await vi.advanceTimersByTimeAsync(3_000);
    expect(d.handler).not.toHaveBeenCalled();
  });

  it('does not start a second concurrent tickOnce while the previous one is still in flight', async () => {
    vi.useFakeTimers();
    let releaseHung: () => void = () => undefined;
    const hungPromise = new Promise<void>((resolve) => {
      releaseHung = resolve;
    });
    const handler = vi.fn(async () => hungPromise);
    const d = decl({ intervalMinutes: 1, handler });
    startScheduler([d], deps({ now: Date.now }), 1_000);

    // First interval fires and starts a tick whose handler never resolves on
    // its own -- the tick itself is still in flight (the handler is still
    // pending, well before SCHEDULE_HANDLER_TIMEOUT_MS).
    await vi.advanceTimersByTimeAsync(1_000);
    expect(handler).toHaveBeenCalledTimes(1);

    // Several more intervals fire while the first tick is still in flight --
    // none of them should start a second tickOnce (call count stays at 1),
    // proving the tickInFlight guard, not just the per-schedule `running`
    // guard (which is scheduler-internal and wouldn't by itself prevent a
    // second tickOnce from starting and re-scanning every schedule).
    await vi.advanceTimersByTimeAsync(5_000);
    expect(handler).toHaveBeenCalledTimes(1);

    releaseHung();
    await vi.advanceTimersByTimeAsync(0);

    // Now that the in-flight tick has resolved, the next interval starts a
    // fresh one -- but the handler's own interval (1 min) hasn't elapsed
    // since its lastRun was stamped, so it stays at 1 call, not 2, proving
    // this is the re-entrancy guard resetting, not some other suppression.
    await vi.advanceTimersByTimeAsync(1_000);
    expect(handler).toHaveBeenCalledTimes(1);
  });
});
