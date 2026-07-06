# Epic: Plugin — Console

> The admin control plane — user management, plugin management, tenant settings, system health, and operator tooling.

## Status

⏳ In Progress

## Overview

Console is a `type: platform`, `adminOnly` plugin that ships with Sovereign. It gives `platform:admin` and `platform:owner` users a unified control surface: manage users and invites, enable/disable plugins, configure tenant settings and root plugin, inspect system health, manage instance identity/branding, manage entitlements, and view the platform-wide activity feed. Console also renders install/remove UX for community plugins (two-step server-side flow: manifest preview → confirm).

## Tasks

#### ✅ 13.1 — Console plugin scaffold

**Goal:** Console plugin directory structure, manifest, and basic routing wired into the runtime via the generate script.

**Deliverables:**

- `plugins/console/manifest.json` — type: `platform`, runtime: `native`, routePrefix: `/console`, adminOnly: true, shell: `default`, icon: `icon.svg`
- `plugins/console/icon.svg` — Console icon, rendered by the shell in the sidebar bottom section (admin only)
- `plugins/console/app/layout.tsx` — console shell layout
- `plugins/console/app/page.tsx` — console home (empty, links to sub-sections)
- `plugins/console/db/schema.ts` — no tables yet (console reads platform tables)
- `plugins/console/package.json`
- Running `pnpm generate` wires console into the runtime

**SRS reference:** 3.5 Plugin System, 4.4 Functional Requirements — Console, PLT-03

**Review checklist:**

- `/console` returns 403 for `platform:user`, accessible for `platform:admin`
- Generate script correctly picks up console manifest
- Console appears in launcher for admin users only

---

#### ✅ 13.2 — Console: user management

**Goal:** User list, invite, role change, and deactivate/reactivate.

**Deliverables:**

- `plugins/console/app/users/page.tsx` — paginated user list: name, email, role, status, join date
- `plugins/console/app/users/invite/page.tsx` — invite form: generates invite token, sends email via `sdk.mailer`
- Role change and deactivate/reactivate as server actions
- SDK `auth` and `mailer` real implementations wired in this task as a prerequisite for Console to function. `db` and `platform` implementations remain as stubs and are completed in Task 0.5.05.

**SRS reference:** CON-02, CON-03, CON-04, CON-05

**Review checklist:**

- User list shows all users with correct data
- Invite email sends (or logs no-op) when SMTP unconfigured
- Role change persists correctly
- Deactivated user cannot log in

---

#### ✅ 13.3 — Console: plugin management

**Goal:** Installed plugin list with enable/disable toggle.

**Deliverables:**

- `plugins/console/app/plugins/page.tsx` — list of installed plugins from registry: name, version, type, status
- Enable/disable toggle as server action — writes to a `plugin_status` table in platform db
- Runtime middleware respects disabled status — returns 404 for disabled plugin routes
- Disabled plugins hidden from launcher

**SRS reference:** CON-06, CON-07, PLT-04

**Review checklist:**

- Disabling a plugin blocks its routes immediately (no rebuild required)
- Disabled plugin disappears from launcher
- Re-enabling restores access

---

#### ✅ 13.4 — Console: tenant settings, system health, and root plugin config

**Goal:** Tenant name configuration, invite-only toggle, system health dashboard, and admin-configurable root plugin.

**Deliverables:**

- `platform_settings` table added to `packages/db` schema (`src/schema/platform.ts`):
  - Columns: `key` (string), `value` (string), `tenant_id` (string), `updated_at` (timestamp)
  - PK: `(key, tenant_id)`
  - Initial row seeded on first run: `key = 'root_plugin_id'`, `value = 'fs.sovereign.launcher'`
- `plugins/console/app/settings/page.tsx` — three settings in one page:
  - Tenant name field (CON-08) — writes to `tenants` table
  - Invite-only toggle (CON-10) — writes to `tenants` table, auth server reads it at registration
  - Root plugin selector (CON-11) — dropdown listing all installed, enabled, non-`adminOnly` plugins; writes `root_plugin_id` to `platform_settings`; change takes effect immediately without restart
- `plugins/console/app/health/page.tsx` — runtime version, database type + connection status, auth server status, disk usage (CON-09)
- `runtime/app/(platform)/page.tsx` updated — reads `root_plugin_id` from `platform_settings` and redirects to that plugin's `routePrefix` (default: `/launcher`)
- Tenant name stored in `tenants` table, exposed via `sdk.platform.getConfig()`

**SRS reference:** CON-08, CON-09, CON-10, CON-11, PLT-06, PLT-14, PLT-15

**Review checklist:**

- Tenant name change reflects in `sdk.platform.getConfig()` immediately
- Health page shows accurate database type (SQLite vs Postgres)
- Invite-only toggle takes effect on next registration attempt without restart
- Changing root plugin updates `platform_settings`; navigating to `/` immediately loads the newly configured root plugin without restart
- When the root plugin is not the Launcher, the Launcher appears in the sidebar middle section as a regular icon linking to `/launcher` (PLT-12)
- `platform_settings` table present in migration; `root_plugin_id` seeded on first run

---

#### 📋 13.5 — Console plugin workflow coverage

**Goal:** Add meaningful regression coverage for Console workflows that
operators depend on, beyond private helper functions.

**Deliverables:**

- Cover plugin enable and disable actions.
- Cover invite creation flow.
- Cover root plugin update behavior.
- Cover branding and settings update behavior.
- Cover role update guardrails.
- Cover admin-only behavior for sensitive routes.

**Dependencies:** Task 13.4 (Console tenant settings, system health, and root
plugin config), Task 9.8 (instance identity rename), Task 1.10
(email-bound invite flow), Task 1.5 (platform roles and capabilities).

**SRS reference:** CON-02, CON-03, CON-06, CON-07, CON-08, CON-09, CON-11.

**Review checklist:**

- Critical operator actions have either unit/action tests or E2E coverage.
- Admin-only behavior is covered for sensitive routes and actions.
- Tests avoid depending on generated route copies under `runtime/app`.

---

#### 📋 13.6 — Console primitive migration, Phase 2

**Goal:** Finish adopting `@sovereignfs/ui` primitives for the higher-risk
Console patterns deliberately deferred by Task 9.12 (design system
stabilization), which scoped Console to a bounded pass — generic form
controls, named action buttons, and duplicate badge implementations — and
left the following for a focused follow-up so admin-critical flows (user
deactivation, entitlements, plugin management) aren't touched in the same
change as the broader stabilization work.

**Deliverables:**

- Migrate the confirm-dialog pattern (`.confirmNativeDialog` / native
  `<dialog>`, used across `UserActionButtons.tsx`, `UserCard.tsx`,
  `RevokeSessionButton.tsx`, `PluginInstallPanel.tsx`) to the shared `Dialog`
  component.
- Migrate the hand-rolled `.table` styling in `users/page.tsx` to a shared
  table pattern, or document why it stays bespoke.
- Consolidate the icon-only action button family (`.iconBtn`,
  `.iconBtnReactivate`, `.iconBtnDanger`, `.copyButton`,
  `.pluginCardBtnToggle`, `.pluginCardBtnRemove`, `.userCardMenuBtn`) —
  either a new icon-button variant on `Button` or a documented local pattern.
- Migrate Console's section nav (`layout.tsx`, `.nav`/`.navLink`) to
  `NavTabs`, and the per-page `.pageHeader`/`.pageTitle` markup to
  `PageHeader` — both **blocked on Task 9.13** (NavTabs needs Next `<Link>`
  support; PageHeader needs a configurable heading level) landing first.
- `.rolePill`/`.rolePills` (Console-specific role-assignment control) stay
  local — not a generic primitive candidate.

**Dependencies:** Task 9.12 (design system stabilization) ✅, Task 9.13
(NavTabs Link support + PageHeader heading level) for the nav/header items.

**Review checklist:**

- Confirm dialogs across Console use the shared `Dialog` component.
- Icon-only action buttons share one documented pattern instead of six
  near-duplicate CSS classes.
- No behavioral regression on user deactivation, deletion, MFA reset, invite
  cancellation, or plugin install/remove flows — these are admin-destructive
  actions and need manual re-verification, not just typecheck/lint.

---

#### 📋 13.7 — Console plugin access management (RFC 0065)

**Goal:** Give admins/owners an explicit Console workflow for deciding which users can open
each installed plugin.

**Deliverables:**

- Add an Access section to Console plugin detail/management surfaces.
- Support the policy choices from RFC 0065: Everyone, Admins and owners, Selected users,
  Selected groups, and Disabled.
- Add a user picker for `selected_users`, backed by user directory/member-selection
  primitives.
- Add a group picker for `selected_groups`, backed by the user groups foundation.
- Show an effective-access summary and warnings for empty selected-user/group policies.
- Make it clear that Console management access is separate from plugin app access; admins
  can manage a plugin without automatically being able to open it.
- Align disabled plugin language with runtime enforcement: disabled plugins remain installed
  and manageable, but cannot be opened by anyone.
- Emit activity events for policy changes and user/group grant changes.
- Update operator docs for common workflows: enable for everyone, limit to admins, grant a
  user, grant a group, disable without uninstalling.

**Dependencies:** Task 1.15 (user groups), Task 2.21 (plugin access policy enforcement), Task
13.3 (Console plugin management), Task 1.12 (user directory/member selection).

**SRS reference:** [RFC 0065](../rfcs/0065-user-groups-plugin-access.md)

**Review checklist:**

- Admins/owners can change plugin policy and grants from Console.
- Empty selected-user/group policies show clear warnings before saving or after save.
- Admins/owners are not silently granted app access for selected-user/group policies.
- Disabled plugins cannot be opened from Console app-launch affordances.
- Policy and grant changes are audited.
- `pnpm format:check && pnpm lint && pnpm typecheck && pnpm test`

Subsequent tasks added Console sections as part of other epics:

| Task   | Feature added to Console                                                   | Primary epic                        |
| ------ | -------------------------------------------------------------------------- | ----------------------------------- |
| 0.5.11 | Data grants oversight (`/console/data-grants`)                             | [Platform Shell](platform-shell.md) |
| 0.5.13 | Activity feed (`/console/activity`)                                        | [Activity Logs](activity-logs.md)   |
| 0.6.0  | Role & capability assignment UI                                            | [Users & Auth](users-auth.md)       |
| 0.8.0  | Entitlement oversight, manual payment confirmation, Ed25519 key management | [Monetization](monetization.md)     |
| 0.8.3  | Richer `/api/admin/health` response                                        | [Platform Shell](platform-shell.md) |
| 0.8.4  | Instance identity / branding section                                       | [Theming](theming.md)               |
| 9.9    | Email Templates section                                                    | [Theming](theming.md)               |
| 1.7    | Admin delete user action                                                   | [Users & Auth](users-auth.md)       |
| 1.15   | User groups management                                                     | [Users & Auth](users-auth.md)       |
| 2.21   | Plugin access policy management                                            | [Platform Shell](platform-shell.md) |

## Related Docs

- [docs/plugins/console.md](../plugins/console.md) (if it exists)
- [plugin-development.md](../plugin-development.md)
