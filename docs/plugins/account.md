# Account

**Version:** 0.1\
**Date:** June 2026\
**Author:** kasunben\
**Purpose:** Canonical specification for the Sovereign Account plugin — the single source of truth for its manifest, access model, functional requirements, data model, and build plan.\
**Status:** v0.1 implemented (Task 0.4.06) — Profile, Security, and Preferences (ACC-01–08)

---

Account is the personal settings plugin for every authenticated Sovereign user.
It covers profile management (display name, avatar), credentials (password
change, active sessions), preferences (timezone, appearance), and — in a future
milestone — security hardening (2FA) and sidebar customisation.

The plugin ships in the monorepo (`type: platform`) and is accessible at
`/account`. It is **separate from Console** — Console is admin-only platform
administration; Account is per-user self-service. Every authenticated user has
access to Account regardless of role.

**Sidebar rendering:** In the sidebar bottom section, the Account plugin's slot
renders the user's avatar image (or a monogram from their initials) rather than
the generic `icon.svg` from the manifest. The shell hardcodes this special
rendering for `fs.sovereign.account`. The `icon.svg` is used in the Launcher
grid only.

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
| `id`                               | `fs.sovereign.account`         |
| `name`                             | `Account`                      |
| `type`                             | `platform`                     |
| `runtime`                          | `native`                       |
| `routePrefix`                      | `/account`                     |
| `shell`                            | `default`                      |
| `adminOnly`                        | omitted (`false`)              |
| `icon`                             | `icon.svg`                     |
| `permissions`                      | `auth:session`, `db:readWrite` |
| `compatibility.minPlatformVersion` | `0.4.0`                        |

Proposed `manifest.json`:

```json
{
  "schemaVersion": 1,
  "id": "fs.sovereign.account",
  "name": "Account",
  "version": "0.1.0",
  "description": "Personal profile, preferences, and credential management.",
  "type": "platform",
  "runtime": "native",
  "routePrefix": "/account",
  "shell": "default",
  "icon": "icon.svg",
  "permissions": ["auth:session", "db:readWrite"],
  "compatibility": {
    "minPlatformVersion": "0.4.0"
  }
}
```

No `repository` field — platform plugins live in the monorepo.

---

## Access control

Account is available to all authenticated users. There is no admin-only gate.

Data is strictly per-user: a user can only read and modify their own profile,
preferences, and sessions. There are no shared resources between users in this
plugin.

---

## Functional requirements

Requirements are versioned to their milestone. IDs are stable — never renumber
or reuse an ACC-\* id.

### v0.1 — Core

#### Profile

| ID     | Requirement                                                                                                                                                                      |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ACC-01 | View profile: display name, email address (read-only — email changes are out of scope in v1), and current avatar image or monogram.                                              |
| ACC-02 | Change display name. The new name is validated (non-empty, max 100 chars).                                                                                                       |
| ACC-03 | Upload or replace avatar image. Accepted formats: JPEG, PNG, WebP. Max size: 2 MB. The image is stored and served by the platform; the stored URL is written to the user record. |

#### Credentials

| ID     | Requirement                                                                                                                                                                                                                                                                                                                                                                |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ACC-04 | Change password. Requires current password confirmation. Delegates the credential update to `better-auth`. The current session is preserved after the change.                                                                                                                                                                                                              |
| ACC-05 | View active sessions: device/browser hint, IP address, last-active timestamp, and whether the session is the current one.                                                                                                                                                                                                                                                  |
| ACC-06 | Revoke any active session except the current one.                                                                                                                                                                                                                                                                                                                          |
| ACC-11 | Sign out of the current session ("Log out"): ends the active session via `better-auth` and clears the session-cache cookies so it takes effect immediately, then redirects to login. Complements ACC-06 (which revokes other sessions only). Implements AUTH-02 in the Account UI; the same action is also reachable from the shell avatar menu. Scheduled as Task 0.5.11. |

#### Preferences

| ID     | Requirement                                                                                                                                                                                                           |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ACC-07 | Set timezone from the IANA timezone database (searchable dropdown). Stored in `account_prefs`. The platform uses this value for all date and time display across plugins.                                             |
| ACC-08 | Set appearance: `System` (follow OS), `Light`, or `Dark`. Stored in `account_prefs`. The shell applies the corresponding `data-theme` attribute on the `<html>` element. Preference is applied immediately on change. |

---

### v0.2 — Security and customisation (post-v1)

| ID     | Requirement                                                                                                                                                          |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ACC-09 | Two-factor authentication (TOTP): enroll via QR code, verify, enable/disable. Managed through `better-auth`'s 2FA plugin.                                            |
| ACC-10 | Sidebar customisation: pin, unpin, and reorder plugins in the sidebar middle section. Preferences stored in `account_sidebar_prefs` (new table). Deferred from v0.1. |

---

## Directory structure

Account lives in the monorepo under `plugins/account/`.

```
plugins/account/
├── manifest.json
├── icon.svg                          # Account icon (user silhouette or similar)
├── app/
│   ├── layout.tsx                    # Account sub-navigation (Profile / Security / Preferences tabs)
│   ├── page.tsx                      # Redirect to /account/profile
│   ├── profile/
│   │   └── page.tsx                  # Display name + avatar
│   ├── security/
│   │   └── page.tsx                  # Password change + active sessions
│   └── preferences/
│       └── page.tsx                  # Timezone + appearance
├── db/
│   └── schema.ts                     # account_prefs table
├── migrations/
└── components/
    ├── AvatarUpload.tsx              # Image picker + upload + crop
    ├── SessionList.tsx               # Active sessions table with revoke buttons
    └── TimezoneSelect.tsx            # Searchable IANA timezone dropdown
```

---

## Data model

One table, prefixed `account_` (platform plugin convention). Carries `tenant_id`
per the platform architectural rule.

### `account_prefs`

| Column       | Type      | Notes                                                               |
| ------------ | --------- | ------------------------------------------------------------------- |
| `user_id`    | string    | PK. FK → users.                                                     |
| `tenant_id`  | string    |                                                                     |
| `timezone`   | string    | IANA timezone identifier (e.g. `America/New_York`). Default: `UTC`. |
| `theme`      | string    | Enum: `system` \| `light` \| `dark`. Default: `system`.             |
| `updated_at` | timestamp |                                                                     |

One row per user; upserted on any preference change.

**Avatar storage:** Avatar images are stored outside this table. The exact
storage mechanism (platform file storage, object store, base64 in a separate
`account_avatars` table) is an open question — see Open questions §1. The user
record in `packages/db` (maintained by the platform, not this plugin) holds the
`avatar_url` string that the shell and other plugins read for display.

---

## SDK dependencies

| SDK surface | Used for                                                                        | Available from |
| ----------- | ------------------------------------------------------------------------------- | -------------- |
| `sdk.auth`  | Current user session; password change via `better-auth`; session listing/revoke | Task 0.4.02    |
| `sdk.db`    | Read/write `account_prefs`; read/write `avatar_url` on the user record          | Task 0.5.05    |

---

## UI

Account consumes `@sovereignfs/ui` exclusively.

**Layout:** Three-tab navigation within the plugin (Profile / Security /
Preferences). Uses the default shell (sidebar + content area on desktop; header

- content + footer on mobile).

**Net-new primitives likely needed in `packages/ui`:**

- **Avatar upload** — image picker with circular crop preview and upload
  progress. Broadly reusable wherever user-generated images appear.
- **Timezone select** — searchable dropdown over 600+ IANA timezone entries with
  UTC offset display. Complex enough to warrant a shared component.
- **Segmented control** — three-option horizontal toggle for Light / Dark /
  System mode. Reusable for other multi-choice preference settings.
- **Session row** — a table row showing session metadata with a contextual
  "Revoke" action for other sessions and a "Log out" action for the current one
  (ACC-11). Could generalise to other "active credential" listings.

The current-session "Log out" (ACC-11) shares the platform logout action with the
shell **avatar menu** (the primary entry point); see Task 0.5.11.

---

## Build plan

Two milestones.

### v0.1 — Core (ACC-01–08)

Profile (display name + avatar upload), password change, active session listing
with revoke, timezone setting, appearance toggle.

**Done when:** A user can update their display name, upload an avatar, change
their password, revoke other sessions, set their timezone, and toggle light/dark
mode — with all preferences persisted and applied immediately.

### Logout (ACC-11) — Task 0.5.11

Self sign-out, closing the long-standing AUTH-02 gap (specified but never built).
Adds `sdk.auth.signOut()` and a "Log out" action on the current-session row,
sharing the platform logout flow with the shell avatar menu (better-auth
sign-out + session-cache-cookie clear + redirect to login). Sequenced after v0.1.

### v0.2 — Security and customisation (ACC-09–10)

TOTP two-factor authentication via `better-auth` 2FA plugin. Sidebar
customisation (pin/unpin/reorder) — see ACC-10.

---

## Open questions

1. **Avatar storage mechanism.** ✅ **Resolved (Task 0.4.06 part 1): option (b).**
   Avatars are stored on disk at `data/avatars/<user_id>.<ext>` (workspace-root
   `data/`, resolved like the SQLite DB) and served by the runtime route
   `GET /api/account/avatar/[userId]`. Upload goes to `POST /api/account/avatar`
   (validates JPEG/PNG/WebP ≤ 2 MB), which writes the file and sets the user
   record's `image` to the cache-busted serve URL via better-auth. Migration to
   an object store remains a clean future swap behind the same routes.

2. **Email change.** Email is currently read-only (ACC-01). Changing email
   requires re-verification and potentially `better-auth` workflow changes.
   Flag as a v0.2 consideration rather than a v0.1 open question — out of scope
   for now.

3. **Display name vs. username.** The platform may have both a `name` (display
   name, changeable) and a `username` or `email` (login identifier, immutable).
   ACC-02 targets the display name only. Confirm the platform user schema
   distinguishes these two fields before implementing.

4. **Appearance preference and SSR.** ✅ **Resolved (Task 0.4.06 part 1).** The
   choice is written to both `account_prefs` (authoritative) and an `sv-theme`
   cookie. An inline script in the runtime root layout (`runtime/app/layout.tsx`)
   runs before first paint and sets `data-theme` from the cookie — `light`/`dark`
   directly, `system` (or unset) following `prefers-color-scheme`. This avoids a
   flash and resolves `system` (which the server can't, lacking the OS hint)
   without a per-request DB call. The `ThemeControl` also applies the new value
   instantly on change before the persist round-trip.

---

## Changelog

| Version | Date     | Change                                                                                                                                                                                                                                                                                                                                     |
| ------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 0.1     | Jun 2026 | Initial draft — per-user profile and preferences plugin.                                                                                                                                                                                                                                                                                   |
| 0.1     | Jun 2026 | Part 1 implemented (Task 0.4.06): Profile (ACC-01/02/03) + Preferences (ACC-07/08). Resolved Q1 (avatar → disk + Next route) and Q4 (theme → `account_prefs` + `sv-theme` cookie + pre-paint inline script). Deviation: components live under `app/_components/` (composition copies only `app/`). Security (ACC-04–06) follows in part 2. |
| 0.1     | Jun 2026 | Part 2 implemented (Task 0.4.06): Security tab — password change (ACC-04) + active-session list/revoke (ACC-05/06). Extended `sdk.auth` with `changePassword`/`listSessions`/`revokeSession` (wrap better-auth with cookie + Origin). v0.1 complete.                                                                                       |
| 0.1     | Jun 2026 | Specified ACC-11 (self sign-out / "Log out") to close the AUTH-02 gap — current-session Log out action + shell avatar menu, `sdk.auth.signOut()`, better-auth sign-out + session-cache-cookie clear. Scheduled as Task 0.5.11 (not yet implemented).                                                                                       |
