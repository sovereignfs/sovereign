# Epic: Notification Center

> Per-user notification inbox, toasts, web push, and a pluggable transport layer so plugins can reach users across any delivery channel.

## Status

⏳ In Progress

## Overview

The Notification Center gives plugins a single `sdk.notifications.send()` call that fans out to the user's in-app inbox, a toast if they are active, and a background push notification if they have opted in. The first two tasks built the inbox, bell chrome, Toast primitive, admin broadcast, and VAPID-based web push. Epic task 4.3 replaces the polling SSE backend with a real event-driven broker — operators choose between in-process EventEmitter (zero infra) or Redis Pub/Sub (multi-process deployments).

## Tasks

#### ✅ 4.1 — Notification Center

**Goal:** A per-user notification inbox with a bell + panel, toasts, the `sdk.notifications` send surface, and admin broadcast.

**Deliverables:**

- Tenant-scoped `notifications` table (read/unread/dismiss) + notification prefs; clearly differentiated from the activity log
- Implement `sdk.notifications.send` (send-only for plugins; runtime injects source/tenant); platform-owned fan-out (inbox + toast if active)
- Bell + panel in chrome (sidebar/header, RFC 0011 icon, RFC 0013 Drawer on mobile) + a `Toast` primitive; `/api/account/notifications` routes
- Admin broadcast with guardrails (audited via RFC 0005, rate-limited, audience-scoped, user opt-out); admin-selectable transport (polling default / WebSocket) + per-user poll interval

**Dependencies:** Task 0.5.05 (`sdk.db`), Task 0.5.12 (audit), Task 0.5.17 (icons)

**SRS reference:** RFC 0015

**Review checklist:**

- A plugin send appears in the inbox + bell badge + a toast; an admin broadcast reaches all users and is audited; users can mute the announcement category

---

#### ✅ 4.2 — Web Push notifications

**Goal:** Background delivery of inbox notifications via Web Push (VAPID + service worker).

**Deliverables:**

- VAPID keys as optional no-default env secrets (push disabled when unset); a `customWorkerSrc` push/`notificationclick` handler; `push_subscriptions` table + helpers
- Account opt-in (permission + subscribe) with the iOS-installed-PWA caveat; `web-push` send on the RFC 0015 fan-out (subject to category prefs); prune on `410`
- Plugins never touch push — the platform fans out from the inbox

**Dependencies:** Task 1.0.04 (Notification Center)

**SRS reference:** RFC 0016

**Review checklist:**

- Enabling push delivers a background notification; an unsubscribed device gets none; secrets stay in env (push off when unset)

---

#### 📋 4.3 — Notification Center: pluggable pub/sub transport

**Goal:** Replace the Notification Center's DB-polling SSE backend with a real
event-driven pub/sub broker. Polling stays the default (`NOTIFICATION_TRANSPORT=polling`);
operators opt in to instant push delivery via `sse` (in-process EventEmitter, no new
infra) or `redis` (Redis Pub/Sub, for multi-process/clustered deployments). Resolves
RFC 0015's deferred transport decision.

**Deliverables:**

- `runtime/src/notification-broker.ts` — `NotificationBroker` interface + singleton
  `initBroker()` / `getBroker()` accessors.
- `runtime/src/brokers/in-process.ts` — `InProcessBroker` (Node.js `EventEmitter`,
  `setMaxListeners(0)`, no deps).
- `runtime/src/brokers/redis.ts` — `RedisBroker` (`ioredis` PUBLISH/SUBSCRIBE, two
  dedicated connections); loaded via dynamic `import()` so `ioredis` is truly optional.
- `ioredis` added as `optionalDependencies` in `runtime/package.json`.
- `runtime/instrumentation.ts` — `register()` reads `NOTIFICATION_TRANSPORT` and
  `REDIS_URL`, initialises broker, calls `broker.close()` on `SIGTERM`.
- `runtime/src/sdk-host.ts` — `notifications.send()` calls `broker.publish()` after DB
  write (no-op when broker is null / polling mode).
- `runtime/app/api/account/notifications/stream/route.ts` — rewired to subscribe to the
  broker; 503 when `NOTIFICATION_TRANSPORT=polling`; 25 s heartbeat comment line to beat
  proxy idle timeouts; `X-Accel-Buffering: no` header.
- `runtime/app/api/account/notifications/route.ts` — response gains `transport:
'polling' | 'sse'` field (Node.js runtime reads env at request time).
- `plugins/account` — bell component reads `transport` from initial fetch: in `sse`
  mode, connects `EventSource` instead of polling; three-error fallback to polling.
- `GET /api/admin/health` — `notifications: { transport, brokerConnected }` section.
- New env vars: `NOTIFICATION_TRANSPORT` (default `polling`), `REDIS_URL`, optional
  `NOTIFICATION_HEARTBEAT_INTERVAL` (default `25000`) — added to `.env.example` and
  `docs/self-hosting.md`.
- `docker-compose.prod.yml` — commented-out `redis` service block; commented
  `NOTIFICATION_TRANSPORT=redis` + `REDIS_URL` lines for operators to activate.
- `docs/self-hosting.md` — new "Notification transport" section (proxy config table for
  nginx / Caddy / Traefik / AWS ALB; SSE vs polling tradeoffs; Redis setup steps).
- Deprecates: RFC 0015's planned `notification_transport` key in `platform_settings`
  (never written; replaced by the env var).

**Root version bump:** root `package.json` — patch (one pre-v1 hardening task)

**Dependencies:** Task 0.7.01 (Notification Center — `sdk.notifications.send()` and the
existing SSE route shape this task rewires)

**SRS reference:** RFC 0034, RFC 0015 (open question 2 resolved)

**Review checklist:**

- `NOTIFICATION_TRANSPORT=polling` (default): SSE endpoint returns 503; bell polls at
  user's configured interval; behaviour identical to pre-RFC baseline
- `NOTIFICATION_TRANSPORT=sse`: `EventSource` connection opens; `sdk.notifications.send()`
  delivers notification to bell in < 1 s (no poll wait); multiple tabs all receive
- `NOTIFICATION_TRANSPORT=redis` + `REDIS_URL` set: cross-process delivery verified
  (send from process A, client on process B receives)
- `NOTIFICATION_TRANSPORT=redis`, Redis down: notification written to DB; SSE push
  degrades gracefully; health reports `brokerConnected: false`
- `GET /api/admin/health` returns correct `notifications.transport` and `brokerConnected`
- `pnpm format:check && pnpm lint && pnpm typecheck && pnpm test`

---

## Related RFCs

- [RFC 0015 — Notification Center](../rfcs/0015-notification-center.md)
- [RFC 0016 — Web Push](../rfcs/0016-web-push.md)
- [RFC 0034 — Notification transport](../rfcs/0034-notification-transport.md)

## Related Docs

- [self-hosting.md — VAPID and transport config](../self-hosting.md)
- [plugin-development.md — `sdk.notifications`](../plugin-development.md)
