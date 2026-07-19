---
rfc: 0034
title: Notification Center — Pluggable transport (pub/sub)
status: Implemented
date: June 2026
author: kasunben
scope: >
  runtime, packages/sdk, plugins/account, plugins/console,
  .env.example, docker-compose.yml, docker-compose.prod.yml, docs
incorporated_into_plan: 'Yes — epic task 4.3 (pre-v1)'
---

# RFC 0034 — Notification Center: Pluggable transport (pub/sub)

## Summary

The Notification Center shipped in Task 0.7.01 with a polling-based foreground
transport: the bell client fetches `/api/account/notifications` on a configurable
interval (default 30 s). An SSE endpoint (`/api/account/notifications/stream`) exists
but its backend is also a periodic DB read — it is not yet event-driven.

This RFC formalises a **`NotificationBroker` interface** that decouples notification
delivery from the transport mechanism. Three modes are available:

| Mode      | Backend                                | When to use                                                            |
| --------- | -------------------------------------- | ---------------------------------------------------------------------- |
| `polling` | Client polls DB endpoint               | Default. Zero extra infra. Works anywhere.                             |
| `sse`     | In-process `EventEmitter` + SSE stream | Single-process deployments wanting instant delivery. Zero extra infra. |
| `redis`   | Redis Pub/Sub + SSE stream             | Multi-process / clustered deployments. Requires `REDIS_URL`.           |

The mode is selected by the `NOTIFICATION_TRANSPORT` environment variable. Polling
remains the default — operators opt in to push delivery only when they have the right
infrastructure.

RFC 0015's open question 2 ("WebSocket vs SSE") is resolved here: **SSE wins**. All
notification traffic is server→client only; SSE (`EventSource`) is the lighter, more
widely proxy-compatible protocol. WebSocket requires an `Upgrade` handshake that many
reverse proxies reject by default; SSE is a plain HTTP response.

---

## Motivation

**Polling trades latency for simplicity.** A 30 s poll interval means a user waits up
to 30 s to see a notification in their bell. For an admin broadcast ("critical
maintenance in 10 minutes") or a time-sensitive plugin event, that lag is unacceptable.

**The SSE endpoint already exists** (`/api/account/notifications/stream`, Task 0.7.01)
but is backed by a per-request DB read, not a push event. The endpoint shape is correct;
what is missing is a real pub/sub layer behind it.

**Multi-process deployments break in-process push.** A single Node.js `EventEmitter`
can only notify clients connected to the same process. Operators running Sovereign
behind a load balancer (multiple runtime containers, PM2 cluster mode) need a
cross-process signal — Redis Pub/Sub is the standard solution.

The design constraint is **no new required infrastructure.** SSE mode adds no
dependencies beyond Node.js built-ins. Redis mode is available for operators who already
run Redis (or add it to their Compose stack) and need cross-process delivery; it is
never mandatory.

---

## Design

### Config

A single environment variable selects the mode at startup. The broker is initialised
once and is immutable for the lifetime of the process.

```
NOTIFICATION_TRANSPORT=polling|sse|redis   # default: polling
REDIS_URL=redis://localhost:6379            # required when NOTIFICATION_TRANSPORT=redis
```

The value is read in `runtime/instrumentation.ts` (`register()`) alongside the SDK host
initialisation. An invalid value logs a warning and falls back to `polling`.

**Why an env var, not a DB setting?**

RFC 0015 proposed a `platform_settings` key. That model works for settings that can be
toggled without a restart (e.g. `invite_only`). The broker cannot be hot-swapped — a
Redis client requires a network connection established at startup, and the `EventEmitter`
is a process-global singleton. An env var is the correct primitive for
infrastructure-level configuration that is set once per deployment and does not change
at runtime. Operators changing the transport must restart the runtime (same expectation
as changing a DB connection string).

**Deprecating the RFC 0015 `platform_settings` plan:** the `notification_transport` key
in `platform_settings` that RFC 0015 described is never written. The Console's
"Notification transport" UI is replaced by `NOTIFICATION_TRANSPORT` documentation in
`docs/self-hosting.md`.

---

### `NotificationBroker` interface

```ts
// runtime/src/notification-broker.ts

export interface NotificationPayload {
  notificationId: string;
  userId: string;
  title: string;
  body?: string;
  url?: string;
  category: string;
  source?: string;
}

export interface NotificationBroker {
  /**
   * Publish a notification to a user's delivery channel.
   * Called by sdk.notifications.send() in the SDK host.
   */
  publish(userId: string, payload: NotificationPayload): Promise<void>;

  /**
   * Subscribe a handler to receive notifications for a user.
   * Returns an unsubscribe function — call it when the SSE connection closes.
   */
  subscribe(userId: string, handler: (payload: NotificationPayload) => void): () => void;

  /** Release all resources (Redis connections, EventEmitter listeners). */
  close(): Promise<void>;
}
```

A module-level singleton holds the active broker:

```ts
// runtime/src/notification-broker.ts (continued)
let _broker: NotificationBroker | null = null;

export function initBroker(transport: string, redisUrl?: string): void { ... }
export function getBroker(): NotificationBroker | null { return _broker; }
```

---

### In-process broker (`sse` mode)

```ts
// runtime/src/brokers/in-process.ts
import { EventEmitter } from 'node:events';

export class InProcessBroker implements NotificationBroker {
  readonly #emitter = new EventEmitter();

  async publish(userId: string, payload: NotificationPayload): Promise<void> {
    this.#emitter.emit(`sv:notif:${userId}`, payload);
  }

  subscribe(userId: string, handler: (p: NotificationPayload) => void): () => void {
    this.#emitter.on(`sv:notif:${userId}`, handler);
    return () => this.#emitter.off(`sv:notif:${userId}`, handler);
  }

  async close(): Promise<void> {
    this.#emitter.removeAllListeners();
  }
}
```

Pure Node.js — no additional dependencies. Works for a single process (standalone mode,
`sv serve`, PM2 `exec_mode: fork`, single Docker container).

**Limitation:** if the runtime runs as more than one process (PM2 `cluster` mode,
multiple containers behind a load balancer), each process has its own `EventEmitter`.
A notification sent in process A is not delivered to a client connected to process B.
Use `redis` mode for those deployments.

---

### Redis broker (`redis` mode)

```ts
// runtime/src/brokers/redis.ts
import Redis from 'ioredis';

export class RedisBroker implements NotificationBroker {
  readonly #pub: Redis;
  readonly #sub: Redis;

  constructor(url: string) {
    this.#pub = new Redis(url, { lazyConnect: true });
    this.#sub = new Redis(url, { lazyConnect: true });
    // sub connection must be dedicated — SUBSCRIBE locks the connection
  }

  async publish(userId: string, payload: NotificationPayload): Promise<void> {
    await this.#pub.publish(`sv:notif:${userId}`, JSON.stringify(payload));
  }

  subscribe(userId: string, handler: (p: NotificationPayload) => void): () => void {
    const channel = `sv:notif:${userId}`;
    void this.#sub.subscribe(channel);
    const listener = (ch: string, msg: string) => {
      if (ch === channel) handler(JSON.parse(msg) as NotificationPayload);
    };
    this.#sub.on('message', listener);
    return () => {
      void this.#sub.unsubscribe(channel);
      this.#sub.off('message', listener);
    };
  }

  async close(): Promise<void> {
    await Promise.all([this.#pub.quit(), this.#sub.quit()]);
  }
}
```

**`ioredis`** is the chosen Redis client: battle-tested, ESM-compatible, active
maintenance, supports lazy connect (no crash if Redis is momentarily unavailable at
startup). Added as an **optional** runtime dependency (`optionalDependencies` in
`runtime/package.json`) so it does not inflate the bundle or fail `pnpm install` for
operators who never use `redis` mode. The `RedisBroker` module is loaded dynamically:

```ts
// runtime/src/notification-broker.ts
async function initRedisBroker(url: string): Promise<NotificationBroker> {
  const { RedisBroker } = await import('./brokers/redis.js');
  return new RedisBroker(url);
}
```

If `ioredis` is not installed and `NOTIFICATION_TRANSPORT=redis`, the runtime logs an
error and falls back to `polling` (with a loud warning in the startup log).

---

### Wiring `sdk.notifications.send()` to the broker

In `runtime/src/sdk-host.ts`, the `notifications.send()` implementation currently
writes to the DB and (for web push) calls `fanOutPushToUser`. This is extended to also
call `broker.publish()` when a broker is active:

```ts
// runtime/src/sdk-host.ts (notifications host)
async send(input, requestHeaders) {
  // 1. Write to DB (always — polling and sse/redis both read from DB on load)
  const notification = await insertNotification(pdb, { ...input, source, tenantId });

  // 2. Broker publish (no-op when getBroker() returns null / polling mode)
  const broker = getBroker();
  if (broker) {
    await broker.publish(input.userId, {
      notificationId: notification.id,
      userId: input.userId,
      title: input.title,
      body: input.body,
      url: input.url,
      category: input.category,
      source,
    });
  }

  // 3. Web Push fan-out (RFC 0016, unchanged)
  await fanOutPushToUser(input.userId, { ... });
}
```

DB write always happens regardless of transport mode — polling clients still read from
the DB; the broker is purely a signalling layer, not a store.

---

### SSE route — event-driven

The existing `GET /api/account/notifications/stream` route is rewritten to subscribe to
the broker instead of polling the DB:

```ts
// runtime/app/api/account/notifications/stream/route.ts
export async function GET(req: Request): Promise<Response> {
  const broker = getBroker();

  // Return 503 in polling mode — clients should not connect to this endpoint.
  if (!broker) {
    return new Response('Transport is polling; SSE unavailable.', { status: 503 });
  }

  const userId = req.headers.get('x-sovereign-user-id')!;
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      const send = (payload: NotificationPayload) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
      };

      const unsubscribe = broker.subscribe(userId, send);

      // Heartbeat every 25 s — keeps the connection alive through idle-timeout proxies
      // (standard timeout is 30 s; 25 s gives headroom).
      const heartbeat = setInterval(() => {
        controller.enqueue(encoder.encode(': heartbeat\n\n'));
      }, 25_000);

      req.signal.addEventListener('abort', () => {
        unsubscribe();
        clearInterval(heartbeat);
        controller.close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no', // disable nginx/Caddy response buffering
    },
  });
}
```

---

### Client-side transport switching

The bell component needs to know which mode to use without a `NEXT_PUBLIC_*` env var
(those are build-time inlined and don't reflect runtime config). The solution: the
existing `GET /api/account/notifications` response gains a `transport` field:

```ts
// GET /api/account/notifications response
{
  "notifications": [...],
  "unreadCount": 3,
  "transport": "polling" | "sse"   // never "redis" — client only sees "sse"
}
```

The runtime reads `NOTIFICATION_TRANSPORT` at request time (Node.js runtime, not Edge)
and adds `transport` to the response. The client reads it on first load and switches
behaviour:

**Polling mode (default):** component calls `setInterval(() => fetchNotifications(), pollInterval)` as today.

**SSE mode (sse or redis):**

```ts
// plugins/account/app/_components/NotificationBell.tsx (simplified)
useEffect(() => {
  if (transport !== 'sse') return; // polling handled elsewhere

  const es = new EventSource('/api/account/notifications/stream');

  es.onmessage = (event) => {
    const payload = JSON.parse(event.data) as NotificationPayload;
    // Append to notification list, increment unread badge, show toast
    addNotification(payload);
  };

  es.onerror = () => {
    // Reconnect is automatic via EventSource spec.
    // After 3 consecutive errors, fall back to polling at the user's interval.
  };

  return () => es.close();
}, [transport]);
```

`EventSource` reconnects automatically on transient network drops (exponential backoff
is built into the browser spec). The client does not need to implement reconnect logic
beyond the three-error fallback to polling.

---

### Reverse-proxy notes

SSE requires the proxy to forward long-lived HTTP responses without buffering. One-line
fixes for common proxies:

| Proxy   | Config                                                                     |
| ------- | -------------------------------------------------------------------------- |
| nginx   | `proxy_buffering off;` + `proxy_read_timeout 3600s;` in the upstream block |
| Caddy   | `flush_interval -1` in the `reverse_proxy` directive                       |
| Traefik | No action — unbuffered by default                                          |
| AWS ALB | Default idle timeout 60 s; set to ≥ 3600 s on the load balancer            |

These notes go in `docs/self-hosting.md` under a new "Notification transport" section.

---

### Initialisation in `runtime/instrumentation.ts`

```ts
// runtime/instrumentation.ts  register() function (Node.js only)
const transport = process.env.NOTIFICATION_TRANSPORT ?? 'polling';
const redisUrl = process.env.REDIS_URL;

if (transport === 'sse') {
  initBroker('sse');
  logger.info({ transport: 'sse' }, 'Notification broker: in-process SSE');
} else if (transport === 'redis') {
  if (!redisUrl) {
    logger.error('NOTIFICATION_TRANSPORT=redis requires REDIS_URL — falling back to polling');
  } else {
    await initBroker('redis', redisUrl);
    logger.info({ transport: 'redis' }, 'Notification broker: Redis Pub/Sub');
  }
} else {
  logger.info({ transport: 'polling' }, 'Notification broker: polling (default)');
}
```

`close()` is called in `register()`'s cleanup path when the process receives `SIGTERM`.

---

### `GET /api/admin/health` additions

The admin health route gains a `notifications` section:

```json
{
  "notifications": {
    "transport": "polling | sse | redis",
    "brokerConnected": true // false if redis connection failed
  }
}
```

---

### Docker Compose

`NOTIFICATION_TRANSPORT` is added to `.env.example` (commented, default `polling`) and
to `docker-compose.yml` + `docker-compose.prod.yml`. A new `redis` service is added to
`docker-compose.prod.yml` as an **opt-in commented block** — operators uncomment it and
set `NOTIFICATION_TRANSPORT=redis` + `REDIS_URL=redis://redis:6379` together.

---

## What does NOT change

- **The `notifications` DB table and schema** — unaffected. DB is the authoritative
  store regardless of transport.
- **`sdk.notifications.send()` call signature** — unchanged. Plugin code requires no
  modification.
- **Web Push** (RFC 0016) — unaffected. Push fan-out happens independently of the
  foreground transport.
- **Notification prefs** (mute categories, poll interval) — both remain. Poll interval
  is respected in `polling` mode and ignored in `sse`/`redis` mode.
- **Admin broadcast** — works in all three modes (write to DB + broker.publish for each
  recipient in `sse`/`redis` mode).

---

## Semver impact

| Package             | Bump  | Version        | Reason                                                                                                                                                  |
| ------------------- | ----- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `runtime`           | minor | current → next | Broker module; SSE route rewrite; `transport` field in notifications response; `NOTIFICATION_TRANSPORT` + `REDIS_URL` env vars; health report extension |
| `@sovereignfs/sdk`  | none  | —              | No public API change — `sdk.notifications.send()` is unchanged                                                                                          |
| Root `package.json` | patch | —              | One pre-v1 hardening task; slot in ROADMAP.md                                                                                                           |

`ioredis` is added as an `optionalDependency` of `runtime`. It does not appear in any
exported SDK types.

---

## Alternatives considered

### WebSocket instead of SSE

RFC 0015 named WebSocket as the push option. SSE is strictly better here: all
notification traffic is server→client only; bidirectionality adds handshake overhead and
a second connection per tab. SSE is plain HTTP (no protocol upgrade), works through
HTTP/2 multiplexing, and is supported natively by every modern browser and Node.js
`ReadableStream`. WebSocket is off the table.

### In-memory pub/sub without a broker abstraction

An `EventEmitter` singleton could be used directly without a `NotificationBroker`
interface. Rejected because the interface is what makes Redis substitution clean without
touching the SSE route or the SDK host. The abstraction cost (one interface, two small
classes) is low.

### Using a message queue (RabbitMQ, NATS, etc.)

More powerful than Redis Pub/Sub but operationally heavier. Sovereign's self-hosting
ethos pushes toward minimal dependencies. Redis already appears in the Sovereign stack
discussion (Session store, future cache) and is extremely common. A queue broker for
notifications in v1 would be over-engineered.

### BroadcastChannel (Node.js built-in, inter-process, same host)

`BroadcastChannel` in Node.js ≥ 18 is cross-thread within a single process (useful for
worker threads) but **not** cross-process. It would not help PM2 cluster mode or
multiple containers. It also does not work in Edge runtime. Rejected — same scope
limitation as `EventEmitter` but less familiar.

### Server-Sent Events via the `/api/account/notifications/stream` endpoint already shipped

The endpoint exists and the route shape is correct. This RFC adds the actual pub/sub
backend — the endpoint is not removed or replaced, only re-implemented to use the
broker instead of a DB poll.

---

## Open questions

1. **Redis connection failure handling.** If Redis becomes unavailable mid-session
   (broker.publish rejects), the runtime should log the error, degrade gracefully
   (notification written to DB; no SSE push for this event), and attempt to reconnect.
   `ioredis` handles reconnect automatically with exponential backoff. Should the health
   endpoint surface a "degraded" state? **Proposed:** yes — `brokerConnected: false`
   in the health report.

2. **Per-user EventEmitter listener cap.** Node.js emits a MaxListenersExceededWarning
   at 10 listeners per event. A busy instance with many concurrent active tabs for one
   user would hit this. **Proposed:** call `setMaxListeners(0)` (unlimited) on the
   shared emitter during initialisation; document the tradeoff (no cap means a leak
   could silently grow). Alternative: a `Map<userId, Set<handler>>` instead of
   EventEmitter avoids this entirely.

3. **SSE heartbeat interval.** 25 s is chosen to beat the common 30 s idle-timeout of
   reverse proxies. Some proxies (AWS ALB) default to 60 s — the heartbeat still keeps
   the connection alive. If operators use a proxy with a shorter idle timeout, they must
   either reconfigure the proxy or lower `NOTIFICATION_HEARTBEAT_INTERVAL` (a new
   optional env var, default 25 000 ms).

4. **Rate-limiting SSE connections.** A single user opening many tabs creates one
   broker subscription per tab. In-process broker: each subscription is an EventEmitter
   listener — cheap. Redis broker: each subscription calls `SUBSCRIBE` on the shared sub
   connection, which is fine (Redis channels are free until published to). No rate limit
   is proposed for v1; revisit if abuse is observed.

---

## Review checklist

```bash
# Polling mode (default) — no change from today
NOTIFICATION_TRANSPORT=polling pnpm dev
# SSE endpoint returns 503 when polled in polling mode
curl -i http://localhost:3000/api/account/notifications/stream  # → 503

# SSE mode
NOTIFICATION_TRANSPORT=sse pnpm dev
# SSE endpoint returns 200 text/event-stream
curl -N -H "Cookie: <session>" http://localhost:3000/api/account/notifications/stream
# sdk.notifications.send() → notification appears in bell within < 1 s (no poll wait)
# Multiple tabs: all tabs receive the notification simultaneously
# Process restart: clients reconnect automatically (EventSource reconnect)

# Redis mode
NOTIFICATION_TRANSPORT=redis REDIS_URL=redis://localhost:6379 pnpm dev
# Works as SSE mode above; cross-process delivery verified by starting two
# runtime processes on different ports and sending a notification from process A,
# verifying client on process B receives it

# Health
curl -H "x-sovereign-admin-key: ..." http://localhost:3000/api/admin/health | jq .notifications
# → { "transport": "sse", "brokerConnected": true }

# Redis mode, Redis down:
# → { "transport": "redis", "brokerConnected": false }
# Notification still written to DB; no SSE push (graceful degrade)

pnpm format:check && pnpm lint && pnpm typecheck && pnpm test
```

---

## Changelog

- **v0.1** (June 2026) — Initial draft. Resolves RFC 0015 open question 2 (SSE wins
  over WebSocket); formalises the `NotificationBroker` interface; specifies
  `InProcessBroker` (sse) and `RedisBroker` (redis) adapters; deprecates the RFC 0015
  `platform_settings` transport-key plan in favour of `NOTIFICATION_TRANSPORT` env var.
