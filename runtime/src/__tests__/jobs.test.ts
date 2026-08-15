import type { CompleteJobFailureResult, PluginJobRow } from '@sovereignfs/db';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PluginJobDecl } from '../../generated/plugin-jobs';
import { getBackgroundPluginContext } from '../background-plugin-context';
import {
  buildJobHandlerIndex,
  jobWorkerDisabled,
  requireJobsPluginContext,
  runClaimedJob,
  startJobWorker,
  stopJobWorker,
  tickOnce,
  type JobWorkerDeps,
} from '../jobs';

function job(overrides: Partial<PluginJobRow> = {}): PluginJobRow {
  return {
    id: 'job-1',
    tenantId: 'default',
    pluginId: 'com.example.notes',
    type: 'sync.remote',
    status: 'running',
    payload: JSON.stringify({ accountId: 'acct-1' }),
    runAt: 1_000_000_000,
    cron: null,
    timezone: null,
    dedupeKey: null,
    attempts: 1,
    maxAttempts: 3,
    lastError: null,
    progress: null,
    progressMessage: null,
    createdBy: null,
    createdAt: 1_000_000_000,
    updatedAt: 1_000_000_000,
    startedAt: 1_000_000_000,
    completedAt: null,
    cancelledAt: null,
    ...overrides,
  };
}

function jobDecl(overrides: Partial<PluginJobDecl> = {}): PluginJobDecl {
  return {
    pluginId: 'com.example.notes',
    type: 'sync.remote',
    maxAttempts: 3,
    handler: vi.fn(async () => undefined),
    ...overrides,
  };
}

function deps(overrides: Partial<JobWorkerDeps> = {}): JobWorkerDeps {
  return {
    getDisabledIds: async () => [],
    now: () => 1_000_000_000,
    claimNextJob: async () => undefined,
    completeJobSuccess: vi.fn(async () => undefined),
    completeJobFailure: vi.fn(async (): Promise<CompleteJobFailureResult> => ({
      outcome: 'retrying',
    })),
    reportProgress: vi.fn(async () => undefined),
    recordJobFailure: vi.fn(async () => undefined),
    ...overrides,
  };
}

afterEach(() => {
  stopJobWorker();
  vi.useRealTimers();
  delete process.env.SOVEREIGN_JOB_WORKER_DISABLED;
});

describe('runClaimedJob', () => {
  it('invokes the matched handler with the parsed payload and correct context', async () => {
    let seenPayload: unknown;
    let seenCtx: { pluginId: string; jobId: string; type: string; attempt: number } | undefined;
    const handler = vi.fn(async (ctx: typeof seenCtx, payload: unknown) => {
      seenCtx = ctx;
      seenPayload = payload;
    });
    const decl = jobDecl({ handler: handler as PluginJobDecl['handler'] });
    const handlers = buildJobHandlerIndex([decl]);
    const j = job();

    await runClaimedJob(j, handlers, deps());

    expect(handler).toHaveBeenCalledTimes(1);
    expect(seenPayload).toEqual({ accountId: 'acct-1' });
    expect(seenCtx?.pluginId).toBe('com.example.notes');
    expect(seenCtx?.jobId).toBe('job-1');
    expect(seenCtx?.type).toBe('sync.remote');
    expect(seenCtx?.attempt).toBe(1);
  });

  it('passes synthetic attribution headers to the handler', async () => {
    let seenHeaders: Headers | undefined;
    const decl = jobDecl({
      handler: async (ctx) => {
        seenHeaders = ctx.headers;
      },
    });
    await runClaimedJob(job(), buildJobHandlerIndex([decl]), deps());
    expect(seenHeaders?.get('x-sovereign-plugin-id')).toBe('com.example.notes');
  });

  it('makes the plugin id available via getBackgroundPluginContext() during the handler, and clears it after', async () => {
    let seenDuring: string | undefined;
    const decl = jobDecl({
      pluginId: 'fs.sovereign.tasks',
      handler: async () => {
        seenDuring = getBackgroundPluginContext();
      },
    });

    expect(getBackgroundPluginContext()).toBeUndefined();
    await runClaimedJob(
      job({ pluginId: 'fs.sovereign.tasks' }),
      buildJobHandlerIndex([decl]),
      deps(),
    );
    expect(seenDuring).toBe('fs.sovereign.tasks');
    expect(getBackgroundPluginContext()).toBeUndefined();
  });

  it('forwards ctx.reportProgress to deps.reportProgress with the job id', async () => {
    const reportProgress = vi.fn(async () => undefined);
    const decl = jobDecl({
      handler: async (ctx) => {
        await ctx.reportProgress(50, 'halfway');
      },
    });
    await runClaimedJob(job(), buildJobHandlerIndex([decl]), deps({ reportProgress }));
    expect(reportProgress).toHaveBeenCalledWith('job-1', 50, 'halfway');
  });

  it('calls completeJobSuccess and never completeJobFailure on a successful handler', async () => {
    const completeJobSuccess = vi.fn(async () => undefined);
    const completeJobFailure = vi.fn(async (): Promise<CompleteJobFailureResult> => ({
      outcome: 'retrying',
    }));
    const decl = jobDecl();
    await runClaimedJob(
      job(),
      buildJobHandlerIndex([decl]),
      deps({ completeJobSuccess, completeJobFailure }),
    );
    expect(completeJobSuccess).toHaveBeenCalledTimes(1);
    expect(completeJobFailure).not.toHaveBeenCalled();
  });

  it('calls completeJobFailure but not recordJobFailure when the outcome is still retrying', async () => {
    const recordJobFailure = vi.fn(async () => undefined);
    const decl = jobDecl({
      handler: async () => {
        throw new Error('boom');
      },
    });
    await runClaimedJob(
      job(),
      buildJobHandlerIndex([decl]),
      deps({
        completeJobFailure: async () => ({ outcome: 'retrying' }),
        recordJobFailure,
      }),
    );
    expect(recordJobFailure).not.toHaveBeenCalled();
  });

  it.each(['failed', 'rescheduled'] as const)(
    'calls recordJobFailure when the outcome is %s',
    async (outcome) => {
      const recordJobFailure = vi.fn(async () => undefined);
      const decl = jobDecl({
        handler: async () => {
          throw new Error('boom');
        },
      });
      await runClaimedJob(
        job(),
        buildJobHandlerIndex([decl]),
        deps({
          completeJobFailure: async () => ({ outcome }),
          recordJobFailure,
        }),
      );
      expect(recordJobFailure).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'job-1' }),
        'boom',
      );
    },
  );

  it('fails (not throws) a job with no matching handler, without invoking any handler', async () => {
    const completeJobFailure = vi.fn(async (): Promise<CompleteJobFailureResult> => ({
      outcome: 'failed',
    }));
    const handler = vi.fn(async () => undefined);
    // Different type — index lookup misses.
    const decl = jobDecl({ type: 'other.type', handler });
    await expect(
      runClaimedJob(job(), buildJobHandlerIndex([decl]), deps({ completeJobFailure })),
    ).resolves.toBeUndefined();
    expect(handler).not.toHaveBeenCalled();
    expect(completeJobFailure).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'job-1' }),
      expect.stringContaining('no handler registered'),
    );
  });

  it('fails a job with malformed JSON payload without invoking the handler', async () => {
    const completeJobFailure = vi.fn(async (): Promise<CompleteJobFailureResult> => ({
      outcome: 'failed',
    }));
    const handler = vi.fn(async () => undefined);
    const decl = jobDecl({ handler });
    const badJob = job({ payload: '{not json' });
    await runClaimedJob(badJob, buildJobHandlerIndex([decl]), deps({ completeJobFailure }));
    expect(handler).not.toHaveBeenCalled();
    expect(completeJobFailure).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'job-1' }),
      expect.stringContaining('failed to parse job payload'),
    );
  });

  it('passes undefined payload through when payload is null', async () => {
    let seenPayload: unknown = 'not-yet-set';
    const decl = jobDecl({
      handler: async (_ctx, payload) => {
        seenPayload = payload;
      },
    });
    await runClaimedJob(job({ payload: null }), buildJobHandlerIndex([decl]), deps());
    expect(seenPayload).toBeUndefined();
  });
});

describe('tickOnce', () => {
  it('drains multiple due jobs in one tick until claimNextJob returns undefined', async () => {
    const queue = [job({ id: 'job-1' }), job({ id: 'job-2' }), job({ id: 'job-3' })];
    const claimNextJob = vi.fn(async () => queue.shift());
    const completeJobSuccess = vi.fn(async () => undefined);
    const decl = jobDecl();

    await tickOnce(buildJobHandlerIndex([decl]), deps({ claimNextJob, completeJobSuccess }));

    expect(claimNextJob).toHaveBeenCalledTimes(4); // 3 hits + 1 empty
    expect(completeJobSuccess).toHaveBeenCalledTimes(3);
  });

  it('passes disabledPluginIds and now through to claimNextJob', async () => {
    const claimNextJob = vi.fn(async () => undefined);
    await tickOnce(
      buildJobHandlerIndex([]),
      deps({
        claimNextJob,
        getDisabledIds: async () => ['com.example.bad'],
        now: () => 42,
      }),
    );
    expect(claimNextJob).toHaveBeenCalledWith({ disabledPluginIds: ['com.example.bad'], now: 42 });
  });

  it('skips the whole tick (never claims) when the disabled-plugin lookup fails', async () => {
    const claimNextJob = vi.fn(async () => undefined);
    await tickOnce(
      buildJobHandlerIndex([]),
      deps({
        claimNextJob,
        getDisabledIds: async () => {
          throw new Error('db down');
        },
      }),
    );
    expect(claimNextJob).not.toHaveBeenCalled();
  });

  it('caps draining at JOBS_PER_TICK (20) even with more jobs available', async () => {
    let remaining = 50;
    const claimNextJob = vi.fn(async () =>
      remaining-- > 0 ? job({ id: `job-${remaining}` }) : undefined,
    );
    const decl = jobDecl();
    await tickOnce(buildJobHandlerIndex([decl]), deps({ claimNextJob }));
    expect(claimNextJob).toHaveBeenCalledTimes(20);
  });
});

describe('startJobWorker / stopJobWorker', () => {
  it('ticks on the configured interval and stops cleanly', async () => {
    vi.useFakeTimers();
    const claimQueue = [job()];
    const claimNextJob = vi.fn(async () => claimQueue.shift());
    const decl = jobDecl();

    startJobWorker([decl], deps({ claimNextJob }), 1_000);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(claimNextJob).toHaveBeenCalled();

    const callsAtStop = claimNextJob.mock.calls.length;
    stopJobWorker();
    await vi.advanceTimersByTimeAsync(5_000);
    expect(claimNextJob).toHaveBeenCalledTimes(callsAtStop);
  });

  it('does not start when no job types are declared', async () => {
    vi.useFakeTimers();
    const claimNextJob = vi.fn(async () => undefined);
    startJobWorker([], deps({ claimNextJob }), 1_000);
    await vi.advanceTimersByTimeAsync(3_000);
    expect(claimNextJob).not.toHaveBeenCalled();
  });

  it('does not start when SOVEREIGN_JOB_WORKER_DISABLED is set', async () => {
    vi.useFakeTimers();
    process.env.SOVEREIGN_JOB_WORKER_DISABLED = '1';
    expect(jobWorkerDisabled()).toBe(true);

    const claimNextJob = vi.fn(async () => undefined);
    startJobWorker([jobDecl()], deps({ claimNextJob }), 1_000);
    await vi.advanceTimersByTimeAsync(3_000);
    expect(claimNextJob).not.toHaveBeenCalled();
  });
});

describe('requireJobsPluginContext', () => {
  it('throws when the plugin is not installed (no manifest)', () => {
    expect(() => requireJobsPluginContext('com.example.notes', undefined)).toThrow(/not installed/);
  });

  it('throws when the manifest lacks the jobs:write permission', () => {
    expect(() =>
      requireJobsPluginContext('com.example.notes', {
        id: 'com.example.notes',
        permissions: ['db:readWrite'],
      }),
    ).toThrow(/jobs:write/);
  });

  it('does not throw when the manifest declares jobs:write', () => {
    expect(() =>
      requireJobsPluginContext('com.example.notes', {
        id: 'com.example.notes',
        permissions: ['jobs:write'],
      }),
    ).not.toThrow();
  });
});
