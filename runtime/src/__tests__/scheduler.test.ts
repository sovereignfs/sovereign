import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PluginScheduleDecl } from '../../generated/plugin-schedules';
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
});
