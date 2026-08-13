import { requireHost } from './host';
import type { EnqueueJobInput, JobRef, ScheduleJobInput } from './types';

function getPluginId(headers?: Headers): string | null {
  return headers?.get('x-sovereign-plugin-id') ?? null;
}

function getUserId(headers?: Headers): string | null {
  return headers?.get('x-sovereign-user-id') ?? null;
}

/**
 * Background jobs and schedules SDK surface (RFC 0046).
 *
 * Requires the `jobs:write` manifest permission. `type` must match an entry
 * in the plugin manifest's `jobs` array — the handler itself is wired via
 * that manifest entry's `entry` module (default export), not a runtime
 * `register()` call, the same pattern `schedules` (RFC 0046 Phase 1) already
 * established: a job handler must be reachable without any HTTP request ever
 * having touched the plugin's routes, so it has to be in the runtime's build
 * graph from a manifest-declared, generate-time-composed entry file rather
 * than something a route module registers lazily on first load.
 *
 * `requestHeaders` is explicit (not read via `next/headers()`) so these
 * methods work both from a real request and from inside a job handler's own
 * `ctx.headers` — a handler can enqueue or schedule further jobs.
 *
 * @example
 * ```ts
 * await sdk.jobs.enqueue({ type: 'sync.remote', payload: { accountId } }, headers);
 * await sdk.jobs.schedule({ type: 'cleanup.expired', cron: '0 3 * * *' }, headers);
 * ```
 */
export const jobs = {
  async enqueue(input: EnqueueJobInput, requestHeaders?: Headers): Promise<JobRef> {
    const pluginId = getPluginId(requestHeaders) ?? 'unknown';
    const userId = getUserId(requestHeaders);
    return requireHost().jobs.enqueue(input, pluginId, userId);
  },

  async schedule(input: ScheduleJobInput, requestHeaders?: Headers): Promise<JobRef> {
    const pluginId = getPluginId(requestHeaders) ?? 'unknown';
    const userId = getUserId(requestHeaders);
    return requireHost().jobs.schedule(input, pluginId, userId);
  },

  /** Cancel one active job. Scoped to the calling plugin — returns `false` if not found/not active/not owned. */
  async cancel(id: string, requestHeaders?: Headers): Promise<boolean> {
    const pluginId = getPluginId(requestHeaders) ?? 'unknown';
    return requireHost().jobs.cancel(id, pluginId);
  },

  /** Read one job's current state. Scoped to the calling plugin — returns `null` if not found/not owned. */
  async get(id: string, requestHeaders?: Headers): Promise<JobRef | null> {
    const pluginId = getPluginId(requestHeaders) ?? 'unknown';
    return requireHost().jobs.get(id, pluginId);
  },
};
