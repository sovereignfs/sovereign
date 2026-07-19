---
rfc: 0046
title: Plugin background jobs and schedules
status: Partially implemented (Phase 1 subset)
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

1. Should job handlers be registered through instrumentation-time imports or
   plugin route loading?
2. Should Phase 1 support progress events?
3. Should job history have retention settings?
4. Should schedules be disabled automatically when a plugin is paywalled for a
   user?

## Adoption path

1. Add platform job tables and worker loop.
2. Add `sdk.jobs` experimental surface.
3. Add disabled-plugin and uninstall handling.
4. Add admin health visibility.
5. Document patterns for sync, cleanup, and user-visible jobs.

## Changelog

| Version | Date      | Change                                                                                                                                                                                                                                                                                                                                                                     |
| ------- | --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0.1     | June 2026 | Initial draft                                                                                                                                                                                                                                                                                                                                                              |
| 0.2     | July 2026 | Phase 1 subset shipped: manifest-declared interval `schedules` (id / intervalMinutes / entry), an in-process runtime scheduler (60s tick, in-memory elapse tracking, disabled-plugin skip, error containment, `SOVEREIGN_SCHEDULER_DISABLED` kill-switch), and `ScheduleContext`/`ScheduleHandler` SDK types. No queue, persistence, retries, cron, or `sdk.jobs` API yet. |
