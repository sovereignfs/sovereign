# Epic: Activity Logs

> A tamper-evident audit trail of user and admin actions across the platform, surfaced in both the Account plugin (personal feed) and the Console (platform-wide feed).

## Status

✅ Complete

## Overview

Activity logging gives operators and users visibility into what happened and when. The platform captures Console admin actions (invite, role change, deactivate, plugin enable/disable, settings changes) and Account self-mutations (display name, password change, session revoke, avatar). Plugins write their own events via `sdk.activity.log()`. The Account plugin shows a personal feed; Console shows the platform-wide feed with actor, action, scope, and summary columns.

## Tasks

#### ✅ 5.1 — Activity log (RFC 0005)

**Delivered:**

- `activity_log` table in both SQLite and Postgres schemas (parity-tested); `recordActivity()`, `listUserActivity()`, `listAdminActivity()` helpers in `@sovereignfs/db` (→ 0.9.0); bootstrap DDL with three indexes
- `sdk.activity.log()` implemented (no longer a stub): reads actor/plugin from request headers via the `SdkHost.activity.log()` contract; runtime injects actor type and namespaces action by plugin ID; `activity:write` permission documented (`@sovereignfs/sdk` → 1.3.0)
- Capture points: Console user-management actions (invite, role change, deactivate/reactivate), admin plugin enable/disable, admin settings changes (tenant name, root plugin, invite-only), Account self-mutations (display name, password change, session revoke, avatar)
- API routes: `GET /api/account/activity` (personal feed, session-gated) and `GET /api/admin/activity` (platform-wide, admin-key-gated with `actorId`/`action`/`limit` filters)
- Account **Activity** tab (`/account/activity`) — personal feed, all users; Console **Activity** nav entry + page (`/console/activity`) — platform-wide feed with actor, action, summary, scope columns
- `runtime/src/activity.ts` `logActivity()` — fire-and-forget wrapper used by runtime routes; never throws so a log failure never blocks the primary action
- `runtime` → 0.14.0; `plugins/account` → 0.4.0; `plugins/console` → 0.5.0

**Deferred:** Login/session-established capture at the runtime verify boundary (Edge runtime cannot write the platform DB; deferred to a follow-on task per RFC 0005 §3 open question).

---

## Related RFCs

- [RFC 0005 — Activity log](../rfcs/0005-activity-log.md)

## Related Docs

- [plugin-development.md — `sdk.activity`](../plugin-development.md)

## Cross-references

- The Account plugin's Activity tab (`/account/activity`) is part of [Plugin — Accounts](plugin-accounts.md).
- The Console Activity page (`/console/activity`) is part of [Plugin — Console](plugin-console.md).
