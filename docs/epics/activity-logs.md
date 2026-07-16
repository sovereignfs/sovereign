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

#### ✅ 5.2 — Email delivery failure activity logging (RFC 0062)

**Goal:** When a platform email send fails (or is skipped because SMTP isn't configured), record
a corresponding `activity_log` entry — not just the existing `email_delivery_log` / `auth_email_delivery_log`
row — so the failure is visible in Console's platform-wide feed and, for a specific known
recipient, that user's own Account feed. Today a failed send (e.g. SMTP down, as diagnosed for the
`auth.account_created` email) is silently recorded only in the low-level delivery-diagnostics
table with no signal in either activity feed.

**Deliverables:**

- `runtime/src/platform-email.ts` → `sendPlatformEmail`'s failure branch also calls
  `logActivity()` (`runtime/src/activity.ts`) with `action: 'email.delivery_failed'`,
  `actorType: 'system'`, `visibility: 'user'` when `input.toUserId` is known (so it appears in
  both feeds) else `visibility: 'admin'`, `subjectUserId: input.toUserId ?? null`,
  `summary` describing the template/delivery class (no raw email address — the delivery log
  already hashes the recipient; the activity summary follows the same privacy posture),
  `metadata: { templateId, deliveryClass, errorCode }`.
- `runtime/app/api/admin/activity/route.ts` → add `POST` handler: admin-key-guarded
  (`checkAdminKey`, same as the existing `GET`), accepts a `RecordActivityInput`-shaped body,
  calls `logActivity()`. This is the narrow internal endpoint `apps/auth` uses to reach the
  platform activity log across the process/DB boundary (mirrors the existing `runtime → apps/auth
/api/verify` server-to-server pattern, reversed). No new `RESERVED_API_SEGMENTS` entry needed —
  `admin` is already reserved.
- New env var `SOVEREIGN_RUNTIME_URL` — internal-only runtime address for auth→runtime
  server-to-server calls, mirroring the existing `SOVEREIGN_AUTH_URL`. Defaults to
  `http://localhost:${RUNTIME_PORT:-3000}` for native dev; set to `http://runtime:3000` in Docker
  Compose (dev and prod — always the internal container port, not the host-mapped `RUNTIME_PORT`,
  matching how `SOVEREIGN_AUTH_URL` uses `http://auth:3001` in both compose files regardless of
  the mapped host port). **Not** `NEXT_PUBLIC_*` — this is a server-only value, never read by the
  browser.
- `apps/auth/src/platform-email.ts` → `sendAuthPlatformEmail`'s failure branch fire-and-forget
  `fetch`es `${SOVEREIGN_RUNTIME_URL}/api/admin/activity` with `Authorization: Bearer
${SOVEREIGN_ADMIN_KEY}` (both already required env vars — `SOVEREIGN_ADMIN_KEY` fails startup if
  unset, `SOVEREIGN_RUNTIME_URL` defaults to localhost); swallows any error (network failure,
  runtime not yet up, etc.) so it never blocks or delays the auth flow — matches `logActivity()`'s
  existing "never throws" contract.
- `docker-compose.yml` / `docker-compose.prod.yml`: add `SOVEREIGN_RUNTIME_URL: 'http://runtime:3000'`
  to the `auth` service's `environment` block in both files (internal container port, same in dev
  and prod).
- `.env.example`: document `SOVEREIGN_RUNTIME_URL` next to the existing `SOVEREIGN_AUTH_URL`
  block. `docs/self-hosting.md`: document the new env var (docs-parity test enforces this).

**Version bumps:** `runtime` → patch, `apps/auth` → patch (both `fix/`-equivalent additive
behavior, no public contract change).

**Dependencies:** Task 5.1 (activity log infrastructure), Task 1.14 (email delivery coverage,
RFC 0062 — the two failure branches this task extends).

**SRS reference:** RFC 0062 §"Delivery audit and diagnostics"

**Review checklist:**

- Stop Mailpit, trigger a signup (`auth.account_created`) → `auth_email_delivery_log` row is
  `failed` (existing behavior) AND a corresponding `activity_log` row appears in both
  `/console/activity` and the new user's `/account/activity`.
- Trigger an admin-triggered email send failure (e.g. via `/api/admin/email` with SMTP down) →
  activity entry appears in Console only when no specific recipient user is identifiable, in both
  feeds when one is.
- With the runtime unreachable (e.g. stopped), auth-side email failures still do not throw and do
  not block signup/password-reset — the activity-log report fails silently.
- A successful send does **not** create an activity entry (only failures/skips are logged here —
  success is implicit in the absence of a failure entry, avoiding activity-feed noise).
- `pnpm format:check && pnpm lint && pnpm typecheck && pnpm test`

---

## Related RFCs

- [RFC 0005 — Activity log](../rfcs/0005-activity-log.md)
- [RFC 0062 — Email delivery coverage](../rfcs/0062-email-delivery-coverage.md)

## Related Docs

- [plugin-development.md — `sdk.activity`](../plugin-development.md)

## Cross-references

- The Account plugin's Activity tab (`/account/activity`) is part of [Plugin — Accounts](plugin-accounts.md).
- The Console Activity page (`/console/activity`) is part of [Plugin — Console](plugin-console.md).
