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

#### ✅ 13.7 — Console plugin access management (RFC 0065)

**Goal:** Give admins/owners an explicit Console workflow for deciding which users can open
each installed plugin.

**Deliverables:**

- Add an Access section to Console plugin detail/management surfaces. Shipped as a
  `PluginAccessDialog` opened from an "Access" button on each plugin row/card
  (`plugins/console/app/plugins/PluginAccessDialog.tsx`), alongside 5 new Node-runtime admin
  API routes under `runtime/app/api/admin/plugins/[id]/access*` (`GET`/`PATCH` for the policy,
  `POST`/`DELETE` for user and group grants).
- Support the policy choices from RFC 0065: Everyone, Admins and owners, Selected users,
  Selected groups, and Disabled.
- Add a self-service toggle for Selected users/Selected groups policies, with copy explaining
  it requires the acting user to hold `plugins:self-manage` (RFC 0070).
- Add a user picker for `selected_users`, backed by user directory/member-selection
  primitives (`sdk.directory.searchUsers`/`resolveUsers`, 250ms debounce, 2-char minimum).
- Add a group picker for `selected_groups`, backed by the user groups foundation
  (`/api/admin/groups`).
- Show an effective-access summary and warnings for empty selected-user/group policies.
- Make it clear that Console management access is separate from plugin app access; admins
  can manage a plugin without automatically being able to open it. `plugins/console/app/plugins/page.tsx`
  computes `openableByViewer` per plugin server-side (via `canUserOpenPlugin`) and shows a
  disabled "Open" affordance with a `title` reason instead of hiding it.
- Align disabled plugin language with runtime enforcement: disabled plugins remain installed
  and manageable, but cannot be opened by anyone.
- When an admin/owner can manage but not open a plugin, show a disabled "Open" affordance with
  the reason rather than hiding it — the admin already knows the plugin exists.
- Emit activity events for policy changes and user/group grant changes: `plugin.access_policy_changed`,
  `plugin.access_user_granted`/`revoked`, `plugin.access_group_granted`/`revoked`.
- Update operator docs for common workflows: added a "Plugin access policy" subsection and a
  CON-13 requirement row to `docs/plugins/console.md`.

**Scope note (found during implementation):** the "distinguishing self-service grants from
admin-initiated ones" bullet is about the grant/revoke _action's_ audit trail, not the Access
dialog built here — every grant/revoke reachable from this dialog is inherently admin-initiated
(Console is `console:access`-gated). A self-service grant only exists once an eligible user
opts in through their own end-user surface, which is Task 15.3 (plugin directory browsing and
self-service enable/disable) — not yet built. That task's grant path must log a distinct actor
type/action so the two remain distinguishable once it lands; this task's admin-initiated grants
already always carry the acting admin's real `actorId` (fixed a pre-existing actor-id-forwarding
gap in `plugins/console/app/plugins/actions.ts`'s `adminFetch`, the same pattern previously fixed
in the groups and users `actions.ts` files — a fresh server-to-server `fetch()` from a server
action never carries the browser's `x-sovereign-user-id` unless forwarded explicitly).

**Dependencies:** Task 1.15 (user groups), Task 1.16 (per-user capability grants, RFC 0070),
Task 2.21 (plugin access policy enforcement), Task 13.3 (Console plugin management), Task 1.12
(user directory/member selection).

**SRS reference:** [RFC 0065](../rfcs/0065-user-groups-plugin-access.md)

**Review checklist:**

- Admins/owners can change plugin policy and grants from Console. ✅ verified live: policy
  selector auto-saves, user grant/revoke and group grant/revoke round-trip correctly.
- Empty selected-user/group policies show clear warnings before saving or after save. ✅
  verified live for both `selected_users` and `selected_groups`.
- Admins/owners are not silently granted app access for selected-user/group policies. ✅
  verified live: set a non-chrome plugin (Plainwrite) to `selected_users` with zero grants —
  the owner's own "Open" affordance disabled with the correct reason, and a direct
  `GET /plainwrite` 404'd via middleware even for the owner. Chrome plugins (Account, Console,
  Launcher) are intentionally exempt from access policy (Task 2.21 design) — they always stay
  reachable regardless of policy, which is correct, not a gap.
- Disabled plugins cannot be opened from Console app-launch affordances.
- The disabled "Open" affordance shows the denial reason instead of being hidden. ✅ verified
  live via the `title` attribute.
- Policy and grant changes are audited, with self-service grants distinguishable from
  admin-initiated ones. ✅ verified live in the Activity feed with correct actor attribution
  for every event type; self-service-vs-admin distinction deferred to Task 15.3 per the scope
  note above.
- `pnpm format:check && pnpm lint && pnpm typecheck && pnpm test`

---

#### ✅ 13.8 — Console plugin catalog browser and install-time activation (RFC 0065)

**Goal:** Let admins browse every plugin declared in `sovereign.plugins.json` (bundled in the
image at build time per Task 3.28) and activate one for the instance in one action, without a
rebuild or redeploy.

**Deliverables:**

- Add a catalog view, separate from the existing per-plugin management list, listing every
  cataloged plugin with its active/inactive state. Shipped as `PluginCatalogSection`
  (`plugins/console/app/plugins/PluginCatalogSection.tsx`), rendered above the existing
  Installed plugins table, consuming the Task 3.28 `GET /api/admin/plugins/catalog` endpoint via
  a new `getPluginCatalogAction` server action.
- "Activate" creates the plugin's `plugin_status` row via the Task 3.28
  `POST /api/admin/plugins/[id]/activate` endpoint (`activatePluginAction`). No migration run
  happens here — Task 3.28 already established that every registry plugin's migrations run
  unconditionally at every boot (`runAllPluginMigrations`), independent of activation state, so
  activation only needs to create the status row; the original "runs pending migrations" framing
  in this deliverable predates that finding and is superseded by it.
- Immediately after activation, prompt the admin for an initial `access_policy` (selector
  defaults to Disabled, matching the storage default) instead of leaving the plugin in an
  unconfigured state. Implemented as `ActivatedPolicyPrompt`, shown in place of the row that was
  just activated.
- Show plugins already active with a link into their existing management/Access surfaces
  instead of a duplicate "Activate" control — active catalog entries render as a plain "Active"
  badge row in the catalog view; their real management surface is the existing Installed
  plugins table below.
- Surface a clear error if activation fails, without leaving the plugin in a half-activated
  state — the runtime endpoint's `createPluginStatusRowIfAbsent` is a single insert-if-absent
  write, and `activatePluginAction` surfaces a non-OK response as an inline error next to the
  Activate button rather than swallowing it.
- **Found during implementation, fixed here:** the pre-existing `/api/admin/plugins` route
  (Task 13.3, predates 3.28/13.8) lists every plugin present in the registry regardless of
  whether it has been activated — a cataloged-but-never-activated plugin showed as "ENABLED"
  and fully manageable (Disable/Access/Open) in the old Installed plugins list, even though it
  has no `plugin_status` row and its access policy correctly resolves to `disabled` at the
  request layer. Using its Access dialog before activation would also silently create a
  `plugin_status` row defaulting to `enabled: true` (`setPluginAccessPolicy`'s upsert), bypassing
  the intended "activate first, defaults to disabled policy" flow. Fixed by filtering the
  Installed plugins list in `plugins/console/app/plugins/page.tsx` to exclude any plugin present
  in the catalog with `active: false` (chrome plugins are absent from the catalog entirely and
  are unaffected by this filter).
- **Found during implementation, fixed here:** the first implementation kept the "just
  activated, pick a policy" prompt inside the same row component driven by
  `useActionState`/`<form action>`, keyed on `entry.active`. In practice the prompt never
  appeared — the server action's `revalidatePath()` refreshes the catalog prop with
  `active: true` in the same reconciliation pass that the row's own local action-state update
  needed to land in, and the prop update wins, so the row went straight from "Activate" button
  to the terminal "Active" badge. Fixed by lifting "just activated" tracking to the parent
  (`PluginCatalogSection`'s `justActivated` state, set via a plain awaited call to
  `activatePluginAction` rather than the form/useActionState wiring) so the prompt's visibility
  no longer depends on winning a race against the server-driven prop refresh.

**Dependencies:** Task 3.28 (plugin catalog and install-time activation model), Task 13.7
(Console plugin access management — the policy step immediately after activation).

**SRS reference:** [RFC 0065](../rfcs/0065-user-groups-plugin-access.md)

**Review checklist:**

- An admin can activate a cataloged-but-inactive plugin from Console without a redeploy. ✅
  verified live end-to-end (Wallet plugin: delete its `plugin_status` row to simulate
  cataloged-but-inactive → Activate → inline policy prompt → set Everyone → plugin opens and
  appears in the Installed plugins list).
- A newly activated plugin defaults to `access_policy = disabled` and is not visible to any
  non-admin user until explicitly configured. ✅ verified: the prompt shows "is now active but
  disabled — nobody can open it yet" and the policy `Select` defaults to Disabled.
- A failed migration during activation leaves the plugin cleanly inactive, not partially
  active. N/A per the migration-timing finding above — activation is a single insert-if-absent
  write with no migration step to partially fail.
- Already-active plugins do not show a duplicate activation control. ✅ verified: active catalog
  entries render only an "Active" badge, no Activate button.
- `pnpm format:check && pnpm lint && pnpm typecheck && pnpm test`

---

#### ✅ 13.9 — Console Plugins page: unified filterable table (RFC 0065 follow-up)

**Goal:** Fix the duplication Task 13.8 introduced — every active plugin currently renders twice
(once as an inert "Active" badge row in the Plugin catalog section, once again with full
controls in Installed plugins) — by consolidating the Plugin catalog, Installed plugins, and
Example plugins sections into a single table with keyword and status filtering, and making the
result work equally well on desktop and mobile.

**Deliverables:**

- Merge the two existing data fetches (`GET /api/admin/plugins`, which already returns every
  registry plugin — not just active ones — with version/type/route/adminOnly/example/compatibility;
  and `getPluginCatalogAction()`, which adds the authoritative `active` flag) into one row per
  cataloged plugin. No new backend endpoint needed.
- Derive a single `status` per row: `incompatible` (has a `compatibilityError`, wins regardless
  of active/enabled) → `inactive` (no `plugin_status` row) → `enabled`/`disabled` (active,
  keyed off the enabled flag).
- Delete the separate Plugin catalog, Installed plugins, and Example plugins sections; replace
  with one `PluginTable` fed by the merged, filtered row list.
- Add a filter bar above the table: keyword search (matches name/id/description, client-side —
  plugin counts are small enough that a server round trip isn't warranted), a status filter
  (All/Inactive/Enabled/Disabled/Incompatible), and an example-plugins toggle (default **on** —
  Console is the admin's own management surface, unlike the Launcher's end-user-facing
  hidden-by-default convention in Settings, which is unaffected by this task).
- Row actions stay contextual by status: `inactive` gets `Activate` only, transitioning in place
  to the existing inline "pick an initial policy" prompt (Task 13.8) on success; `enabled`/
  `disabled` get the existing toggle/Access/Open/Remove; `incompatible` shows the reason, no
  toggle.
- While touching row actions: hide the `Access` button for chrome plugins (Account/Console/
  Launcher) — access policy is a permanent no-op for them (Task 2.21 design), so the button
  currently lets an admin configure a policy that can never take effect.
- **Desktop (≥768px):** filter bar in one horizontal row above the table; table columns and
  inline actions unchanged in shape from today.
- **Mobile (<768px):** filter bar collapses — search full-width on its own row, status becomes a
  horizontally-scrollable pill strip using the same `overflow-x: auto` + scroll-mask treatment
  Console's nav strip already uses at this breakpoint (`.nav` in `console.module.css`), example
  toggle folds in as one more pill. Card actions move behind a `⋯` `Menu` trigger (reusing the
  exact component and pattern `UserCard.tsx` already uses for this), keeping only the primary
  action (the enable/disable toggle, or Activate) inline; the inactive→policy-prompt transition
  gets its own card layout state rather than being squeezed into the menu, since the policy
  `Select` needs more horizontal room than the kebab menu affords.

**Dependencies:** Task 13.7 (Console plugin access management), Task 13.8 (Console plugin
catalog browser and install-time activation) — this task consolidates the UI both introduced.

**Found during implementation, fixed here:** the just-activated policy prompt uses the same
`justActivated` set-of-IDs pattern Task 13.8 established, but the unified table's status filter
introduced a new way for it to disappear prematurely — activating a plugin while the "Inactive"
filter is selected flips the row's real status away from `inactive` immediately
(`revalidatePath()`), and the plain `r.status !== statusFilter` filter check then excluded the
row entirely before the admin could see or dismiss the prompt. Fixed by checking
`justActivated.has(r.id)` first in the filter predicate, unconditionally keeping a just-activated
row visible regardless of the active status/example filters until the admin clicks "Done".

**SRS reference:** [RFC 0065](../rfcs/0065-user-groups-plugin-access.md) (follow-up cleanup, not
a new RFC requirement)

**Review checklist:**

- No plugin appears more than once on the page, in any status or filter combination. ✅ verified
  live: searched "wallet" under "All" — exactly one row, with Access/Open/Disable all present.
- Filtering by status and searching by keyword both narrow the table correctly and combine
  (e.g. status=Inactive + a search term). ✅ verified live: the Inactive pill correctly isolated
  a deactivated test plugin; search combined with it correctly (tested independently and
  together).
- The example toggle hides/shows example plugins without affecting their individually-set
  enabled state (Task 12.3's per-example override still works). ✅ verified live: unchecking
  "Show examples" dropped the count from 14 to 7 (all examples), non-example rows unaffected.
- Activating an inactive plugin still shows the inline policy prompt in place (no regression of
  the Task 13.8 race-condition fix). ✅ verified live on both desktop and mobile, including the
  filter-interaction bug found and fixed above (activating under the "Inactive" filter no longer
  makes the prompt vanish).
- Chrome plugins no longer show an Access button. ✅ verified live: Account/Console rows show
  only Disable/Open, no Access.
- Mobile: filter bar and card actions render usably at 375px width; the kebab menu doesn't clip.
  ✅ verified live at 375×812: search full-width, status pills horizontally scrollable, kebab
  menu opens as a bottom drawer (Access reachable and functional) without any clipping against
  the card list container.
  (`overflow: hidden` avoided on the card list container, matching `UserCard`'s existing
  precedent).
- `pnpm format:check && pnpm lint && pnpm typecheck && pnpm test`

Subsequent tasks added Console sections as part of other epics:

| Task   | Feature added to Console                                                   | Primary epic                          |
| ------ | -------------------------------------------------------------------------- | ------------------------------------- |
| 0.5.11 | Data grants oversight (`/console/data-grants`)                             | [Platform Shell](platform-shell.md)   |
| 0.5.13 | Activity feed (`/console/activity`)                                        | [Activity Logs](activity-logs.md)     |
| 0.6.0  | Role & capability assignment UI                                            | [Users & Auth](users-auth.md)         |
| 0.8.0  | Entitlement oversight, manual payment confirmation, Ed25519 key management | [Monetization](monetization.md)       |
| 0.8.3  | Richer `/api/admin/health` response                                        | [Platform Shell](platform-shell.md)   |
| 0.8.4  | Instance identity / branding section                                       | [Design System](design-system.md)     |
| 9.9    | Email Templates section                                                    | [Design System](design-system.md)     |
| 1.7    | Admin delete user action                                                   | [Users & Auth](users-auth.md)         |
| 1.15   | User groups management                                                     | [Users & Auth](users-auth.md)         |
| 1.16   | Per-user capability grant UI                                               | [Users & Auth](users-auth.md)         |
| 2.21   | Plugin access policy management                                            | [Platform Shell](platform-shell.md)   |
| 3.28   | Plugin catalog and install-time activation model                           | [Plugins Runtime](plugins-runtime.md) |

## Related RFCs

- [RFC 0065 — User groups and plugin access policy](../rfcs/0065-user-groups-plugin-access.md)
- [RFC 0070 — Per-user capability grants](../rfcs/0070-per-user-capability-grants.md)

## Related Docs

- [docs/plugins/console.md](../plugins/console.md) (if it exists)
- [plugin-development.md](../plugin-development.md)
