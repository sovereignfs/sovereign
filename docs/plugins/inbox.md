# Inbox

**Version:** 0.1\
**Date:** September 2026\
**Author:** kasunben\
**Purpose:** Canonical specification for the Sovereign Inbox plugin — the single source of truth for its manifest, access model, functional requirements, data model, and build plan.\
**Status:** v0.1 implemented (workstream 0018 leg 1, epic task 4.4) — notification list/detail and Message Inbox (RFC 0048)

---

Inbox is the personal notification-and-message reading surface for every
authenticated Sovereign user. It hosts the fuller notification list and
detail pages the bell only summarizes, and the durable Message Inbox RFC
0048 introduces — messages from admins and apps that persist independently
of the lightweight notification alerts that may accompany them.

The plugin ships in the monorepo (`type: platform`) and is accessible at
`/inbox`. It is reached via the shell bell icon (not a Launcher tile or
sidebar plugin icon — `CHROME_PLUGIN_IDS`), the same chrome-affordance
pattern as gear→Console and avatar→Account. Notification _preferences_
(push subscription, muted categories, poll interval) are **not** part of
this plugin — they stay at `/account/notifications`, unchanged; Inbox links
across to them rather than duplicating them.

## Contents

- [Identity and manifest](#identity-and-manifest)
- [Access control](#access-control)
- [Functional requirements](#functional-requirements)
- [Directory structure](#directory-structure)
- [Data model](#data-model)
- [SDK dependencies](#sdk-dependencies)
- [UI](#ui)
- [Build plan](#build-plan)
- [Open questions](#open-questions)
- [Changelog](#changelog)

---

## Identity and manifest

| Property                           | Value                          |
| ---------------------------------- | ------------------------------ |
| `id`                               | `fs.sovereign.inbox`           |
| `name`                             | `Inbox`                        |
| `type`                             | `platform`                     |
| `runtime`                          | `native`                       |
| `routePrefix`                      | `/inbox`                       |
| `shell`                            | `default`                      |
| `adminOnly`                        | omitted (`false`)              |
| `icon`                             | `icon.svg`                     |
| `permissions`                      | `auth:session`, `db:readWrite` |
| `compatibility.minPlatformVersion` | `0.119.0`                      |

```json
{
  "schemaVersion": 1,
  "id": "fs.sovereign.inbox",
  "name": "Inbox",
  "version": "0.1.0",
  "description": "Your notifications and messages — alerts from apps and admins, and durable messages you can read, archive, or delete.",
  "type": "platform",
  "runtime": "native",
  "routePrefix": "/inbox",
  "shell": "default",
  "icon": "icon.svg",
  "permissions": ["auth:session", "db:readWrite"],
  "compatibility": {
    "minPlatformVersion": "0.119.0"
  }
}
```

No `repository` field — platform plugins live in the monorepo.

`shell: "default"` (a full page, not a dialog) was chosen over Account's
`overlay` because Inbox is a list+detail app that can grow long (a full
notification/message history), unlike Account's compact settings form.

---

## Access control

Inbox is available to all authenticated users. There is no admin-only gate.

Data is strictly per-user: a user only ever sees their own notifications and
their own recipient state on messages addressed to them. There is no
cross-user data in this plugin — even a message with many recipients only
ever exposes the calling user's own read/archive/delete state for it, never
another recipient's.

Console's admin message compose (`/console/messages`) is a separate,
admin-gated surface — see [`docs/plugin-development.md`](../plugin-development.md)'s
`messages` section and `docs/rfcs/0048-messages-and-notification-detail.md`.

---

## Functional requirements

### v0.1 — Core (RFC 0048)

| ID     | Requirement                                                                                                                                                                                            |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| INB-01 | View a fuller notification list than the bell panel, with an "Unread only" filter.                                                                                                                     |
| INB-02 | Open a notification with a full `body` at its own detail page (`/inbox/<id>`); an action-only notification (no `body`) still deep-links straight to `actionUrl`, both from the list and from the bell. |
| INB-03 | Mark a notification read and dismiss it, from both the list and the detail page.                                                                                                                       |
| INB-04 | View the Message Inbox, filtered by Inbox / Archived / Unread, paginated.                                                                                                                              |
| INB-05 | Open a message at its own detail page (`/inbox/messages/<id>`); opening auto-marks it read and clears any notification linked to it (`dedupeKey: message:<id>`).                                       |
| INB-06 | Mark a message read/unread, archive/unarchive it, and soft-delete it (with a confirm step) — all scoped to the calling user's own recipient state.                                                     |
| INB-07 | Link across to `/account/notifications` for notification preferences (push, muted categories, poll interval) — not reimplemented here.                                                                 |

---

## Directory structure

Inbox lives in the monorepo under `plugins/inbox/`. It has no `db/`
directory — it reads/writes the platform's own `notifications`/`messages`/
`message_recipients` tables (owned by `@sovereignfs/db`, not this plugin)
through dedicated runtime API routes, the same boundary every non-Console
platform plugin uses (`runtime/src` internals are off-limits to plugin code
— see `docs/architecture-rules.md`'s SDK boundary rule).

```
plugins/inbox/
├── manifest.json
├── icon.svg                          # Inbox tray icon
└── app/
    ├── page.tsx                      # Tabs shell: Notifications | Messages
    ├── inbox.module.css
    ├── _components/
    │   ├── InboxTabs.tsx              # ?tab= query-synced Tabs (mirrors Warden's SettingsView pattern)
    │   ├── NotificationsTab.tsx       # List + "Unread only" filter
    │   ├── MessagesTab.tsx            # List + Inbox/Archived/Unread filter + pagination
    │   ├── NotificationDetailActions.tsx
    │   └── MessageDetailActions.tsx
    ├── [id]/
    │   └── page.tsx                   # Notification detail
    └── messages/
        └── [id]/
            └── page.tsx               # Message detail
```

Backing runtime routes (not plugin-owned, but exist specifically for this
plugin's UI — see `runtime/src/api-namespace.ts`'s `RESERVED_API_SEGMENTS`,
which reserves the `inbox` segment):

- `GET /api/account/notifications` / `POST .../notifications` (list + bulk
  actions) — pre-existing, reused as-is; only the detail route below is new.
- `GET /api/account/notifications/[id]` — notification detail (new).
- `GET /api/inbox/messages` — message list, filter + offset pagination (new).
- `GET /api/inbox/messages/[id]` (auto-marks read) / `POST .../[id]`
  (`unread`/`archive`/`unarchive`/`delete`) — message detail + actions (new).

---

## Data model

Inbox owns no tables of its own. It reads/writes the platform's shared
`notifications`, `messages`, and `message_recipients` tables (RFC 0015 /
RFC 0048) via `@sovereignfs/db`, exactly as `runtime/app/api/account/notifications/route.ts`
already does for the bell. See `docs/rfcs/0048-messages-and-notification-detail.md`
§8 for the full column reference.

---

## SDK dependencies

| SDK surface | Used for                                                | Available from |
| ----------- | ------------------------------------------------------- | -------------- |
| `sdk.auth`  | Current user session (`requireSession()` on every page) | Task 0.4.2     |

Inbox's own pages never call `sdk.notifications`/`sdk.messages` — those are
the plugin-facing, permission-gated send/read surfaces every _other_ plugin
uses. As the platform's own first-party reading UI (the same role the bell
and Console's Broadcast page already play), Inbox reaches the backing
runtime routes above directly, the same boundary Console's `users/actions.ts`
uses for its own platform-internal calls.

---

## UI

Inbox consumes `@sovereignfs/ui` exclusively: `PageContainer`, `PageHeader`,
`Tabs`, `Button`, `EmptyState`, `Spinner`.

**Layout:** a single top-level page (`/inbox`) with two `Tabs` (Notifications
default, Messages), `?tab=` query-synced via `router.replace` — the exact
pattern `plugins/warden/app/_components/SettingsView.tsx` already
established for a consolidated settings surface. No `NavList` rail — two
tabs don't warrant one. Detail pages (`/inbox/[id]`, `/inbox/messages/[id]`)
are separate routes, not nested inside the tab shell, each with a "‹ Inbox"
back link.

**Body rendering:** notification/message `body` is always rendered as plain
React text content, **never** `dangerouslySetInnerHTML` — no
markdown-to-HTML pipeline exists anywhere in this repo yet, so
`bodyFormat: 'markdown'` is accepted and stored but rendered identically to
`'plain'` in v1 (see the RFC's own open question 6).

---

## Build plan

One milestone — the whole plugin shipped in a single leg.

### v0.1 — Core (INB-01–07)

**Done when:** a plugin or admin send creates a bell alert that routes to
`/inbox/[id]` when it has a body or straight to `actionUrl` when it doesn't;
a message send lands in Inbox's Messages tab; opening a message marks it
read and clears its linked notification; archive/unarchive/delete and
notification mark-read/dismiss all work from both the list and detail
views; muted-category behavior is consistent across inbox/toast/push
(inherited from `deliverNotification()`, `runtime/src/notification-delivery.ts`).

---

## Open questions

1. **Should Inbox appear as an ordinary Launcher tile in addition to the
   bell?** Currently chrome-only (`CHROME_PLUGIN_IDS`), matching Console and
   Account. Revisit if user testing shows the bell alone isn't discoverable
   enough.
2. **Server-side pagination for the Notifications tab.** Messages get real
   offset pagination; notifications currently fetch up to 100 most recent
   rows and filter client-side ("Unread only"), matching the bell's own
   bounded-recency model. Revisit if notification volume per user grows
   enough that 100 rows stops being enough.

---

## Changelog

| Version | Date      | Change                                                                                                      |
| ------- | --------- | ----------------------------------------------------------------------------------------------------------- |
| 0.1     | Sept 2026 | Initial implementation (workstream 0018 leg 1, epic task 4.4) — notification list/detail and Message Inbox. |
