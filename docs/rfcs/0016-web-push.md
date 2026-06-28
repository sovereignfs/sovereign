# RFC 0016 — Web Push notifications

**Status:** Implemented\
**Date:** June 2026\
**Author:** kasunben\
**Scope:** `runtime/next.config.ts` + a new `runtime/worker/` (service-worker push handler), platform DB (`packages/db` — a new `push_subscriptions` table + helpers), runtime API routes + the `web-push` dependency, `runtime/public/manifest.json`, `.env.example` + `docs/self-hosting.md` (VAPID keys), Account (enable-push toggle), Console (broadcast push), SRS; **builds on RFC 0015** (Notification Center) and RFC 0001 / PLT-09 (PWA)\
**Incorporated into plan:** Yes — scheduled as roadmap Task 0.7.1; documentation-first. This RFC specifies the Web Push delivery channel and the end-to-end flows; SRS requirement IDs (proposed `NOTIF-*` / `PUSH-*`), scheduling, and task allocation are deferred.

---

## Summary

Add **Web Push** so a user receives notifications even when the Sovereign tab is
closed or backgrounded — the natural completion of the PWA story (PLT-09). Push is
a **delivery channel**, not a new notification concept: it transports the same
inbox notifications defined in **RFC 0015**. The pieces are standard and the
codebase is ready for all of them:

- **VAPID keys** as optional, no-default env secrets (push is disabled when unset);
- a **service-worker** `push` + `notificationclick` handler injected via
  `@ducanh2912/next-pwa`'s `customWorkerSrc`;
- a **`push_subscriptions`** table (one row per device/endpoint);
- a **browser permission + subscription flow** in Account;
- **server-side send** via the `web-push` library on the RFC 0015 fan-out.

**Plugins never touch push.** They call `sdk.notifications.send` (RFC 0015); the
platform decides whether a given recipient also gets a push. This keeps transport,
secrets, and abuse limits entirely platform-controlled.

## Motivation

RFC 0015 delivers notifications **in-app** (badge + toast) — but only while a tab
is open. The whole point of an installable PWA (PLT-09) is that it behaves like an
app, and apps notify you when they're closed. Without push, a self-hosted user must
keep a tab open to learn that a long job finished or an admin posted downtime. Push
closes that gap using web standards, with **no external service** and **no
telemetry** — consistent with Sovereign's positioning.

## Relationship to RFC 0015

RFC 0015 is the **source of truth** (the inbox) and the **send API** plugins use.
This RFC adds **one more branch** to RFC 0015's platform-owned fan-out: after
writing the inbox row (and a toast if active), the platform also pushes to the
recipient's subscribed devices when the category isn't muted. No new SDK surface,
no new plugin permission — push is a platform capability.

## Current state / feasibility (verified)

- **Custom SW injection exists.** `@ducanh2912/next-pwa@10.2.9` supports
  **`customWorkerSrc`** (default dir `worker/`), which compiles custom
  service-worker code into the generated `sw.js` at build — so a hand-written push
  handler **survives Workbox regeneration**. Today `runtime/next.config.ts` sets
  `dest`/`disable`/`register`/`reloadOnOnline`/`fallbacks` but **no** custom worker;
  this RFC adds one. (SW stays disabled in dev, so push is a production-build
  concern — like installability.)
- **CSP already allows it.** `runtime/src/security.ts` emits `worker-src 'self'`;
  the same-origin SW registration passes. WebAuthn-style API (`PushManager`,
  `Notification`) isn't governed by `connect-src`. No CSP change needed.
- **No `web-push` dependency yet.** It is pure-Node (no native bindings), so it is
  traced into the standalone output with **zero Dockerfile changes** (just a new
  entry in `runtime/package.json`).
- **Secret pattern established.** `apps/auth/src/env.ts` validates required secrets
  with no defaults (`AUTH_SECRET`, `SOVEREIGN_ADMIN_KEY`); VAPID keys follow the
  same discipline (as **optional** — see below).
- **Table + parity pattern.** New platform tables follow `packages/db`'s
  schema/sqlite + schema/postgres + bootstrap DDL, guarded by the schema-parity
  test; new env vars are enforced by the docs-parity / env-parity tests.

## Proposed design

### VAPID keys (optional, no-default secrets)

Two env vars — **`VAPID_PUBLIC_KEY`** and **`VAPID_PRIVATE_KEY`** (generated via
`npx web-push generate-vapid-keys`). They are **optional**: when **unset, Web Push
is disabled** (the Account toggle hides itself, the platform fan-out skips the push
branch). This honours "no secrets with defaults" — there is no fallback key — while
keeping push **opt-in** for self-hosters who don't want it. Validation is
**both-or-neither**: if exactly one is set, the runtime fails loudly at startup.
The public key is sent to the client for subscription; the private key signs sends
server-side and never leaves the server.

### Service worker (`push` + `notificationclick`)

A committed `runtime/worker/*.ts` provides:

- a **`push`** handler — parse the payload (title/body/url/icon from the RFC 0015
  notification) and `showNotification`;
- a **`notificationclick`** handler — focus an existing client or open the
  notification's `url`.

It is wired via `customWorkerSrc` in `runtime/next.config.ts`. This is the **one
place** custom SW code lives; it is compiled into `sw.js` each build and therefore
is _not_ part of the gitignored generated bundle — the source file is committed,
the compiled output is not.

### Subscription store

A `push_subscriptions` table (dialect schema + bootstrap + parity pattern):
`id`, `user_id`, `tenant_id`, `endpoint` (unique), `p256dh`, `auth`, `created_at`,
`updated_at`. `packages/db` helpers: save/upsert by endpoint, list-by-user, delete.
A send that returns **`410 Gone`** (or `404`) prunes the dead subscription.

### Client flow (Account)

Account gains an **"Enable notifications on this device"** control:

1. request `Notification` permission;
2. `navigator.serviceWorker.ready` → `PushManager.subscribe({ userVisibleOnly: true,
applicationServerKey: <VAPID public key> })`;
3. `POST /api/account/push/subscribe` with the subscription JSON → stored.

An unsubscribe path removes the local subscription and deletes the stored row.
**iOS Safari constraint (stated plainly):** Web Push is delivered only to an
**installed** PWA (Add to Home Screen) on iOS 16.4+, not to the browser tab — the
UI should explain this so iOS users install first.

### Server-side send

On the RFC 0015 fan-out, after the inbox row is written, the platform looks up the
recipient's `push_subscriptions` and sends each via **`web-push`**, signed with the
VAPID private key, **subject to the user's category mute prefs**. **Admin
broadcasts** (RFC 0015) fan out to push under the **same four guardrails** — audited
to the activity log, rate-limited, audience-scoped, user-opt-out respected (except
the reserved critical-security class).

### Configuration & Docker

- Add **`web-push`** to `runtime/package.json` (pure-Node; standalone trace handles
  the rest — no Dockerfile change).
- Add `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` to **both** compose files and
  `.env.example`, and document them in `docs/self-hosting.md` (the env-parity test
  enforces this).
- Optionally add a `badges` icon to `runtime/public/manifest.json` for nicer
  notification badging.

## UI flows

**Enable push** — Account → "Enable notifications on this device" → browser
permission prompt → subscribed; the device now receives background notifications.
(On iOS, the control explains the app must be installed first.)

**Background delivery** — a plugin (or admin broadcast) creates a notification while
the user's app is closed → the platform sends Web Push to the user's subscribed
devices → the OS shows it → tapping it opens the notification's `url` in Sovereign.

**Disable / cleanup** — the user toggles push off (subscription removed); a stale
endpoint that returns `410` is pruned automatically on the next send.

## Alternatives considered

1. **Legacy GCM (`gcm_sender_id` in the manifest).** Rejected — VAPID is the
   modern, provider-agnostic Web Push standard supported across current browsers; no
   Google project required.
2. **A third-party push service (OneSignal, Firebase, etc.).** Rejected — an
   external dependency that sees user notifications, contrary to self-host +
   no-telemetry. VAPID + `web-push` keeps everything on the instance.
3. **A plugin-level push permission / direct plugin push.** Rejected — push is
   platform-managed; plugins only write to the inbox (RFC 0015) and the platform
   decides delivery. No new permission is introduced.
4. **Required VAPID keys.** Rejected — push is opt-in; optional-with-both-or-neither
   keeps "no secrets with defaults" without forcing every self-hoster to configure
   push.

## Open questions

1. **VAPID key rotation** — procedure and what happens to existing subscriptions
   when keys rotate (re-subscribe flow).
2. **Per-category push prefs** — granularity beyond the RFC 0015 mute (e.g.
   push for `security` only, in-app for the rest).
3. **App icon badge** — use `navigator.setAppBadge` for an unread count on the
   installed icon?
4. **Notification grouping/collapsing** — tag/replace strategy to avoid flooding the
   OS tray.
5. **Requirement IDs** — proposed `NOTIF-*` / `PUSH-*` entries, deferred until
   accepted.

## Adoption path

1. **Documentation-first (this RFC).** Design + flows captured; no code, no SRS
   edits, no scheduling.
2. **When accepted & scheduled (after RFC 0015):** the `customWorkerSrc` push
   handler, the `push_subscriptions` table + helpers, the Account
   subscribe/unsubscribe flow + API routes, the `web-push` send on the RFC 0015
   fan-out (incl. admin broadcasts), VAPID env wiring + docs, and the manifest
   badge.

## Changelog

| Version | Date     | Change                                                                                                                                                                                                                                  |
| ------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0.1     | Jun 2026 | Initial draft; Web Push as a background delivery channel for RFC 0015 inbox notifications — VAPID optional secrets, `customWorkerSrc` SW handler, `push_subscriptions` store, Account opt-in, platform-owned send; documentation-first. |
| 0.2     | Jun 2026 | Accepted; scheduled in the roadmap as Task 0.7.1.                                                                                                                                                                                       |
