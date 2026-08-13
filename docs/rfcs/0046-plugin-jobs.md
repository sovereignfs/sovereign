---
rfc: 0046
title: Plugin background jobs and schedules
status: Implemented
date: June 2026
author: kasunben
scope: packages/sdk, runtime, packages/db, packages/manifest, docs; builds on RFC 0005 and RFC 0015
incorporated_into_plan: 'Yes — epic task 3.16'
---

# RFC 0046 — Plugin Background Jobs and Schedules

## Summary

Add a platform-managed background job surface for plugins. Plugins can enqueue
one-off jobs, schedule recurring jobs, and report progress without depending on
a browser request staying open.

This unlocks recurring maintenance, imports, exports, cleanup, sync, report
generation, long-running model/tool runs, and periodic suggestions while keeping
execution visible to users and operators.

## Motivation

Some work should not run inside a page request: syncing remote data, sending
scheduled summaries, cleaning expired public shares, refreshing cached metadata,
processing uploads, or running a long task that should notify the user when
complete.

Without a platform job surface, plugins must rely on page loads, ad hoc timers,
or external cron jobs. That is unreliable and inconsistent across Docker,
non-Docker, and future desktop/mobile environments.

## Current state

- There is no `sdk.jobs` surface.
- Some startup tasks run in runtime instrumentation.
- Notifications can tell a user when something completes, but cannot schedule
  or run the work.
- Activity logging can record outcomes but does not execute work.

## Proposed design

**As shipped, this section's original sketch changed in two ways — see the
0.3 changelog entry for the reasoning:** `JobRef.status` gained a
`'scheduled'` state (recurring jobs waiting for their next occurrence,
distinct from a due `'queued'` job), and `sdk.jobs.register(type, handler)`
was **not** implemented as a call-based runtime API — handler wiring instead
reuses the manifest `entry`-file + generate-time-composition pattern
`schedules` (Phase 1) already established, resolving open question 1 below.
The sketch is left below for historical context; see
`docs/plugin-development.md`'s "`jobs` — background jobs" section for the
actual shipped surface and examples.

### SDK surface

```ts
interface JobRef {
  id: string;
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';
}

sdk.jobs.enqueue(input: {
  type: string;
  payload: unknown;
  runAt?: number;
  dedupeKey?: string;
}): Promise<JobRef>;

sdk.jobs.schedule(input: {
  type: string;
  payload: unknown;
  cron: string;
  timezone?: string;
  dedupeKey?: string;
}): Promise<JobRef>;

sdk.jobs.register(type: string, handler: JobHandler): void;
sdk.jobs.cancel(id: string): Promise<void>;
sdk.jobs.get(id: string): Promise<JobRef | null>;
```

Handlers run server-side in the runtime process. The runtime injects plugin ID,
tenant ID, and the initiating user ID when applicable.

### Job types

Job type names are plugin-local:

```text
sync.remote
send.summary
cleanup.expired
process.upload
```

The runtime namespaces them to `<pluginId>:<type>`.

### Persistence

Jobs are stored in platform tables:

```text
plugin_jobs
  id
  tenant_id
  plugin_id
  type
  status
  payload
  run_at
  cron nullable
  timezone nullable
  dedupe_key nullable
  attempts
  max_attempts
  last_error nullable
  created_by nullable
  created_at
  updated_at
```

Payloads must be JSON-serializable and small. Large inputs belong in
`sdk.storage` or plugin tables, referenced by ID.

### Execution model

Phase 1 supports a simple runtime worker loop:

- polls due jobs;
- claims one job with a DB update;
- runs the registered handler;
- records success/failure;
- retries with backoff up to `max_attempts`.

Multi-node safe claiming is required for Postgres. SQLite deployments run
single-node by design.

### Schedules

Recurring schedules use cron expressions plus timezone. The platform computes
the next run after each successful or failed attempt. Missed runs while the
instance is offline are not backfilled by default; the next due run is queued on
startup.

### User visibility

Jobs may be invisible maintenance work or user-visible runs.

User-visible jobs should:

- expose status in plugin UI;
- send a notification on completion/failure when appropriate;
- log a platform activity event for meaningful outcomes.

## Security requirements

- Jobs run as the plugin that registered the handler.
- Jobs cannot call handlers from another plugin.
- Payload size is capped.
- Failed jobs do not expose secrets in error messages.
- Disabled plugins do not run queued jobs.
- Uninstalled plugins leave jobs cancelled or archived.

## Alternatives considered

### External cron only

Rejected. It is operator-hostile and breaks plugin portability.

### Run background work in browser tabs

Rejected. Browser tabs close, sleep, and duplicate work across devices.

### Use notification transport as a job queue

Rejected. Notifications are delivery events, not durable job execution.

## Open questions

_Resolved — see the 0.3 changelog entry for the full implementation:_

1. **Should job handlers be registered through instrumentation-time imports or
   plugin route loading?** Instrumentation-time imports, same as `schedules`
   (Phase 1): a manifest `jobs[].entry` module, statically imported into
   `runtime/generated/plugin-jobs.ts` at generate time. A call-based
   `sdk.jobs.register()` was considered but rejected — there is no reliable
   moment for a plugin's own code to call it before the worker needs the
   handler, the same reason `schedules` didn't do this either.
2. **Should Phase 1 support progress events?** Yes — `ctx.reportProgress()`
   on `JobContext`, backed by a `progress`/`progress_message` column pair,
   readable via `sdk.jobs.get()`.
3. **Should job history have retention settings?** Not in this leg. Terminal
   job rows (`succeeded`/`failed`/`cancelled`) are retained indefinitely —
   no automatic pruning or TTL. Flagged as a known gap for a future task, not
   blocking: `getJobHealthSummary()`'s admin visibility only reads recent/
   active rows, so an unbounded `plugin_jobs` table doesn't degrade that path
   immediately, but a long-running instance will accumulate history with no
   built-in cleanup.
4. **Should schedules be disabled automatically when a plugin is paywalled for
   a user?** Not addressed. Neither `schedules` nor `jobs` execution checks
   plugin entitlement/paywall status — RFC 0003 monetization gates a
   plugin's _routes_, not its background execution. A job enqueued before a
   user's entitlement lapses still runs. Left as a known gap, not a decision
   to leave paywalled execution unrestricted forever.

## Adoption path

1. ✅ Add platform job tables and worker loop.
2. ✅ Add `sdk.jobs` surface (enqueue/schedule/cancel/get; handler wiring via
   manifest `entry`, not a call-based `register()` — see open question 1).
3. ✅ Add disabled-plugin and uninstall handling.
4. ✅ Add admin health visibility.
5. ✅ Document patterns for sync, cleanup, and user-visible jobs
   (`docs/plugin-development.md`).

## Changelog

| Version | Date        | Change                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ------- | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0.1     | June 2026   | Initial draft                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 0.2     | July 2026   | Phase 1 subset shipped: manifest-declared interval `schedules` (id / intervalMinutes / entry), an in-process runtime scheduler (60s tick, in-memory elapse tracking, disabled-plugin skip, error containment, `SOVEREIGN_SCHEDULER_DISABLED` kill-switch), and `ScheduleContext`/`ScheduleHandler` SDK types. No queue, persistence, retries, cron, or `sdk.jobs` API yet.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| 0.3     | August 2026 | Full `sdk.jobs` shipped (epic task 3.16, workstream 0015 leg 1) — coexists with, does not replace, the Phase 1 `schedules` mechanism above. Platform `plugin_jobs` table (SQLite + Postgres, full queued/scheduled/running/succeeded/failed/cancelled lifecycle, `packages/db/src/schema/{sqlite,postgres}/platform.ts`). `sdk.jobs.enqueue()`/`schedule()`/`cancel()`/`get()` (`packages/sdk/src/jobs.ts`), gated on a new `jobs:write` manifest permission and enforced host-side (`requireJobsPluginContext`, mirroring `requireCryptoPluginContext`). Manifest `jobs[]` declarations (`type`/`entry`/`maxAttempts`/`description`) composed into `runtime/generated/plugin-jobs.ts` by `scripts/generate-registry.ts`, the same static-import pattern as `schedules` (resolves open question 1). Runtime job worker (`runtime/src/jobs.ts`) ticks every 5s, claims up to 20 due jobs per tick via `claimNextJob()` — a single `UPDATE ... WHERE id IN (SELECT ... FOR UPDATE SKIP LOCKED) RETURNING ...` on Postgres (multi-node safe), a simpler `UPDATE ... WHERE id = (SELECT ...)` on SQLite (single-node by design, matching this RFC's original execution-model note) — then runs the manifest-declared handler. Exponential backoff retries (30s base, capped at 1h) up to a job's `maxAttempts`; a recurring job's exhausted-retries occurrence reschedules to its next `cron` run rather than dying permanently. `ctx.reportProgress()` (open question 2) persists to new `progress`/`progress_message` columns, readable via `sdk.jobs.get()`. `sv plugin remove` now calls `cancelJobsForPlugin()` unconditionally (jobs are platform-owned, unlike the isolated-DB drop it already did) — RFC 0046's "uninstalled plugins leave jobs cancelled" requirement. Admin health: `getJobHealthSummary()` (queued/scheduled/running counts, stuck-running detection at 30 min, failures in the last 24h) surfaced through `/api/admin/health`'s new `jobs` field and a Console → System health card. `SOVEREIGN_JOB_WORKER_DISABLED` kill-switch, separate from `SOVEREIGN_SCHEDULER_DISABLED`. Open questions 3 and 4 (retention settings; paywall-aware execution) remain unresolved — see their entries below for why neither blocks this leg. |
| 0.4     | August 2026 | Merged to `main` after rebasing onto webhooks (RFC 0050) and flow handoffs (RFC 0053), both landed first. `packages/db`'s new migration collided in number with those two RFCs' own migrations (both had claimed slot `0024`) — resolved by regenerating via `pnpm db:generate` against the merged schema rather than hand-editing the Drizzle snapshot. `packages/manifest`/`packages/sdk`/`packages/db`/`runtime` package versions, never bumped on the original branch despite each package's real API surface changing, were bumped for the first time at merge. See `docs/workstreams/0015-plugin-extensibility-surface.md`'s changelog entry 0.6 for the full reconciliation detail.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
