# Epic: Plugin — Accounts

> Per-user self-service — profile, security, preferences, data portability, activity, and account deletion.

## Status

✅ Complete

## Overview

The Account plugin (`fs.sovereign.account`) is a `type: platform`, `shell: overlay` plugin accessible to all authenticated users. It lives in the sidebar bottom chrome as the user's avatar. The plugin has grown through several epics as new capabilities were added: the initial profile/security/preferences trio, then a Data tab for cross-plugin consent management and portability export/import, an Activity tab for the personal audit feed, MFA enrollment, and subscription management for monetized plugins.

## Tasks

#### ✅ 14.1 — Account plugin

**Goal:** Per-user profile, preferences, and credential management for all authenticated users.

**Deliverables:**

- `plugins/account/` with:
  - `manifest.json` — id: `fs.sovereign.account`, type: `platform`, runtime: `native`, routePrefix: `/account`, shell: `default`, icon: `icon.svg`, permissions: `["auth:session", "db:readWrite"]`, minPlatformVersion: `0.4.0`
  - `icon.svg` — user silhouette or similar. Note: the sidebar bottom section renders the user's avatar (or initials) for `fs.sovereign.account`, not this icon; `icon.svg` is used in the Launcher grid only.
  - `app/layout.tsx` — three-tab sub-navigation: Profile / Security / Preferences
  - `app/page.tsx` — redirect to `/account/profile`
  - `app/profile/page.tsx` — display name + avatar upload (ACC-01, ACC-02, ACC-03). Avatar stored on disk at `data/avatars/<user_id>` and served via a Next.js route; `avatar_url` written to the user record.
  - `app/security/page.tsx` — password change with current-password confirmation (ACC-04); active sessions list with revoke (ACC-05, ACC-06)
  - `app/preferences/page.tsx` — timezone (searchable IANA dropdown, ACC-07) + appearance toggle Light / Dark / System (ACC-08)
  - `db/schema.ts` — `account_prefs` table: `user_id` (PK/FK), `tenant_id`, `timezone` (IANA string, default `UTC`), `theme` (`system` | `light` | `dark`, default `system`), `updated_at`
  - `components/AvatarUpload.tsx`, `components/SessionList.tsx`, `components/TimezoneSelect.tsx`
- Appearance preference written to both `account_prefs` (authoritative) and a `sv-theme` cookie so the shell can apply `data-theme` on the server without a DB round-trip (prevents SSR flash — see ACC-08 open question in `docs/plugins/account.md`)

**Dependencies:** Task 0.4.02 (`sdk.auth` — session, password change via `better-auth`, sessions API)

**SRS reference:** ACC-01–ACC-08, `docs/plugins/account.md`

**Review checklist:**

- User can update display name; change persists on reload
- Avatar upload stores file, updates `avatar_url`, and is reflected in the sidebar bottom section's avatar slot
- Password change succeeds with the correct current password; rejected with wrong current password; current session is preserved after a successful change
- Active sessions list shows all sessions with device hint, IP, and last-active timestamp; any session except the current one can be revoked
- Timezone preference stored in `account_prefs`
- Appearance toggle applies `data-theme` immediately without reload; preference survives page reload via the `sv-theme` cookie
- `pnpm lint`, `pnpm format:check`, and `pnpm typecheck` pass

---

Subsequent tasks added Account sections as part of other epics:

| Task   | Feature added to Account                                              | Primary epic                                  |
| ------ | --------------------------------------------------------------------- | --------------------------------------------- |
| 0.5.11 | Data tab — active consent grants with per-grant revoke                | [Platform Shell](platform-shell.md)           |
| 0.5.12 | Security tab — Log out action for current session                     | [Users & Auth](users-auth.md)                 |
| 0.5.13 | Activity tab — personal audit feed                                    | [Activity Logs](activity-logs.md)             |
| 0.5.15 | Data tab — Export and Import buttons for data portability             | [Data Sovereignty](data-sovereignty.md)       |
| 0.5.27 | Security tab — TOTP enrollment/disable, passkey add/list/remove       | [Users & Auth](users-auth.md)                 |
| 0.7.1  | Preferences tab — push notification opt-in                            | [Notification Center](notification-center.md) |
| 0.8.0  | New Subscriptions section — purchase, import license, manage renewals | [Monetization](monetization.md)               |
| 0.9.5  | Data tab — "Delete your account" section                              | [Users & Auth](users-auth.md)                 |

## Related Docs

- [docs/plugins/account.md](../plugins/) (plugin spec)
- [plugin-development.md](../plugin-development.md)
