# RFC 0015 — Notification Center

**Status:** Accepted\
**Date:** June 2026\
**Author:** kasunben\
**Scope:** `packages/sdk` (`sdk.notifications`), `packages/manifest` (`notifications:send`), platform DB (`packages/db` — a new `notifications` table + notification prefs), runtime chrome + API routes, `packages/ui` (new `Toast` + popover/panel), Account (notification prefs), Console (admin broadcast), SRS; builds on RFC 0005 (activity log), RFC 0011 (icon system), RFC 0013 (mobile Drawer)\
**Incorporated into plan:** Yes — scheduled as roadmap Task 0.7.0; documentation-first. This RFC specifies the in-app notification system (data model, SDK surface, UI, delivery) and the end-to-end flows. SRS requirement IDs (proposed `NOTIF-*`), scheduling, and task allocation are deferred. **Web Push is a separate RFC 0016** that layers a background delivery channel on top of this one.

---

## Summary

Give Sovereign a **Notification Center**: a per-user, persistent place to see
everything that happened — a plugin finished a job, an admin posted an
announcement, the platform flagged a security event. The system has four parts:

- a tenant-scoped, per-user **inbox** (a `notifications` table) with
  read/unread/dismiss state;
- the fleshed-out **`sdk.notifications` write surface** (today a reserved
  `NotImplementedError` stub) that lets a plugin deliver a notification to a user;
- a **bell + panel** in the shell chrome (desktop sidebar, mobile header) showing
  an unread badge and the notification list;
- **toasts** — transient in-app pop-ups for notifications that arrive while the
  user is actively using the app.

**Core principle:** plugins never render UI or pick a delivery channel. A plugin
calls `sdk.notifications.send`; the **platform owns fan-out** — it always writes
the inbox row, shows a toast if the user is active, and (RFC 0016) sends a push if
they're subscribed and the category is allowed. Delivery policy, abuse limits, and
transport stay entirely platform-controlled.

This is the **in-app foundation** and is shippable on its own; Web Push (RFC 0016)
is optional and additive.

## Motivation

The notifications surface is **declared but unimplemented**:
`sdk.notifications.send(userId, message)` throws `NotImplementedError`
(`packages/sdk/src/unimplemented.ts:18–22`) and `notifications:send` is reserved in
the permission enum (`packages/manifest/src/schema.ts:15`, SRS §3.6). There is **no
data model, no UI, and no delivery** — a plugin that finishes a long task, or an
admin who needs to tell everyone about scheduled downtime, has no channel to the
user. A self-hosted workspace that holds someone's working life needs a single,
glanceable place for "what needs my attention."

## Relationship to the Activity Log (RFC 0005)

These are **separate systems** and must not be conflated:

| Aspect     | Activity Log (RFC 0005)                      | Notification Center (this RFC)                        |
| ---------- | -------------------------------------------- | ----------------------------------------------------- |
| Purpose    | Durable **audit trail** of what happened     | **Actionable alerts** directed _to_ a user            |
| Visibility | Derived by view (personal feed + admin-wide) | **Recipient-scoped** (the notification's target user) |
| Lifecycle  | **Append-only**, never mutated               | **Mutable** — read / dismissed by the user            |
| Dispatch   | None — read on demand                        | **Actively delivered** (badge, toast, later push)     |
| Shape      | actor/subject/action/target/metadata         | title / body / action URL / category / read state     |

They **intersect** in exactly one place: an admin broadcast (below) is **audited
into the activity log** for accountability. Otherwise the inbox is its own table
with its own lifecycle; this RFC deliberately does **not** reuse `activity_log`.

## Current state (what this builds on)

- **Reserved stub + permission** — `sdk.notifications.send(userId, message)`
  (`packages/sdk/src/unimplemented.ts:18–22`, exported via
  `packages/sdk/src/index.ts`); `notifications:send` in the enum
  (`packages/manifest/src/schema.ts:9–22`). This RFC implements that reserved
  surface, the same way RFC 0005 implements `sdk.activity`.
- **Chrome popover pattern** — `runtime/app/(platform)/_components/AccountMenu.tsx`
  is a keyboard-accessible popover (open state, `aria-expanded`, Esc, click-outside,
  `placement: 'sidebar' | 'header'`). The bell mirrors it.
- **Bell slot** — the shell renders a bottom `.chrome` group (Console gear +
  avatar) in the desktop sidebar and an avatar in the mobile header
  (`runtime/app/(platform)/layout.tsx:46–60`, `shell.module.css`).
- **No primitives yet** — `packages/ui` ships only Button/Input/Dialog; there is
  no Badge, Popover, or Toast. The bell icon comes from RFC 0011's `<Icon>`
  (`<Icon name="bell">`); the mobile panel can use RFC 0013's Drawer.
- **Platform settings + prefs patterns** — instance settings live in
  `platform_settings` (`invite_only`, `root_plugin_id`), read via
  `sdk.platform.getConfig()`; per-user prefs live in `account_prefs`. New
  notification settings follow these.

## Proposed design

### Data model

A tenant-scoped `notifications` table (dialect-aware int/bigint, the
`packages/db` schema/sqlite + schema/postgres + bootstrap-DDL + parity-test
pattern):

| Column              | Notes                                                                 |
| ------------------- | --------------------------------------------------------------------- |
| `id`                | ULID/uuid                                                             |
| `tenant_id`         | tenant scope (single-tenant default in v1)                            |
| `recipient_user_id` | who sees it                                                           |
| `source`            | the plugin id, or `platform`, or `admin`                              |
| `source_type`       | `plugin` \| `platform` \| `admin` (set by the runtime, not forgeable) |
| `title`             | short headline                                                        |
| `body`              | optional longer text                                                  |
| `url`               | optional action target (in-app route)                                 |
| `category`          | e.g. `info` \| `announcement` \| `security` (drives mute prefs)       |
| `icon`              | optional `<Icon>` name override                                       |
| `read_at`           | null until read                                                       |
| `dismissed_at`      | null until dismissed                                                  |
| `created_at`        | unix seconds                                                          |

Indexes: `(tenant_id, recipient_user_id, created_at)` and an unread lookup. A small
**notification prefs** store (per-category mute, e.g. mute `announcement`; plus the
per-user **poll interval**, see transport) — an `account_prefs` extension or a
`notification_prefs` table.

### SDK surface

Flesh out the reserved stub into a real, send-only surface:

```ts
sdk.notifications.send(
  recipientUserId: string,
  notification: { title: string; body?: string; url?: string; category?: string; icon?: string },
): Promise<void>;
```

The runtime injects `source` (the calling plugin's id), `source_type = 'plugin'`,
and `tenant_id` — a plugin cannot forge another source or impersonate `platform`/
`admin`. Gated by the existing **`notifications:send`** permission. **Send-only for
plugins:** reading, marking-read, and dismissing are platform UI concerns, not an
SDK surface in v1 (a plugin has no business reading a user's full inbox). Adoption
mirrors RFC 0005: the reserved stub becomes a real implementation as an **additive
minor** SDK + manifest bump, no breaking change.

The **runtime itself** emits notifications (e.g. a security notice) through an
internal helper — not via the public SDK.

### Delivery fan-out (platform-owned)

On every new notification the platform:

1. **writes the inbox row** (always);
2. emits a **toast** if the recipient is currently active in the app;
3. (RFC 0016) sends a **Web Push** if the recipient is subscribed and the
   category isn't muted.

The plugin/runtime caller does none of this routing — it only calls `send`.

### Foreground real-time transport — two implementations, admin-selectable

How the bell learns about a new notification while the app is open is configurable;
**both** transports are specified and shipped:

- **Polling** — the bell client polls the unread endpoint on an interval. Simple,
  no persistent connection, works behind any reverse proxy with zero extra config.
- **WebSocket** — a persistent server→client channel for instant delivery.
  (**SSE / `EventSource`** is noted as the lighter one-way alternative — the traffic
  is server→client only, so SSE may suffice; the implementation evaluates the
  tradeoff. WebSocket/SSE both require the reverse proxy to allow long-lived /
  upgrade connections.)

An **admin platform setting** — `notification_transport: 'polling' | 'websocket'`
in `platform_settings`, read via `sdk.platform.getConfig()` — selects the method
**instance-wide**, defaulting to **polling** (the safest choice for arbitrary
self-host networking). This follows the existing `invite_only` / `root_plugin_id`
settings pattern.

**Account setting — poll interval.** In polling mode, each user can set their
**poll interval** (e.g. 15 s / 30 s / 60 s, with a sensible minimum clamp) in the
Account notification prefs; the value is ignored when the admin has selected
WebSocket.

### UI — bell, panel, toast

- **Bell** — a new client component mirroring `AccountMenu`: on **desktop** it sits
  in the sidebar bottom `.chrome` between the Console gear and the avatar (popover
  opens up-and-right); on **mobile** it sits in the header next to the avatar. It
  renders `<Icon name="bell">` (RFC 0011) with an **unread badge**.
- **Panel** — the popover content: notifications grouped by unread/read, each
  linking to its `url`, with mark-read, dismiss, and mark-all-read. On small
  screens the panel is presented as a **Drawer** (RFC 0013) rather than a popover.
- **Toast** — a new `packages/ui` primitive: transient, auto-dismissing, stacking,
  rendered in an ARIA live region (`role="status"` / `aria-live="polite"`), tokens
  only (no hardcoded values). Proposed alongside a small reusable **Popover**
  primitive (or, if preferred, the bell reuses the `AccountMenu` pattern directly).
  Both are additive design-system additions.
- **API routes** under the reserved `account` segment (session-gated by the
  middleware-injected user headers): `GET /api/account/notifications` (list +
  unread count), `POST …/read`, `POST …/dismiss`.

### Admin broadcast

A Console action lets an admin post an **`announcement`**-category notification to
**every instance user** (creating one inbox row per recipient; toasts for the
active ones). Because this is the one capability that can reach everyone, it is
**guarded on all four axes**:

- **Audited** — each broadcast is recorded in the RFC 0005 activity log (who, when,
  audience, message) for accountability.
- **Rate-limited** — a cap on broadcast frequency so a careless or compromised
  admin can't spam every user repeatedly.
- **Audience-scoped** — admins target only their own instance's users, and only via
  this platform broadcast path; there is **no** API for an admin to inject an
  arbitrary per-user notification that impersonates a plugin or the platform.
- **User opt-out respected** — users may mute the announcement category, except a
  small reserved **critical-security** class that always delivers.

(Push delivery of broadcasts is extended in RFC 0016, under the same guardrails.)

## UI flows

**Plugin notifies a user** — plugin calls `sdk.notifications.send(userId, …)` → the
platform writes the inbox row → the bell's unread badge increments → if the user is
active, a toast appears → opening the bell shows the notification; clicking it
navigates to `url` and marks it read; the user can dismiss it.

**Admin broadcast** — admin opens Console → composes an announcement → confirms →
every user gets an `announcement` notification (audited to the activity log); active
users see a toast. A user who has muted announcements gets no toast/badge for it
(unless it's the reserved critical class).

**Transport selection** — admin sets `notification_transport` to `websocket` in
Console → clients receive notifications instantly; or leaves it `polling` (default)
→ each user's bell polls at their configured interval.

## Alternatives considered

1. **Ephemeral / client-only store** (local storage, session-scoped). Rejected —
   "show all my notifications" and cross-device unread state require server
   persistence.
2. **Reuse the `activity_log` table.** Rejected — different lifecycle (mutable vs
   append-only), visibility (recipient vs derived views), and shape. Conflating them
   would compromise both. They intersect only via broadcast auditing.
3. **A modal Dialog for the panel.** Rejected — a notification list is a glanceable,
   non-blocking surface; a popover (desktop) / Drawer (mobile) is correct, not a
   scrim-backed modal.
4. **Let plugins render toasts / manage delivery directly.** Rejected — that hands
   delivery policy and abuse control to untrusted plugin code. Plugins write to the
   inbox; the platform decides everything else.

## Open questions

1. **Retention** — auto-prune read/dismissed notifications after N days to bound
   table growth on long-lived instances, or keep everything?
2. **WebSocket vs SSE** — since traffic is server→client only, SSE may be the better
   "WebSocket" implementation; decide at build time (both are documented here).
3. **Poll-interval minimum** — the smallest interval a user may choose (server-side
   clamp) to bound load.
4. **Plugin targeting** — may a plugin notify **any** tenant user, or only users
   who have interacted with that plugin? (Tighter scoping reduces abuse.)
5. **Badge semantics** — unread count vs "has unread"; cap display at e.g. `9+`.
6. **Requirement IDs** — proposed `NOTIF-*` entries, not assigned in the SRS until
   accepted.

## Adoption path

1. **Documentation-first (this RFC).** Design + flows captured; no code, no SRS
   edits, no scheduling.
2. **When accepted & scheduled:** the `notifications` table + prefs, the
   `sdk.notifications.send` implementation (replacing the stub — additive minor SDK
   bump), the bell + panel + the new `Toast`/`Popover` primitives, the
   `account`-segment API routes, the admin broadcast + guardrails, and the
   admin-selectable transport (polling + WebSocket/SSE) with the per-user poll
   interval.
3. **RFC 0016 — Web Push** follows: background delivery of these same inbox
   notifications when the app isn't foregrounded.

## Changelog

| Version | Date     | Change                                                                                                                                                                                                                      |
| ------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0.1     | Jun 2026 | Initial draft; per-user inbox + `sdk.notifications` send surface + bell/panel/toast UI + admin broadcast (four guardrails) + admin-selectable polling/WebSocket transport; documentation-first, Web Push split to RFC 0016. |
| 0.2     | Jun 2026 | Accepted; scheduled in the roadmap as Task 0.7.0.                                                                                                                                                                           |
