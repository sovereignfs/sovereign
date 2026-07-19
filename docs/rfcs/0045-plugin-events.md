---
rfc: 0045
title: Plugin events and realtime channels
status: Draft
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

1. Should channel authorization be callback-based, manifest-declared, or route
   based?
2. Should the platform offer short replay windows for reconnects?
3. Should event payload schemas be declared in manifests?
4. How should Redis transport be required in production multi-node deployments?

## Adoption path

1. Add event broker abstraction using existing transport patterns.
2. Add `sdk.events.publish()` and subscription route.
3. Add channel authorization API.
4. Add tests for authorization, disconnect/reconnect, and disabled plugins.
5. Document polling fallback and state-refetch requirements.

## Changelog

| Version | Date      | Change        |
| ------- | --------- | ------------- |
| 0.1     | June 2026 | Initial draft |
