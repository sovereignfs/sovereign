---
rfc: 0045
title: Plugin events and realtime channels
status: Implemented
date: June 2026
author: kasunben
scope: packages/sdk, runtime, packages/manifest, docs; builds on RFC 0015 and RFC 0034
incorporated_into_plan: 'Yes — epic task 3.17'
---

# RFC 0045 — Plugin Events and Realtime Channels

## Summary

Implement `sdk.events` as a plugin-scoped publish/subscribe surface for
realtime UI synchronization. It is for low-latency application state updates:
list changes, presence, cursors, record edits, progress updates, and other
ephemeral events.

It is not a durable queue, not a notification inbox, and not an audit log.
Durable user-visible notifications remain `sdk.notifications`; audit remains
`sdk.activity`.

## Motivation

Several plugin classes need realtime coordination: shared lists, collaborative
canvases, progress indicators, live logs, presence, and collaborative editing.
Polling works for small cases but creates latency, duplicate fetches, and
inconsistent implementations.

The platform already has notification transport work for polling, SSE, and Redis
pub/sub. This RFC generalizes the realtime transport concept into a plugin SDK
surface while keeping delivery semantics intentionally modest.

## Current state

- `sdk.events` is reserved and throws `NotImplementedError`.
- Notification transport supports polling/SSE/Redis for notification delivery.
- There is no general plugin realtime channel.
- Plugins can build local polling routes, but there is no shared pattern.

## Proposed design

**As shipped, this section's `authorizeChannel` sketch changed — see the
0.2 changelog entry for the reasoning:** channel authorization is
manifest-declared (a new `events` manifest field, `entry` file default-
exporting an `EventChannelAuthorizer`) and composed at generate time, the
same pattern RFC 0046's `schedules`/`jobs` already use — not a call-based
`sdk.events.authorizeChannel()` registered at runtime. This resolves open
question 1 below. The sketch is left as originally written for historical
context; see `docs/plugin-development.md`'s "`events` — realtime channels"
section for the actual shipped surface and examples.

### SDK surface

```ts
interface EventEnvelope<T = unknown> {
  id: string;
  channel: string;
  type: string;
  payload: T;
  createdAt: number;
}

sdk.events.publish(input: {
  channel: string;
  type: string;
  payload: unknown;
}): Promise<void>;
```

Client subscription uses a runtime route rather than direct SDK call:

```text
GET /api/events/stream?pluginId=<id>&channel=<channel>
```

The route requires a session and checks that the current user may subscribe to
that channel.

### Channel naming

Channels are plugin-scoped:

```text
<pluginId>:<resource-kind>:<resource-id>
```

Plugins pass only the local channel part to the SDK:

```ts
await sdk.events.publish({
  channel: `list:${listId}`,
  type: 'item.checked',
  payload: { itemId },
});
```

The runtime prefixes the calling plugin ID and actor context.

### Authorization

Publishing requires `events:publish`. Subscribing requires `events:subscribe`.
The plugin must provide channel authorization metadata or a route-level check.

Phase 1 uses a plugin-owned authorization callback registered server-side:

```ts
sdk.events.authorizeChannel('list:*', async ({ userId, channel }) => {
  return userCanReadList(userId, channel.resourceId);
});
```

If no authorization callback is registered, subscription fails closed.

### Delivery semantics

Phase 1 semantics:

- best-effort delivery;
- no guaranteed ordering across processes;
- no replay after disconnect;
- bounded payload size;
- no durable persistence;
- clients reconnect and refetch state after reconnect.

Plugins must treat events as invalidation/update hints, not the sole source of
truth.

### Transport

The event broker can reuse the notification broker transport modes:

- in-process SSE for single-node deployments;
- Redis pub/sub for multi-process/multi-node deployments;
- polling fallback for environments where streaming is unavailable.

## Security requirements

- Session required for subscriptions.
- Channel authorization required for every subscription.
- Plugins cannot publish as another plugin.
- Payload size is capped.
- Event payloads are not written to activity logs by default.
- Events do not cross tenant boundaries.

## Alternatives considered

### Use notifications for realtime sync

Rejected. Notifications are durable, user-facing inbox items. Realtime sync
events are ephemeral and often too noisy for an inbox.

### Require each plugin to implement SSE

Rejected. It duplicates transport and Redis/pub-sub handling.

### Implement CRDT collaboration in the platform

Deferred. The platform should provide transport; plugins own their data model
and conflict-resolution semantics.

## Open questions

_Resolved — see the 0.2 changelog entry for the full implementation:_

1. **Should channel authorization be callback-based, manifest-declared, or
   route based?** Manifest-declared: an `events` field (`pattern`/`entry`/
   `description`), composed at generate time into
   `runtime/generated/plugin-events.ts`, the same static-import pattern RFC
   0046's `schedules`/`jobs` use. A call-based `sdk.events.authorizeChannel()`
   was considered but rejected for the same reason `schedules`/`jobs` didn't
   do this either — no reliable moment for plugin code to register a
   callback before the first subscribe request needs it.
2. **Should the platform offer short replay windows for reconnects?**
   Partially — `/api/events/poll` reads a small, bounded (50 events / 5
   minutes), **per-process, in-memory** ring buffer, not a true replay log.
   It exists primarily as the polling-fallback transport, but a reconnecting
   SSE client could also use it to catch up on very recent history. Not
   durable, not cross-process-consistent — see the ring buffer's own doc
   comment (`runtime/src/event-ring-buffer.ts`) and Delivery semantics above,
   which this doesn't change.
3. **Should event payload schemas be declared in manifests?** Not in this
   leg. Payloads are opaque `unknown` on both the publish and authorize
   sides, capped at 16 KB. Left as a possible follow-up if a real need for
   compile-time payload validation emerges.
4. **How should Redis transport be required in production multi-node
   deployments?** Same operator-facing shape as `NOTIFICATION_TRANSPORT`
   (RFC 0034) — a dedicated `SOVEREIGN_EVENTS_TRANSPORT` env var (`sse`
   default, `redis`, `polling`), reusing the existing `REDIS_URL` rather than
   a second connection string. Deliberately a _separate_ env var from
   `NOTIFICATION_TRANSPORT`, not a shared one — events and notifications
   scale differently and an operator may want to disable/resize one without
   touching the other.

## Adoption path

1. ✅ Add event broker abstraction using existing transport patterns
   (`runtime/src/event-broker.ts` + in-process/Redis implementations —
   structurally mirrors, but does not share code with, the notification
   broker; see its own doc comment for why they're kept separate).
2. ✅ Add `sdk.events.publish()` and the subscription route (plus
   `/api/events/poll` for the polling fallback — see open question 2).
3. ✅ Add channel authorization (manifest-declared, not a call-based API —
   see open question 1).
4. ✅ Add tests for authorization, disconnect/reconnect, and disabled
   plugins.
5. ✅ Document polling fallback and state-refetch requirements
   (`docs/plugin-development.md`).

## Changelog

| Version | Date        | Change                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0.1     | June 2026   | Initial draft                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| 0.2     | August 2026 | Full `sdk.events` shipped (epic task 3.17, workstream 0015 leg 2). Manifest `events` field (`pattern`/`entry`/`description`) composed by `scripts/generate-registry.ts` into `runtime/generated/plugin-events.ts`, resolving open question 1 — channel authorization is manifest-declared + generate-time static import, not a call-based `authorizeChannel()`. `sdk.events.publish()` (`packages/sdk/src/events.ts`), gated on a new `events:publish` manifest permission and enforced host-side (`requireEventsPluginContext`, `runtime/src/plugin-events.ts`, mirroring `plugin-mailer.ts`'s `requireMailerPluginContext`); payloads capped at 16 KB (`runtime/src/event-limits.ts`, `EventPayloadTooLargeError`). New, independent `runtime/src/event-broker.ts` (in-process EventEmitter + Redis pub/sub implementations, `SOVEREIGN_EVENTS_TRANSPORT` env var, reuses `REDIS_URL`) — deliberately not a shared instance with the notification broker (different keyspace, different payload shape, different security model; see that file's doc comment). `runtime/src/event-authorization.ts`'s `authorizeChannel()` matches a subscribing user's channel against every manifest-declared pattern for the target plugin (simple prefix match on a trailing `:*` wildcard, enforced at manifest-validation time), invokes each matching handler, and fails closed — no match, every match false, or every match throwing all deny; any one match returning `true` allows. `GET /api/events/stream` (SSE, `runtime/app/api/events/stream/route.ts`) and `GET /api/events/poll` (`.../poll/route.ts`) share one validation path (`runtime/src/event-subscribe-guard.ts`): session, `pluginId`/`channel` query params, target plugin installed + declares `events:subscribe` + not disabled, then channel authorization — polling is not a lesser-checked shortcut. `events` added to `RESERVED_API_SEGMENTS` (`runtime/src/api-namespace.ts`). Resolved open question 2 (replay windows) via a small bounded (50 events / 5 min), per-process, in-memory ring buffer (`runtime/src/event-ring-buffer.ts`) that backs `/api/events/poll` — explicitly not durable persistence, satisfying this RFC's "no durable persistence" requirement while still giving non-SSE clients something to read; idempotent on event id since the Redis broker's own publish echoes back through its subscription. Open question 3 (manifest-declared payload schemas) remains unresolved — payloads stay opaque `unknown`, capped by size only. |
