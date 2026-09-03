---
rfc: 0048
title: Messages and notification detail
status: Implemented
date: June 2026
author: kasunben
scope: packages/db, packages/sdk, packages/manifest, runtime, plugins/inbox, plugins/console, docs; builds on RFC 0005, RFC 0015, RFC 0016, RFC 0034, RFC 0041, RFC 0046
incorporated_into_plan: 'Yes — epic task 4.4'
---

# RFC 0048 — Messages and Notification Detail

## Summary

Add a platform-owned **Message Inbox** and a full **Notification Detail** view.
Together they make Sovereign's user communication model explicit:

- **Notification** — short alert/delivery signal.
- **Notification detail** — full explanation of an alert when the alert itself
  needs more context.
- **Message** — durable communication object addressed to one or more users.
- **Message notification** — optional alert that points to a message.

This RFC does not replace the existing Notification Center. It extends it with a
clear boundary so notifications do not become an overloaded message store, and
messages do not have to misuse notification rows for durable communication.

## Motivation

The current Notification Center is intentionally simple: plugins and platform
code create short recipient-scoped notification rows; the bell shows unread
items; optional SSE/Redis transport delivers foreground updates; optional Web
Push delivers background alerts.

That works for event alerts, but two gaps have become clear:

1. Some notifications need a full explanation. A bell item or push payload is
   too small for admin notices, job failure reports, security explanations, or
   multi-step instructions.
2. Some platform and plugin flows need durable user communication. A message
   from an admin, an assistant-generated report, a shared document note, or a
   plugin-generated summary should live as a message with its own read/archive
   lifecycle, not as a long notification body.

Adding a message inbox also gives future collaboration features a safe base
without introducing arbitrary social messaging in the first version.

## Current state

- RFC 0015 implemented `notifications`, `notification_prefs`,
  `sdk.notifications.send()`, the bell panel, toasts, and admin broadcast.
- RFC 0016 added Web Push fan-out from notification creation.
- RFC 0034 added a broker abstraction for polling, in-process SSE, and Redis
  backed SSE.
- Notifications are currently title/body/url/category/icon plus read/dismiss
  state.
- Notification preferences are category-level. The current UI says muted
  categories are discarded, but the existing implementation still writes inbox
  rows and unread counts for muted categories; only Web Push respects muted
  categories.
- Plugin notification sends rely on a runtime-injected plugin ID header passed
  through SDK calls. The next implementation pass should harden source
  resolution and manifest permission enforcement.
- There is no durable message data model, message inbox UI, message SDK/API, or
  relationship between messages and notifications.

## Design principles

1. **Keep alerts lightweight.** Notifications stay compact and delivery-focused.
2. **Make durable communication explicit.** Messages get their own table,
   routes, UI, and lifecycle.
3. **One alert may point to one durable object.** A message can create a
   notification; the notification is not the message.
4. **Recipient state is per user.** Read/archive/delete is recipient-specific,
   even when one message has multiple recipients.
5. **Plugins do not read user inboxes.** Plugin SDK surfaces are send-only unless
   a later RFC creates a narrow, consented read model.
6. **Platform owns delivery policy.** Plugins request sends; the platform decides
   inbox persistence, toast, push, rate limits, mute behavior, and audit.
7. **No arbitrary user-to-user chat in v1.** Admin/platform/plugin messages are
   in scope; open-ended social messaging and replies are deferred.

## Proposed design

### 1. Notification detail

Extend notification rows so the bell, push payload, and full detail view have
separate content levels:

| Field            | Meaning                                                       |
| ---------------- | ------------------------------------------------------------- |
| `title`          | Short headline for bell, toast, push, and detail.             |
| `summary`        | Short preview for bell/toast/push.                            |
| `body`           | Optional full notification body for the detail view.          |
| `body_format`    | `plain` or `markdown`. Defaults to `plain`.                   |
| `action_url`     | Primary route/object the user should visit.                   |
| `detail_url`     | Platform-owned detail route. Usually derived, not user input. |
| `metadata`       | Small JSON object with source context, not arbitrary content. |
| `expires_at`     | Optional time after which the notification is hidden.         |
| `dedupe_key`     | Optional source-scoped key for coalescing repeated alerts.    |
| `priority`       | `low`, `normal`, `high`, or `security`.                       |
| `delivery_state` | Optional JSON summary of delivery attempts.                   |

Compatibility rule: existing `body` values migrate to `summary` when they are
short enough and remain usable as `body` for detail. Existing `url` migrates to
`action_url`.

The default generated detail URL is:

```text
/account/notifications/<notificationId>
```

The notification detail page shows:

- title, source, category, created time, and read state;
- full body rendered as plain text or safe markdown;
- source plugin/platform/admin label;
- primary action button when `action_url` exists;
- metadata rendered only for approved simple fields;
- mark read/unread, dismiss/archive controls.

Bell behavior:

- Bell panel shows title, summary preview, source, time, unread state.
- Clicking a notification opens `action_url` only when the notification is purely
  navigational and has no full `body`.
- Otherwise it opens the notification detail page.
- Toast and push use title + summary only.

### 2. Message inbox

Add a durable message model:

```text
messages
- id
- tenant_id
- sender_type: user | plugin | platform | admin
- sender_id
- sender_display
- subject
- body
- body_format: plain | markdown
- source_plugin_id
- source_ref_type
- source_ref_id
- created_at
- updated_at

message_recipients
- message_id
- tenant_id
- recipient_user_id
- delivered_at
- read_at
- archived_at
- deleted_at
```

`messages` stores the shared content. `message_recipients` stores per-recipient
state.

Initial sender rules:

| Sender type | v1 behavior                                                            |
| ----------- | ---------------------------------------------------------------------- |
| `platform`  | Internal platform notices and generated system messages.               |
| `admin`     | Console-authored messages to selected users or all users.              |
| `plugin`    | Plugin-authored messages gated by manifest permission.                 |
| `user`      | Reserved for future replies/user-to-user messaging; not exposed in v1. |

Message body format supports `plain` and safe `markdown`. HTML is not accepted
from plugins in v1.

### 3. Relationship between messages and notifications

Message creation may also create a notification:

```text
message created
  -> message row + recipient rows
  -> optional notification row per recipient
       category: message
       title: New message
       summary: subject or short preview
       action_url: /account/messages/<messageId>
       metadata: { messageId }
```

The message is the source of truth. Dismissing the notification does not archive
or delete the message. Reading the message should mark related message
notifications read when the notification metadata links to that message.

Not every message must notify. Senders can request `notify: false` for low-value
or bulk informational messages, subject to platform policy.

Not every notification has a message. A job-complete alert, failed export, or
security event can be a notification with optional detail body.

### 4. SDK surfaces

Add a message SDK surface:

```ts
await sdk.messages.send(
  {
    recipientUserIds: ['user_1'],
    subject: 'Your report is ready',
    body: 'The generated report is attached to this message.',
    bodyFormat: 'plain',
    notify: true,
    sourceRef: { type: 'report', id: reportId },
  },
  await headers(),
);
```

Manifest permission:

```jsonc
{
  "permissions": ["messages:send"],
}
```

Rules:

- `messages:send` permits plugin-authored messages to users.
- `notifications:send` remains the permission for notification-only alerts.
- A plugin with `messages:send` does not automatically get
  `notifications:send`; message notification fan-out is platform-owned.
- The runtime stamps sender identity from trusted request context.
- The runtime verifies the plugin manifest has `messages:send`.
- The runtime validates recipients are active users in the current tenant.
- Batch size is capped.
- Platform/admin sends use internal helpers, not public plugin SDK calls.

Extend notifications with a more explicit input shape:

```ts
await sdk.notifications.send(
  {
    recipientUserId,
    title: 'Export failed',
    summary: 'The CSV export could not be completed.',
    body: 'The export failed because the selected date range contains no rows.',
    bodyFormat: 'plain',
    actionUrl: '/example/exports',
    category: 'export',
    priority: 'normal',
    dedupeKey: `export:${exportId}`,
  },
  await headers(),
);
```

Existing fields remain accepted for compatibility:

- `body` as short body maps to `summary` when no `summary` is provided;
- `url` maps to `actionUrl`;
- `category` defaults to `info`;
- `bodyFormat` defaults to `plain`.

### 5. UI

**Implemented shape (workstream 0018 leg 1) — deviates from this section's
original draft.** Rather than nesting the list/detail UI under Account, it
ships as a new platform-type plugin, **`fs.sovereign.inbox`** (`/inbox`),
resolving Open Question 1 below as "yes, a first-class platform area."
Routes:

```text
/inbox                       (Tabs: Notifications | Messages, ?tab=-synced)
/inbox/<id>                  (notification detail)
/inbox/messages/<id>         (message detail)
```

Notification _preferences_ (push subscription, muted categories, poll
interval) stay exactly where they already lived — `/account/notifications`
— untouched and not duplicated into Inbox; the Notifications tab links
across to them instead. The existing bell remains in shell chrome, reached
the same way as before, now pointing at `/inbox`/`/inbox/<id>` instead of
navigating directly to `action_url` for every item. Full design rationale:
`docs/plugins/inbox.md`.

Inbox's Messages tab:

- inbox list with subject, sender, preview, time, unread state;
- filters: inbox, archived, unread;
- message detail view;
- mark read/unread;
- archive;
- soft delete for the current recipient;
- empty state.

Inbox's Notifications tab:

- fuller list than bell panel;
- an "Unread only" filter (client-side over up to 100 most recent rows —
  see `docs/plugins/inbox.md`'s Open Questions for the server-pagination
  tradeoff this accepts);
- notification detail view;
- mark read;
- dismiss.

Console:

- admin broadcast notification remains available at `/console/broadcast`;
- admin message compose added at `/console/messages`, for selected users or
  all active users;
- admin messages are audited (`logActivity`) — broadcast's own pre-existing
  audit gap is unrelated and untouched.

### 6. Preferences and delivery policy

Clarify notification preference semantics:

| Preference effect | Meaning                                                        |
| ----------------- | -------------------------------------------------------------- |
| `inbox`           | Whether matching notifications create visible inbox/bell rows. |
| `toast`           | Whether foreground toasts appear.                              |
| `push`            | Whether background push is sent.                               |
| `messageNotify`   | Whether new messages create notification alerts.               |

Security notifications cannot be fully muted. The platform may still suppress
toast/push for some security events if disclosure on a shared device is risky,
but the account inbox must retain them.

Muted categories should have one explicit behavior. This RFC recommends:

- muted notification categories do not create unread bell count, toast, or push;
- muted rows may still be stored as read/archived rows for auditability if the
  category is platform/admin/security;
- plugin `info` category rows may be dropped entirely when muted, subject to
  retention policy.

Message preferences are separate from notification preferences. A user may mute
message notifications while still keeping messages in the message inbox.

### 7. Authorization and abuse controls

Notification and message sends must be enforced at the runtime host boundary:

- resolve plugin identity from trusted runtime request context;
- reject missing/unknown plugin identity rather than using `unknown`;
- verify manifest permissions (`notifications:send`, `messages:send`);
- validate recipient user IDs against active tenant users;
- cap batch size;
- rate-limit per source plugin and per recipient;
- reject unsafe markdown or unsupported body formats;
- audit admin broadcasts and admin messages;
- optionally activity-log high-impact plugin sends.

Platform internal helpers can bypass plugin manifest permissions but must stamp
`sender_type`/`source_type` as `platform` or `admin`, never `plugin`.

### 8. Data model changes

Notification table additions:

| Column           | Type       | Notes                                             |
| ---------------- | ---------- | ------------------------------------------------- |
| `summary`        | text?      | Short preview.                                    |
| `body_format`    | string     | `plain` or `markdown`.                            |
| `action_url`     | text?      | Replaces `url` over time.                         |
| `metadata`       | json/text  | Small JSON object.                                |
| `expires_at`     | timestamp? | Optional expiry.                                  |
| `dedupe_key`     | string?    | Unique with tenant/source/recipient when present. |
| `priority`       | string     | `low`, `normal`, `high`, `security`.              |
| `delivery_state` | json/text  | Optional delivery attempt summary.                |

Keep existing `url` during migration or replace it with a compatibility view/API
field.

New message tables:

| Table                | Purpose                                       |
| -------------------- | --------------------------------------------- |
| `messages`           | Shared message content and sender metadata.   |
| `message_recipients` | Recipient-specific read/archive/delete state. |

Indexes:

- `message_recipients (tenant_id, recipient_user_id, deleted_at, archived_at)`;
- `message_recipients (tenant_id, recipient_user_id, read_at)`;
- `messages (tenant_id, created_at desc)`;
- optional unique dedupe index for notifications.

### 9. Portability and deletion

Messages and notifications participate in user data export/deletion:

- user export includes received messages, sent admin/user messages where
  applicable, and notification rows visible to the user;
- deleting a user removes recipient rows for that user;
- message content with no remaining recipients can be deleted unless retention
  policy says otherwise;
- admin/platform audit records should not include full message body unless
  explicitly needed;
- plugin source references are exported as inert metadata.

### 10. Out of scope

- End-to-end encrypted messaging.
- Replies and threaded conversations.
- Attachments.
- External email bridge.
- Cross-instance/federated messaging.
- Arbitrary user-to-user chat.
- Plugin access to read a user's whole message inbox.
- Rich HTML authoring.

## UI flows

### Plugin sends an alert

Plugin calls `sdk.notifications.send()` with title, summary, optional body, and
action URL. Runtime verifies permission, writes a notification row, applies
preference policy, then fans out through bell/toast/push as allowed.

If the notification has a full body, clicking it opens notification detail. If it
is action-only, clicking it opens the action URL.

### Plugin sends a message

Plugin calls `sdk.messages.send()` with recipients, subject, body, and
`notify: true`. Runtime verifies permission, writes one message row and recipient
rows, then creates message notifications if allowed by policy.

User sees a bell alert, opens it, lands on `/account/messages/<id>`, reads the
message, and the related notification is marked read.

### Admin sends a message

Admin opens Console, chooses users or all active users, writes a subject/body,
and sends. Runtime creates message rows, optionally notifies recipients, and
writes an activity log entry for accountability.

## Alternatives considered

### Store messages as notifications

Rejected. Messages need different lifecycle, recipient state, content length,
reply/attachment evolution path, export semantics, and source display.

### Make every notification a message

Rejected. Most notifications are short event alerts. Forcing every alert into
the message model adds noise and makes the message inbox less useful.

### Add only notification detail

Rejected. It solves long alerts but not durable communication. Plugins would
still misuse notification rows for messages.

### Add only message inbox

Rejected. Existing notifications still need detail pages and clarified
preference semantics.

## Open questions

1. **Route location:** ✅ **Resolved (workstream 0018 leg 1):** first-class
   platform area — a new `type: "platform"` plugin, `fs.sovereign.inbox`
   (`/inbox`), not nested under Account. Notification preferences stay at
   `/account/notifications`, untouched. See §5 and `docs/plugins/inbox.md`.
2. **Message replies:** ✅ **Resolved:** remain fully deferred — no `thread_id`
   reserved, per this repo's anti-speculative-design convention. Add it if
   and when replies are actually built.
3. **Message notifications:** ✅ **Resolved:** `notify` defaults to `true`
   when omitted from `sdk.messages.send()`.
4. **Mute semantics:** ✅ **Resolved:** implemented as a `sourceType`-keyed
   rule in `deliverNotification()` (`runtime/src/notification-delivery.ts`)
   — plugin-sourced + muted → dropped entirely; platform/admin-sourced +
   muted → stored silently (pre-dismissed, for audit); `security` is never
   mutable regardless of source. Flagged in that file's own doc comment as
   an interpretation of this RFC's prose, not verbatim text — the RFC never
   fully pinned down the `sourceType`-vs-`category` framing.
5. **Retention:** ✅ **Resolved for v1:** no scheduled expiry job.
   `expires_at` is a query-time filter only (hides expired notifications
   from list/count queries); messages have no automatic expiry at all —
   kept until the recipient deletes them or their account is deleted.
   Automatic retention policies remain a future addition if needed.
6. **Markdown:** ✅ **Resolved for v1:** `body_format: 'plain' | 'markdown'`
   is accepted and stored (schema forward-compatible), but both render as
   plain escaped text — no markdown-to-HTML pipeline exists anywhere in this
   repo, and adding a sanitizer dependency was out of scope for this leg.
7. **User senders:** ✅ **Resolved for v1:** not exposed via any UI or SDK
   surface — `sender_type: 'user'` stays reserved in the schema, unreachable
   until a future RFC actually designs user-to-user messaging.

## Adoption path

1. **RFC draft:** agree on message/notification boundaries, data model, and
   preference semantics.
2. **Notification hardening:** trusted plugin identity, manifest permission
   enforcement, category preference semantics, compatibility mapping for
   `body`/`url`.
3. **Notification detail:** schema additions, detail API, detail page, bell
   behavior update.
4. **Message inbox core:** message tables, account inbox/detail pages, internal
   platform/admin send helpers.
5. **Plugin SDK:** `messages:send`, `sdk.messages.send()`, recipient validation,
   rate limits, documentation.
6. **Admin compose:** Console UI for selected-user/all-user messages with
   activity logging.
7. **Portability:** export/import/delete participation.

## Package impact

| Package                 | Impact                                                                    |
| ----------------------- | ------------------------------------------------------------------------- |
| `@sovereignfs/db`       | New message tables; notification schema additions.                        |
| `@sovereignfs/sdk`      | New `sdk.messages`; expanded notification input types.                    |
| `@sovereignfs/manifest` | New `messages:send` permission.                                           |
| `runtime`               | APIs, notification-delivery mute-policy funnel, permission checks.        |
| `plugins/inbox`         | New platform plugin — notification list/detail and Message Inbox UI (§5). |
| `plugins/console`       | Admin message compose.                                                    |
| `docs`                  | Plugin development docs and upgrade notes.                                |
