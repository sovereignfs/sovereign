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

#### ✅ 4.3 — Notification Center: pluggable pub/sub transport

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

#### 📋 4.4 — Messages and notification detail (RFC 0048)

**Goal:** Add a durable platform Message Inbox and full notification detail views while keeping notifications as lightweight delivery signals.

**Deliverables:**

- Extend notification records with `summary`, full `body`, `body_format`, `action_url`, metadata, expiry, dedupe, and priority semantics.
- Add `/account/notifications` and `/account/notifications/<id>` views for full notification history and detail.
- Add `messages` and `message_recipients` tables with per-recipient read/archive/delete state.
- Add `/account/messages` and `/account/messages/<id>` views.
- Add `messages:send` manifest permission and `sdk.messages.send()` for plugin-authored messages.
- Add Console admin message compose for selected users or all active users.
- Clarify and implement preference semantics for inbox rows, toasts, push, and message-generated notifications.
- Harden notification/message sending at the runtime host boundary: trusted source resolution, manifest permission checks, recipient validation, batch caps, and rate limits.
- Add export/delete participation for messages and notification detail metadata.

**Dependencies:** Task 4.1 (Notification Center), Task 4.2 (Web Push), Task 4.3 (transport), Task 1.12 (user directory for recipient validation).

**SRS reference:** [RFC 0048](../rfcs/0048-messages-and-notification-detail.md)

**Review checklist:**

- A plugin message appears in the recipient's message inbox and optionally creates a bell notification.
- Reading a message marks related message notifications read without deleting the message.
- A long notification opens a full notification detail page; short action-only notifications can still deep-link directly.
- Muted category behavior is consistent across inbox count, toast, and push.
- A plugin without `messages:send` or `notifications:send` cannot send through the runtime host.

---

#### 📋 4.5 — Email channel for broadcasts and messages (RFC 0062)

**Goal:** Add email as an explicit, preference-aware delivery channel for platform broadcasts
and future durable messages without turning every notification into an email.

**Deliverables:**

- Extend the notification/message delivery model with explicit delivery-channel intent:
  `inbox`, `toast`, `push`, and `email`.
- Keep `sdk.notifications.send()` email delivery off by default. Existing plugin
  notifications must not start emailing users unless a sender explicitly opts into an email
  channel added by a future SDK minor version.
- Add optional email delivery for Console/API broadcasts, defaulting off until user/operator
  communication-email preferences exist.
- When RFC 0048 messages land, allow a message send to create inbox/message state plus optional
  bell, Web Push, and email delivery according to user preferences and sender policy.
- Extend Account notification preferences for communication email delivery; authentication and
  security emails remain outside user opt-out.
- Respect muted communication-email preferences while preserving mandatory account/security
  delivery semantics from task 1.14.
- Record delivery attempts through the RFC 0062 delivery log rather than storing email bodies on
  notification rows.
- Update `docs/plugin-development.md` to clarify that notifications are lightweight alerts and
  email is an explicit channel, not automatic fan-out.

**Version bumps:** `runtime` → minor, `plugins/account` → minor, `plugins/console` → minor,
`@sovereignfs/sdk` → minor if the notification/message send input gains an email-channel option.

**Dependencies:** Task 4.1 (Notification Center), Task 4.2 (Web Push), Task 4.4 (messages for the
message-email branch), Task 1.14 (shared email delivery wrapper and delivery log).

**SRS reference:** [RFC 0062](../rfcs/0062-email-delivery-coverage.md), [RFC 0048](../rfcs/0048-messages-and-notification-detail.md)

**Review checklist:**

- Existing plugin notifications do not send email by default.
- Admin broadcast can optionally send email to users who allow communication email.
- Muted communication-email preferences suppress optional broadcast/message email but not
  authentication or security emails.
- Message-created email delivery uses message state as the durable object; notification rows stay
  lightweight.
- Email delivery attempts are logged without storing bodies or tokens.
- `pnpm format:check && pnpm lint && pnpm typecheck && pnpm test`

---

#### ✅ 4.6 — Web push delivery status logging

**Goal:** Make Web Push delivery outcomes (skipped/failed) observable in Console and
Account Activities, mirroring the delivery-log pattern RFC 0062 established for email,
instead of the current logger-only trail.

**Deliverables:**

- `push_delivery_log` table (`packages/db`) — one row per send attempt: id, userId,
  endpoint host (never the full per-device capability URL), status
  (`skipped | sent | failed | pruned`), errorCode, category, source, createdAt. Mirrors
  the shape of `email_delivery_log` (`packages/db/src/platform-db.ts:2190-2290`,
  `recordEmailDelivery`).
- `runtime/src/push.ts` — `fanOutPushToUser` / `fanOutPushToUsers` / `sendOne` call a new
  `recordPushDelivery` helper alongside every existing `logger.info`/`logger.warn` call
  (VAPID unset, category muted, no subscriptions, pruned, send failed), so nothing is
  logger-only.
- Non-`sent` outcomes also call `logActivity` (`runtime/src/activity.ts`), matching
  `logDeliveryOutcome` in `runtime/src/platform-email.ts:64-82` — `action:
'push.delivery_failed'`, `subjectUserId`, `visibility: 'user'` when a recipient is
  known, summary without the raw endpoint.
- Surfaces in the existing Console (`plugins/console/app/activity/page.tsx`) and Account
  (`plugins/account/app/activity/page.tsx`) Activities feeds — no new page.

**Dependencies:** Task 4.2 (Web Push notifications)

**SRS reference:** RFC 0016 (extends); delivery-log shape follows RFC 0062's precedent

**Review checklist:**

- A push skipped for "no subscriptions", "category muted", or "VAPID unset" appears in
  the recipient's Account Activities feed (and Console's admin feed) with no raw endpoint
  or subscription secret in the summary/metadata.
- A real send failure (e.g. non-410/404 error from the push service) is recorded the same
  way; a `410`/`404` prune is recorded as `pruned`, not `failed`.
- A successful send is recorded in `push_delivery_log` but does not spam Activities (only
  non-`sent` outcomes call `logActivity`, matching the email pattern).
- `pnpm format:check && pnpm lint && pnpm typecheck && pnpm test`

---

#### 📋 4.7 — Native mobile push relay (APNs/FCM)

> **New in [RFC 0087](../rfcs/0087-sovereign-relay.md).** Covers this
> monorepo's half of native mobile push: the device-token schema, the
> registration/revocation API, extending `fanOutPushToUser`'s existing
> fan-out with an encrypted-relay delivery branch, and the new
> `apps/relay` service. The `sovereign-mobile` client-side half
> (registration flow, on-device encryption, iOS Notification Service
> Extension) is tracked in that repo's own epic 20, task 20.5 — see this
> monorepo's [docs/epics/mobile.md](mobile.md#-205--native-push-notifications-apnsfcm),
> rescoped alongside this task. Sequenced by
> [workstream 0005](../workstreams/0005-native-push-relay.md).

**Goal:** Let a self-hosted instance deliver a notification to a user's
`sovereign-mobile` native app even when it's fully closed, without any
instance ever exposing notification content to `sovereignfs`'s
infrastructure — see [Research 0010](../research/0010-native-mobile-push-notifications.md)
for why a relay is unavoidable (APNs/FCM credentials are tied to one app
identity, not to individual self-hosted instances) and why it must be
end-to-end encrypted (the Nextcloud/Matrix/Home Assistant/Bitwarden
precedent this design follows).

**Deliverables:**

- `push_device_tokens` table (`packages/db`, both SQLite and Postgres
  dialects): `userId`, `platform`, `deviceToken`, `publicKey`, `relayUrl`,
  `createdAt`, `lastUsedAt`.
- `POST /api/account/push-device-token` / `DELETE /api/account/push-device-token/:id`
  — registration and revocation, mirroring the existing
  `/api/account/push-subscription` route's shape and auth handling.
- `runtime/src/push.ts`'s `fanOutPushToUser` extended with a second
  delivery branch: encrypt the payload against the recipient device's
  stored public key (ECDH P-256 + HKDF + AES-256-GCM — see RFC 0087's
  "Encryption" section), POST to the device's stored `relayUrl`. Runs
  inside the same `Promise.allSettled` fan-out already there, alongside
  the existing Web Push branch.
- New `apps/relay` service (minimal Next.js app, following
  `apps/auth`'s existing code precedent, but a deliberately different
  deployment shape — see RFC 0087's "Deployment topology"): `POST /v1/push`
  (validates a per-instance API key, forwards the already-encrypted payload
  to APNs or FCM using `sovereignfs`'s own credentials, reports
  delivery/invalid-token outcomes for pruning) and `POST /v1/enroll`
  (one-time, issues an instance's API key). Holds the real Apple/Firebase
  credentials and nothing else sensitive — no payload inspection, no
  content logging, no persistent notification history.
- `apps/relay/Dockerfile` (own image, matching `apps/auth/Dockerfile`'s
  standalone-Next.js pattern) and a `sovereign-relay` entry in
  `.github/workflows/publish-images.yml`'s GHCR matrix. **Explicitly not**
  added to `docker-compose.yml`/`docker-compose.prod.yml` — those model the
  per-instance stack every operator runs, and the relay is a shared,
  centrally-operated service almost no operator deploys themselves (see RFC
  0087's "Deployment topology").
- Instance-level Console setting (backed by an env var default) for the
  configured relay URL, shipping with a default that points at
  `sovereignfs`'s relay (`relay.sovereign.openfs.io`), overridable, and with
  a distinct full opt-out toggle — see RFC 0087's "Deployment topology."
- Docs: `self-hosting.md` (the relay-URL env var/default and the opt-out
  toggle), and the operator-facing deployment playbook in the external
  `sovereign-infra` (public template) and `openfs-infra` (private
  production) repos — both already document a generic "Adding a New App"
  flow that `apps/relay` follows.

**Dependencies:** Task 4.2 (Web Push notifications) — this reuses its
crypto approach; RFC 0087.

**SRS reference:** RFC 0087

**Review checklist:**

- A registered native device receives a real push when the app is fully
  closed (not just backgrounded), verified against a real device or
  simulator/emulator with real APNs/FCM sandbox credentials, not just unit
  tests.
- `apps/relay` never has access to plaintext notification content —
  verified by inspecting what it actually receives and logs, not just
  reading the code that's supposed to prevent it.
- A user with a browser tab, a PWA, and the native app installed
  simultaneously gets the notification delivered independently to all
  three.
- Revoking a device (sign-out, instance removal, explicit opt-out) stops
  further pushes to it, verified end-to-end, not just that the DB row is
  deleted.
- A device token the relay reports as invalid gets pruned from
  `push_device_tokens`, mirroring how `push_subscriptions` already prunes
  on a 410/404.
- Changing an instance's configured relay URL in Console takes effect for
  newly registered devices without requiring a restart.
- `pnpm format:check && pnpm lint && pnpm typecheck && pnpm test`

---

## Related RFCs

- [RFC 0015 — Notification Center](../rfcs/0015-notification-center.md)
- [RFC 0016 — Web Push](../rfcs/0016-web-push.md)
- [RFC 0034 — Notification transport](../rfcs/0034-notification-transport.md)
- [RFC 0048 — Messages and notification detail](../rfcs/0048-messages-and-notification-detail.md)
- [RFC 0062 — Email delivery coverage](../rfcs/0062-email-delivery-coverage.md)
- [RFC 0087 — Sovereign Relay (native push notifications & WebRTC signaling)](../rfcs/0087-sovereign-relay.md)

## Related Docs

- [self-hosting.md — VAPID and transport config](../self-hosting.md)
- [plugin-development.md — `sdk.notifications`](../plugin-development.md)
