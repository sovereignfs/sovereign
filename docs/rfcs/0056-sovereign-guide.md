---
rfc: 0056
title: Sovereign Guide — first-run guide platform plugin
status: Draft
date: June 2026
author: kasunben
scope: >
  plugins/guide (new), runtime launcher visibility, packages/db, packages/sdk,
  packages/manifest, docs; builds on RFC 0021, RFC 0022, RFC 0039
incorporated_into_plan: 'No — documentation-first. This RFC defines the product and implementation direction for a platform guide plugin; scheduling and task IDs are deferred.'
---

# RFC 0056 — Sovereign Guide

## Summary

Add **Sovereign Guide**, a platform plugin that helps users understand their
Sovereign instance after first login. The plugin explains the instance model,
core apps/plugins, privacy expectations, self-hosting concepts, and next actions
in a short, task-oriented guide.

Guide is not a marketing page and not a docs-site replacement. It is an
in-product orientation surface. Each user can complete or hide it for
themselves; hiding Guide should not disable the plugin for other users or remove
operator access to update guide content.

## Motivation

Sovereign has several concepts that are clear to contributors but not obvious to
new instance users:

- an instance is self-hosted and controlled by its operator;
- plugins are installed applications inside one workspace;
- Account controls personal profile, security, preferences, and data rights;
- Console is admin/owner-only;
- Launcher is the user's app grid;
- public docs live outside the product, but users should not need to read them
  before they can orient themselves.

Without an in-product guide, the first user experience depends on external docs,
operator explanation, or trial and error. A small platform plugin gives every
instance a consistent default orientation path while preserving user control:
once a user has seen enough, they can hide it for themselves.

## Current State

- Launcher exists as the default root plugin and shows installed, enabled,
  non-chrome plugins.
- Account contains per-user preferences and sidebar/plugin visibility controls.
- Console is admin-only and manages platform/plugin settings.
- Platform roles and plugin capabilities exist, so Guide can show admin-only
  sections only to users who can act on them.
- Instance identity exists, so guide copy can use the configured instance name
  instead of hardcoding "Sovereign" everywhere.
- There is no dedicated in-product onboarding or help plugin.

## Proposed Design

### Product Shape

Guide ships as a platform plugin:

```text
plugins/guide/
├── manifest.json
├── icon.svg
├── package.json
├── app/
│   ├── page.tsx                 # guide home / checklist
│   ├── basics/page.tsx          # instance, plugins, data model
│   ├── account/page.tsx         # profile, security, preferences, data rights
│   ├── admin/page.tsx           # Console/operator guide; gated by role
│   └── _components/
└── db/
    └── schema.ts
```

Suggested manifest:

```jsonc
{
  "schemaVersion": 1,
  "id": "fs.sovereign.guide",
  "name": "Guide",
  "version": "0.1.0",
  "description": "An in-product guide for getting started with Sovereign.",
  "type": "platform",
  "runtime": "native",
  "routePrefix": "/guide",
  "shell": "default",
  "database": "isolated",
  "permissions": ["auth:session", "db:readWrite"],
  "capabilities": {
    "manage-content": {
      "description": "Edit instance-specific guide content.",
      "defaultGrant": "none",
    },
  },
  "compatibility": {
    "minPlatformVersion": "0.10.0",
  },
}
```

Guide should be intentionally lightweight. Phase 1 can ship with platform-owned
static content and per-user state only. Operator-editable guide content is a
later enhancement.

The plugin should be implemented as part of the platform, not as a third-party
proposal, because it describes platform concepts and needs tight integration with
Launcher, Account, role checks, and instance identity.

### Per-User Visibility

Guide is globally installed/enabled like other platform plugins, but visibility
is per user.

The user can:

- mark the guide complete;
- hide the guide without completing every step;
- reopen it later from a stable help path or Launcher affordance if available.

Guide dismissal must not:

- disable the plugin globally;
- hide Guide for other users;
- erase progress state;
- require admin privileges.

This is guide-specific visibility, not a general plugin uninstallation feature.
It may reuse existing user plugin/sidebar preference infrastructure where
appropriate, but the product rule is per-user dismissal.

### Guide Sections

Phase 1 sections:

| Section       | Audience           | Purpose                                                         |
| ------------- | ------------------ | --------------------------------------------------------------- |
| Welcome       | all users          | Explain the instance, privacy posture, and plugin workspace.    |
| Launcher      | all users          | Explain app grid, installed plugins, and opening apps.          |
| Account       | all users          | Profile, password/security, preferences, data export/delete.    |
| Notifications | all users          | How in-app and web-push notifications behave when available.    |
| Admin Basics  | admins/owners only | Console, user management, plugin management, instance settings. |
| Self-hosting  | owners/operators   | Backup, upgrade, version awareness, and where docs live.        |

Guide copy should use "app" for end-user labels and reserve "plugin" for
developer/admin-facing sections.

### User State Model

Suggested isolated table:

| Table              | Purpose                                             |
| ------------------ | --------------------------------------------------- |
| `guide_user_state` | One row per tenant/user tracking progress and hide. |

Suggested columns:

| Column              | Type       | Notes                                         |
| ------------------- | ---------- | --------------------------------------------- |
| `tenant_id`         | string     |                                               |
| `user_id`           | string     |                                               |
| `hidden_at`         | timestamp? | Set when the user hides Guide.                |
| `completed_at`      | timestamp? | Set when the user marks Guide complete.       |
| `last_seen_version` | string?    | Last Guide content version seen by this user. |
| `progress`          | json       | Section/checklist progress. Defaults to `{}`. |
| `created_at`        | timestamp  |                                               |
| `updated_at`        | timestamp  |                                               |

Composite PK: (`tenant_id`, `user_id`).

`last_seen_version` allows Guide to present a non-intrusive "Guide updated"
affordance after meaningful guide updates without forcibly un-hiding the plugin.

### Optional Content Model

Phase 1 can keep content in code. A later operator-editable version may add:

| Table                    | Purpose                                        |
| ------------------------ | ---------------------------------------------- |
| `guide_content_sections` | Instance-specific guide sections and ordering. |
| `guide_content_blocks`   | Markdown/rich text blocks inside sections.     |

Operator-editable content should be capability-gated and should not support
arbitrary script/HTML. Markdown or a safe block model is enough.

## UI Flows

### First Login

```text
User logs in
  └─ Launcher or shell sees Guide not hidden/completed
       └─ Show Guide tile, nudge, or default first-run card
            ├─ Open Guide
            ├─ Hide Guide
            └─ Continue to Launcher
```

The exact surface can be lightweight. A Launcher tile plus first-run card is
enough; a blocking modal is not recommended.

### Completing or Hiding

```text
User opens /guide
  └─ Reads sections / checklist
       ├─ Mark complete → completed_at set, Guide no longer nudges user
       └─ Hide Guide → hidden_at set, Guide no longer appears in first-run surface
```

### Admin User

```text
Admin opens /guide
  └─ Sees normal user sections
       └─ Also sees Admin Basics and Self-hosting sections
```

Admin-only guide content should be hidden from non-admin users, not merely
disabled.

## Security and Privacy

- Guide requires an authenticated session.
- User progress/dismissal state is private to that user.
- Admin sections must be role/capability gated.
- Guide should not leak instance configuration that the current user could not
  otherwise see.
- Operator-editable content must be sanitized and should not allow arbitrary
  HTML or scripts.
- Guide should not call external services.

## Alternatives Considered

### Put first-run content directly in Launcher

Rejected as the whole solution. Launcher can surface a nudge, but guide content
will grow into sections, checklists, and admin/operator variants. Keeping that
as a plugin preserves the plugin-first architecture.

### Put guide content only in the public docs site

Rejected. Public docs are useful but are outside the product. New users should
have an in-product orientation path even on private/offline instances.

### Make Guide globally dismissible by admins

Rejected for the primary user flow. An operator may disable the plugin globally,
but ordinary completion/hide behavior is per user.

### Force every new user through a blocking onboarding modal

Rejected. Sovereign should remain quiet and user-controlled. A visible guide
entry and dismissible nudge are enough.

## Open Questions

1. Should Guide be visible in Launcher by default after a user hides it, or only
   reachable through a help/account route?
2. Should `hidden_at` suppress Guide forever, or should major Guide content
   updates show a small "Guide updated" affordance?
3. Should operators be able to add custom instance guide content in v1, or is
   static platform-owned content enough?
4. Should Guide progress use a checklist, simple read/unread sections, or both?
5. Should Guide be eligible as a root plugin for first-run instances?

## Adoption Path

1. **RFC draft:** agree on Guide's product boundary and per-user hide behavior.
2. **Phase 1 — Static platform guide:** platform plugin, static sections,
   user-state table, complete/hide actions, Launcher/shell nudge.
3. **Phase 2 — Role-aware guide:** admin/operator sections, capability-aware
   copy, instance identity-aware text.
4. **Phase 3 — Operator content:** optional capability-gated custom sections.
5. **Phase 4 — Help affordance:** stable path from Account/Launcher to reopen
   Guide after hiding.

Phase 1 may require small runtime/Launcher integration so hidden/completed Guide
state affects per-user surfacing. No published package change is expected unless
the integration requires manifest-level visibility metadata.

## Changelog

| Version | Date      | Change        |
| ------- | --------- | ------------- |
| 0.1     | June 2026 | Initial draft |
