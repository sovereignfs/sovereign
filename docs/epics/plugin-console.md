# Epic: Plugin — Console

> The admin control plane — user management, plugin management, tenant settings, system health, and operator tooling.

## Status

⏳ In Progress

## Overview

Console is a `type: platform`, `adminOnly` plugin that ships with Sovereign. It gives `platform:admin` and `platform:owner` users a unified control surface: manage users and invites, enable/disable plugins, configure tenant settings and root plugin, inspect system health, manage instance identity/branding, manage entitlements, and view the platform-wide activity feed. Console also renders remove UX for community plugins; installation itself is an operator action performed with the `sv plugin add` CLI (or `sovereign.plugins.json`), not from Console.

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

#### ✅ 13.5 — Console plugin workflow coverage

**Status (August 2026): shipped — workstream 0012 leg 1.** Added
`app/plugins/__tests__/toggle-actions.test.ts` (enable/disable),
`app/users/__tests__/actions.test.ts` (invite creation and cancellation,
role-change guardrails, deactivation, the owner-cannot-be-deleted guard),
and `app/settings/__tests__/actions.test.ts` (branding/settings updates,
admin-only behavior).

**Two real, live authorization gaps were found and fixed while writing this
coverage, not invented as test scenarios:**

1. `resetMfaAction` (`app/users/actions.ts`) called only `requireSession()` —
   every sibling action in the file (`toggleActiveAction`, `changeRoleAction`,
   `vouchAction`, `deleteUserAction`) checks `hasCapability(session,
'user:manage')` as well. Since server actions are reachable by action id
   independent of the Console page's `adminOnly` gate
   (`docs/architecture-rules.md`), any authenticated non-admin user could
   reset MFA on any other account. Fixed: now checks `user:manage` like its
   siblings.
2. Almost every action in `app/settings/actions.ts` had the same gap, and it
   was worse there — `patchSettings` (backing tenant name, invite-only,
   example-apps visibility, root plugin, push relay) and the direct-fetch
   branding/logo/favicon/provider-config actions all attached
   `SOVEREIGN_ADMIN_KEY` on the caller's behalf with no capability check at
   all. Only `updateSmtpSettingsAction`/`testSmtpSettingsAction` had the
   correct gate. Any authenticated non-admin user could previously rename
   the instance, disable invite-only, change the root plugin, overwrite
   branding, or save/test/delete OAuth provider configs (which carry secret
   values). Fixed: general settings now require `instance:configure`;
   provider-config actions require `instance:configure-secrets`, matching
   the pre-existing SMTP precedent (`platform:owner` only).

Both fixes have regression tests in the new suites proving the check exists
and rejects an unprivileged session before any admin API call is made.

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

#### ✅ 13.6 — Console primitive migration, Phase 2

**Status (August 2026): shipped — workstream 0012 leg 7, scoped.** Of the
four deliverables below, three were in scope for that leg (see its own
Decisions locked entry, which formally narrowed this task's obligations for
leg 7 before work started); the nav/header item was explicitly deferred to a
follow-up even though its blocker has since shipped — see that item's own
note below for why. Same "workstream-scoped ✅, tracked follow-up for the
rest" pattern leg 3 used for Task 0.14 (packages-only typecheck
performance).

- Confirm-dialog migration: **already done** before this leg started — every
  confirm prompt in the plugin (`RemovePluginButton.tsx`,
  `UserActionButtons.tsx`, `UserCard.tsx`) already used `@sovereignfs/ui`'s
  `ConfirmDialog`; `console.module.css` already carried a comment recording
  this. `RevokeSessionButton.tsx`/`PluginInstallPanel.tsx`, named in this
  deliverable's original text, no longer exist under those names — folded
  into the components above during earlier work not tracked against this
  task. No code change needed; this bullet is closed by inspection.
- Table styling: **stays bespoke, documented in code**
  (`console.module.css`, the comment above `.tableCard`) rather than
  migrated. `@sovereignfs/ui`'s `Table`/`TableHeaderCell`/`TableCell` exist,
  but `TableHeaderCell`/`TableCell` don't merge an incoming `className` with
  their own base style (they spread `...rest` — including `className` —
  _after_ their own hardcoded class on the same element, so a caller's
  className fully replaces the primitive's th/td styling instead of layering
  on it). Adopting them as-is would mean losing this table's specific
  uppercase/tracked header treatment; adopting them with a full override
  would mean re-declaring everything the primitive already sets. This is
  also the single highest-traffic admin-destructive surface in Console
  (deactivate/delete/reset-MFA/revoke-vouch/delete render inside these
  cells) — not the place to trade a cosmetic unification for layout-shift
  risk on those controls.
- Icon-only/text+icon action button consolidation: **done**, as a
  documented local pattern (the deliverable's own second option, not a new
  `Button` variant — adding one to the published, NFR-04-constrained
  `@sovereignfs/ui` package for a Console-only need was disproportionate).
  `.iconBtn`/`.iconBtnReactivate`/`.iconBtnDanger` (30×30 bordered,
  three tones) and `.pluginCardBtnToggle`/`.pluginCardBtnRemove` (padded
  text+icon, two tones) each collapsed from full near-duplicate
  declarations to one shared base class + tone-only overrides via CSS
  Modules `composes` (the same convention `apps/auth/app/auth.module.css`'s
  `.linkButton` already uses) — zero TSX changes, every call site still
  imports the same `styles.iconBtn`/etc. names. `.copyButton`, named in the
  original deliverable text, was already dead code (no definition, no
  usage) — nothing to consolidate. `.userCardMenuBtn` stays outside this
  family on purpose (documented in code): a borderless 32×32 menu trigger,
  not a bordered discrete action button — a different control that only
  superficially looks similar. Verified the CSS Modules `composes` output
  is correct by inspecting the compiled bundle directly, not just trusting
  the source: `styles.iconBtnDanger` resolves to
  `"console_iconBtnDanger__<hash> console_iconBtnBase__<hash>"`, both
  classes applied together as `composes` requires.
- Nav (`NavTabs`) / page header (`PageHeader`) migration: **deferred, not
  done in this leg.** The epic text above names Task 9.13 as the blocker —
  that reference is itself stale doc drift: 9.13 is "Subtle Sovereign
  attribution (RFC 0027)," ❌ rejected, unrelated. The actual blocker was
  Task **9.15** ("NavTabs Link support + PageHeader heading level"), ✅
  shipped since this epic text was written. Workstream 0012's own scoping
  (locked before this leg started, see `docs/workstreams/0012-engineering-
hygiene.md`'s Decisions locked table) explicitly left this item out of
  leg 7 regardless, to keep that leg's diff to the three items above — not
  re-litigated here. Tracked as a follow-up, not silently dropped.

**Live browser verification done.** The local dev database only had real
(non-test) accounts with no known credentials, and `sv seed` correctly
refused to plant known-password test accounts over them — so a disposable
account was created through the normal `/register` flow, then promoted to
`platform:owner` with a single `UPDATE "user" SET role = ...` against the
dev sqld instance (additive only; no existing row touched), used to sign in
and exercise Console's Users page, then deleted afterward along with its
session/account rows. Confirmed against the actual running app, not just
static analysis: the icon-only action buttons (deactivate, reset MFA,
vouch, manage capabilities, delete) render correctly with the consolidated
`composes`-based CSS — proper borders, spacing, and tone colors, delete in
red; the `ConfirmDialog` for both "Delete user" and "Deactivate user"
render and function correctly (backdrop, title, message, Cancel/danger
action); clicking through an actual deactivate → reactivate cycle on a
disposable test account worked end-to-end, including the reactivate icon
button (`.iconBtnReactivate`, the specific class this leg consolidated)
rendering and functioning correctly afterward. No regression found.

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
  `PageHeader` — both **blocked on Task 9.15** (NavTabs needs Next `<Link>`
  support; PageHeader needs a configurable heading level) landing first.
- `.rolePill`/`.rolePills` (Console-specific role-assignment control) stay
  local — not a generic primitive candidate.

**Dependencies:** Task 9.12 (design system stabilization) ✅, Task 9.15
(NavTabs Link support + PageHeader heading level) ✅ for the nav/header
items — shipped since this task was written, but not pulled into workstream
0012 leg 7's scope; see that leg's own status note above.

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

---

#### ✅ 13.10 — Add route-level test coverage for every runtime/app/api/admin/* handler

**Goal:** Close the coverage gap left by the 0.94.15 fix: there is no `__tests__` directory anywhere under `runtime/app/api/admin` despite 36 `route.ts` files there (50 exported HTTP handlers total), every one of which is supposed to start with `checkAdminKey(request)` as its sole authorization boundary — middleware deliberately excludes `/api/admin` from session verification (`docs/architecture-rules.md`'s `/api/*` namespace bullet). The only existing test near this area, `runtime/src/__tests__/admin-guard.test.ts`, exercises the `checkAdminKey()` helper function in isolation (4 tests) and never imports or calls a single route handler. `connections/route.ts` and `data-grants/route.ts` are the exact two routes that shipped a real production authorization bypass once already — both trusted a forgeable `x-sovereign-user-role` header until fixed to call `checkAdminKey` (documented in this repo's own version-history record, and in the doc comments those two files now carry at `connections/route.ts:7-16` and `data-grants/route.ts:6-15`) — and that fix is currently protected by nothing but those comments. A future edit to any of these 36 files (a copy-pasted new route missing the check, or the guard reordered after a DB read) would pass the full existing suite undetected. This task adds a single shared, parametrized test that discovers every admin route handler at run time and asserts the guard runs first, so the class of bug is closed generically rather than route-by-route.

**Deliverables:**

- Add `runtime/src/__tests__/admin-route-guards.test.ts`. Discover every `route.ts` under `runtime/app/api/admin` at test-run time via `import.meta.glob('../../app/api/admin/**/route.ts')`, mirroring the existing directory-walk pattern in `runtime/src/__tests__/api-namespace.test.ts:70-75` (`readdirSync`/`fileURLToPath` two levels up from `runtime/src/__tests__/`) — a new route is covered automatically, no per-route test edit needed as the surface grows. Assert the glob finds exactly 36 files (current count, verified via `find runtime/app/api/admin -name route.ts | wc -l`) so a future glob/rename mismatch that silently drops files fails loudly instead of quietly shrinking coverage.
- For every discovered module, invoke each of its exported `GET`/`POST`/`PUT`/`PATCH`/`DELETE` handlers with `new Request(url, { method })` carrying no `Authorization` header. Build a placeholder second arg `{ params: Promise.resolve({...}) }` by extracting `[id]`/`[groupId]`/`[userId]`/`[capability]` segment names from the file's own glob key via `/\[(\w+)\]/g` — every dynamic admin route already declares `params: Promise<{...}>` (Next 15 async-params convention, confirmed across all 14 dynamic route files, e.g. `runtime/app/api/admin/groups/[id]/members/[userId]/route.ts:8`). Assert `response.status === 403` and a JSON body of exactly `{ error: 'forbidden' }` — the literal shape `checkAdminKey` returns at `runtime/src/admin-guard.ts:17`. Assert the total handler count found is 49 (the 50 exported HTTP handlers across all 36 files, minus the one exempted route below).
- Exclude `email-templates/preview/route.ts`'s `GET` from the generic loop — it deliberately authorizes via `verifySession` + an `instance:configure` capability check instead of `checkAdminKey`, documented in its own comment at `runtime/app/api/admin/email-templates/preview/route.ts:27-36` (a browser `<iframe src>` can't attach an `Authorization` header). Cover it with a dedicated test in the same file: `vi.mock('@/src/middleware/session', () => ({ verifySession: async () => null }))`, then assert the route's `GET` (`route.ts:37-41`) still returns 403 with no session — without this mock the route falls through to a real `fetch` against `SOVEREIGN_AUTH_URL` in `verifySession` (`runtime/src/middleware/session.ts:82-88`), which is slow/flaky in a unit test even though it fails closed.
- Add a second pass over the same generic loop with `delete process.env.SOVEREIGN_ADMIN_KEY` (mirroring `runtime/src/__tests__/admin-guard.test.ts:34-37`'s existing pattern for the helper-level test), asserting `response.status === 503` — the misconfigured branch at `runtime/src/admin-guard.ts:10-14`.
- `vi.mock('@sovereignfs/db', ...)` and `vi.mock('@/src/db', ...)` in the same file so every function either module exports rejects with a distinct sentinel error (e.g. `new Error('TEST: DB touched before checkAdminKey')`) if called. This turns a hypothetical future 'guard reordered after a DB read' regression into an immediate, clearly-attributed assertion failure instead of a slow/hanging connection attempt against whatever `DB_DIALECT`/`POSTGRES_DB_URL` happens to be set (or unset) in the running test environment — scoped to just these two DB entry-point modules rather than mocking each of the ~20 other local helper modules (`@/src/activity`, `@/src/connections`, `@/src/plugin-catalog`, etc.) the 36 routes collectively import, since none of those are reachable unless the guard has already been bypassed.
- No `vitest.config.ts` change required — `runtime/src/__tests__/**/*.test.{ts,tsx}` is already in the root `vitest.config.ts`'s `test.include` (line 48); `import.meta.glob`'s dynamic import correctly resolves the `@/*` alias and TypeScript syntax inside each `route.ts` (verified: `GET`/`POST` exports came back correctly typed from a glob-loaded module in a throwaway run against this exact repo before writing this spec).

**Dependencies:** None.

**SRS reference:** None — this is remediation of an already-fixed production bug, not new design. Closes the test-coverage gap left by the 0.94.15 authorization-bypass fix (documented in this repo's CLAUDE.md version-history record, and in the doc comments that fix left behind at `runtime/app/api/admin/connections/route.ts:7-16` and `runtime/app/api/admin/data-grants/route.ts:6-15`). See also `docs/architecture-rules.md`'s "Server actions must authorize inside the action" bullet, which documents the same authorization-boundary class of finding for Console's own server actions (`plugins/console/app/**/actions.ts`'s `adminFetch`/`SOVEREIGN_ADMIN_KEY` pattern) that this task generalizes to route-level regression tests.

**Review checklist:**

- `pnpm exec vitest run runtime/src/__tests__/admin-route-guards.test.ts` passes: covers all 36 `route.ts` files under `runtime/app/api/admin`, all 49 `checkAdminKey`-guarded handlers (403 + `{error:'forbidden'}` with no auth header; 503 with `SOVEREIGN_ADMIN_KEY` unset), and the 1 `verifySession`-guarded `email-templates/preview` `GET` (403 with no session) — 50 handlers total.
- Regression check, done once and reverted before committing: temporarily move `checkAdminKey(request)` below `await getPlatformDb()` in one route (e.g. `runtime/app/api/admin/connections/route.ts`) and confirm the new test fails — proves it actually detects a reordered guard rather than trivially always passing because nothing reaches the mocked DB calls.
- New-route check, done once and reverted before committing: add a throwaway `route.ts` under `runtime/app/api/admin/` with a `GET` handler that omits the `checkAdminKey` call, and confirm the suite fails with zero edits to the test file itself — proves the `import.meta.glob` discovery covers routes added after this task lands, not just the 36 that exist today.
- `runtime/src/__tests__/admin-guard.test.ts` is left unmodified — this task adds route-level coverage, it doesn't replace the existing helper-level unit test of `checkAdminKey` itself.
- `pnpm format:check && pnpm lint && pnpm typecheck && pnpm test` all pass.

---

#### ✅ 13.11 — Extend users/actions.test.ts to cover every exported action's capability gating

**Goal:** Close the remaining test-coverage gap in plugins/console/app/users/**tests**/actions.test.ts that let two real, still-open authorization bugs ship undetected. The file's own doc comment (lines 216-225) documents a real bug found once - resetMfaAction had no hasCapability check at all - and adds a "refuses a session without user:manage" test for every sibling action that has the check. But the test file imports only 6 of actions.ts's 12 exported async functions (sendInviteAction, cancelInviteAction, changeRoleAction, toggleActiveAction, resetMfaAction, deleteUserAction); vouchAction (actions.ts:211), revokeVouchAction (actions.ts:245), grantCapabilityAction (actions.ts:430), and revokeCapabilityAction (actions.ts:447) are correctly gated on user:manage in source but have zero test coverage, so a future regression on any of them (the exact class of bug resetMfaAction had) would ship silently. Worse: re-reading the current source (not assuming the audit's own note that a prior hotfix already landed) shows sendInviteAction (actions.ts:340-414, invoked directly from invite-form.tsx via useActionState) and listUserCapabilitiesAction (actions.ts:422-428, invoked directly from CapabilitiesButton.tsx:23) still call only sdk.auth.requireSession() with no hasCapability check at all - the identical live authorization gap resetMfaAction once had, still unfixed as of this task being drafted, confirmed via git log/git branch -a showing no in-flight work against this file beyond the last merged commit (c98bed0e). Per docs/architecture-rules.md's "Server actions must authorize inside the action; middleware path gating is not enough" rule, any authenticated non-admin user can currently call sendInviteAction directly to create an invite and grant it access to arbitrary installed plugins, or call listUserCapabilitiesAction to read any other user's granted capabilities. This task fixes both gaps (a two-line change each, following the exact pattern every sibling action already uses) and then extends the test file to cover all 12 exported functions uniformly, so the established "refuses a session without <capability>" pattern can never again miss a sibling action.

**Deliverables:**

- Add `if (!sdk.auth.hasCapability(session, 'user:manage')) return { success: false, error: 'Insufficient privileges to invite users.' };` to sendInviteAction (plugins/console/app/users/actions.ts, right after the requireSession() call at line 344) - a return, not a throw, matching this action's existing InviteState success/failure contract (the same shape already used for its 'Email is required.' and 'Failed to create invite: ...' cases), unlike every void-returning sibling action.
- Add `if (!sdk.auth.hasCapability(session, 'user:manage')) throw new Error('Insufficient privileges to view capabilities.');` to listUserCapabilitiesAction (actions.ts:422-428, right after requireSession()) - a throw, matching the void-action convention; CapabilitiesButton.tsx:23-25's existing `.catch(() => setGrants([]))` already handles a thrown rejection gracefully, so no client-side change is required.
- Import vouchAction, revokeVouchAction, grantCapabilityAction, revokeCapabilityAction, listUserCapabilitiesAction, and listInvitablePluginOptions into actions.test.ts alongside the 6 already-imported functions, so all 12 of the file's exported async functions are exercised.
- Add a describe('vouchAction - ...') block and a describe('revokeVouchAction - ...') block, each with a 'refuses a session without user:manage' test (hasCapability returns false, fetch never called, rejects.toThrow('Insufficient privileges to manage users.')) plus a happy-path test hitting POST /api/admin/users/:id/vouch and DELETE /api/admin/users/:id/vouch, mirroring the existing toggleActiveAction block's shape (actions.test.ts:185-214).
- Add a describe('grantCapabilityAction - ...') block and a describe('revokeCapabilityAction - ...') block, each with a 'refuses a session without user:manage' test asserting the action-specific message ('Insufficient privileges to grant capabilities.' / 'Insufficient privileges to revoke capabilities.') plus a happy-path test against POST/DELETE /api/admin/users/:id/capabilities(/:capability).
- Add a describe('listUserCapabilitiesAction - ...') block with a regression test for the newly-added capability check (rejects.toThrow when hasCapability returns false, no fetch) and a success-path test asserting it maps GET /api/admin/users/:id/capabilities's { capability }[] response to a flat GrantableCapability[], following the same regression-comment pattern already used for resetMfaAction (actions.test.ts:216-225) since this is the same bug class.
- Extend the existing describe('sendInviteAction - invite creation flow') block with a 'refuses a session without user:manage, returning a failure state rather than throwing' test asserting sendInviteAction(null, formData({...})) resolves to { success: false, error: 'Insufficient privileges to invite users.' } and that fetch is never called - distinct from every other capability test in the file because this action reports failure via its return value, not a thrown error.
- Add a describe('listInvitablePluginOptions - ...') block with a plain success-path test (no capability-refusal test - this action has no hasCapability check by design, only requireSession, since it exposes plugin id/name metadata, not user data) asserting it filters out ids present in CHROME_PLUGIN_IDS.
- Update the doc comment at actions.test.ts:216-225 to note the pattern is now applied uniformly across every exported action (not just resetMfaAction), and add a short comment above the two new checks in actions.ts explaining they close the same class of gap this file's tests now catch generically.

**Dependencies:** None - self-contained within plugins/console/app/users/actions.ts and its test file. Note: the audit finding this task is based on assumed sendInviteAction's and listUserCapabilitiesAction's missing capability checks would already be fixed by a separate hotfix PR landing before this task started; re-reading the current source found that fix never shipped (no branch or commit beyond c98bed0e touches this file), so this task's deliverables include that fix rather than depending on a nonexistent prior task.

**SRS reference:** None - this is remediation of a live authorization gap, not new design. Grounded in docs/architecture-rules.md's existing rule "Server actions must authorize inside the action; middleware path gating is not enough," and directly extends the precedent already documented in actions.test.ts:216-225 for the resetMfaAction regression. RFC 0070 (per-user capability grants) governs grantCapabilityAction/revokeCapabilityAction/listUserCapabilitiesAction's underlying feature but is not itself being changed.

**Review checklist:**

- grep -c 'export async function' plugins/console/app/users/actions.ts (12) matches the number of distinct action names imported at the top of actions.test.ts - no exported action is left untested.
- Calling sendInviteAction with hasCapability mocked to return false resolves to { success: false, error: 'Insufficient privileges to invite users.' } and never calls fetch - verified by the new test, not just by reading the source.
- Calling listUserCapabilitiesAction with hasCapability mocked to return false rejects, and a manual check of CapabilitiesButton.tsx confirms its existing `.catch(() => setGrants([]))` still handles that rejection with no UI-side change needed.
- Every one of vouchAction, revokeVouchAction, grantCapabilityAction, revokeCapabilityAction has both a 'refuses a session without user:manage' test and a happy-path test hitting the correct admin API path/method.
- pnpm exec vitest run plugins/console/app/users/**tests**/actions.test.ts passes with the full new test count.
- pnpm format:check && pnpm lint && pnpm typecheck && pnpm test all pass.
- Manually re-reading actions.ts confirms sendInviteAction and listUserCapabilitiesAction now short-circuit before their first fetch/adminFetch call whenever hasCapability returns false, matching every sibling action's placement (check immediately after requireSession(), before reading formData).

---

#### ✅ 13.12 — Add test coverage for email-templates-actions.ts

**Goal:** Close a test-coverage gap and a live authorization gap in `plugins/console/app/settings/email-templates-actions.ts`, the one Console settings action file Task 13.5's workflow-coverage pass never reached (that task covered `settings/actions.ts`, `users/actions.ts`, and `plugins/toggle-actions.ts` only). `settings/__tests__/actions.test.ts` (188 lines) covers only the sibling `settings/actions.ts`; grepping the repo for `getEmailTemplateCopyAction`, `saveEmailTemplateCopyAction`, or `testSendEmailTemplateAction` outside their own source/consumer files (`email-templates-actions.ts`, `EmailTemplatesForm.tsx`) returns nothing. Worse, the exact authorization-gap pattern Task 13.5 found and fixed elsewhere in this same file family is still live here, confirmed by reading the current source (not assumed from the audit note, which expected a hotfix that `git log -- plugins/console/app/settings/email-templates-actions.ts` shows never landed): `getEmailTemplateCopyAction` (email-templates-actions.ts:24-35) and `testSendEmailTemplateAction` (:72-105) call only `sdk.auth.requireSession()`, with no `hasCapability` check, while `saveEmailTemplateCopyAction` (:43-70) correctly requires `instance:configure`. Since server actions are reachable by action id independent of the Console page's `adminOnly` gate (`docs/architecture-rules.md`), any authenticated non-admin user can currently call `getEmailTemplateCopyAction` directly to read stored email-template copy for any locale, or `testSendEmailTemplateAction` to trigger a real outbound test email through the platform's configured SMTP via `SOVEREIGN_ADMIN_KEY`-backed `adminFetch` — both without `instance:configure`.

**Deliverables:**

- Add a `hasCapability(session, 'instance:configure')` check to `getEmailTemplateCopyAction` in `plugins/console/app/settings/email-templates-actions.ts:24-35`, mirroring `saveEmailTemplateCopyAction:47-50`; return `{ ok: false, error: 'Insufficient privileges to view email templates.' }` before the `adminFetch` call at line 29.
- Add the same `hasCapability(session, 'instance:configure')` check to `testSendEmailTemplateAction` (`email-templates-actions.ts:72-105`) before its `adminFetch` call at line 81, returning `{ ok: false, error: 'Insufficient privileges to change email templates.' }` — reusing `saveEmailTemplateCopyAction`'s existing message verbatim since both actions gate on the same capability.
- Add `plugins/console/app/settings/__tests__/email-templates-actions.test.ts`, mirroring the mock/setup pattern in `settings/__tests__/actions.test.ts:1-35` (`vi.mock('@sovereignfs/sdk', ...)` stubbing `requireSession`/`hasCapability`, a local `formData()` helper, per-test `vi.stubGlobal('fetch', ...)` / `vi.unstubAllGlobals()`).
- Cover capability-gating for all three actions: a session without `instance:configure` returns `{ ok: false, error: ... }` from each (none of these three throw, unlike `requireInstanceConfigure()` in `settings/actions.ts`) and asserts `fetch` was never called.
- Cover `getEmailTemplateCopyAction`'s happy path: a 200 from `GET /api/admin/email-templates?templateId=...&locale=...` (email-templates-actions.ts:29-31) returns `{ ok: true, copy }`; a non-OK response returns `{ ok: false, error: 'Failed to load copy: <status>' }`.
- Cover `saveEmailTemplateCopyAction`'s per-field PATCH loop (:55-69): given a `FormData` with `templateId`, `locale`, and two extra copy fields, assert `fetch` is called once per extra field against `PATCH /api/admin/email-templates` with the matching `{ templateId, locale, field, value }` body, and that a single field failure short-circuits the loop and surfaces that field's own error.
- Cover `testSendEmailTemplateAction`'s three response branches (:90-104): success (`{ ok: true, message: 'Test email sent to <email>.' }`), the `status: 'skipped'` branch (SMTP not configured) returning `{ ok: false, error: 'SMTP is not configured — nothing was sent.' }`, and a `status: 'failed'` / `!res.ok` response surfacing `errorCode`/`error`.
- Add a short doc comment atop the new test file, matching the "Regression coverage for..." convention already used in `settings/__tests__/actions.test.ts:37-49` and `users/__tests__/actions.test.ts:216-225`, naming `getEmailTemplateCopyAction` and `testSendEmailTemplateAction` as the two actions the missing check was found and fixed in, and pointing back to Task 13.5 as the precedent for this exact class of gap.

**Dependencies:** Task 13.5 (Console plugin workflow coverage) — established the vi.mock/formData test-setup pattern this task reuses, and is the direct precedent for the "found and fixed a real authorization gap while writing coverage" narrative (it fixed the identical missing-hasCapability pattern in users/actions.ts and settings/actions.ts but never reached this sibling file). Task 9.9 (email template system, RFC 0031 — the file under test).

**SRS reference:** [RFC 0031](../rfcs/0031-email-templates.md) (email template system, implemented via Task 9.9). The authorization-gap fix itself is remediation, not new design — it applies the existing server-action-authorization rule already codified in `docs/architecture-rules.md` and CLAUDE.md's "Hard architectural rules" section ("Server actions must authorize inside the action; middleware path gating is not enough"), the same rule Task 13.5 applied to `users/actions.ts` and `settings/actions.ts`.

**Review checklist:**

- `pnpm exec vitest run plugins/console/app/settings/__tests__/email-templates-actions.test.ts` passes, covering all three actions' capability gating and their success/failure response branches.
- `getEmailTemplateCopyAction` and `testSendEmailTemplateAction` both reject a session lacking `instance:configure` before calling `adminFetch` — verified by a test asserting the mocked `fetch` was never invoked in that case, matching the existing assertion style in `settings/__tests__/actions.test.ts`.
- No function in `email-templates-actions.ts` calls `adminFetch` (which attaches `SOVEREIGN_ADMIN_KEY` on the caller's behalf) without a preceding `hasCapability` check — grep the file for `adminFetch(` and confirm every call site is reached only after a capability check.
- `pnpm format:check && pnpm lint && pnpm typecheck && pnpm test`

---

#### ✅ 13.13 — Add test coverage for groups/actions.ts and entitlements/actions.ts

**Goal:** Close a coverage gap found during a codebase audit: plugins/console/app/groups/actions.ts (171 lines, 8 exported server actions — createGroupAction, updateGroupAction, deleteGroupAction, listResolvedGroupMembers, searchGroupDirectoryUsers, addGroupMemberAction, removeGroupMemberAction — all routed through a shared requireGroupManageCapability() guard checking user:manage) and plugins/console/app/entitlements/actions.ts (93 lines, 3 exported actions — saveLicenseKeyAction, deleteLicenseKeyAction, grantLicenseAction — each independently checking role:assign inline) are both correctly capability-gated today, but neither directory has a **tests** folder at all, unlike users/**tests**/actions.test.ts, settings/**tests**/actions.test.ts, and plugins/**tests**/{remove,toggle}-actions.test.ts, which at least have partial coverage. This repo has direct, documented history of exactly this class of regression shipping silently and unnoticed — resetMfaAction previously called only requireSession() with no hasCapability check at all (see the regression-test doc comment in plugins/console/app/users/**tests**/actions.test.ts:216-225), caught only once a test was finally written for it — plus the sibling sendInviteAction/listUserCapabilitiesAction/email-templates-actions.ts gaps found in this same audit. Groups and entitlements actions carry the identical risk profile — a capability check that is one accidental refactor away from being silently dropped or weakened, with nothing in CI to catch it — with no test safety net at all right now.

**Deliverables:**

- Add `plugins/console/app/groups/__tests__/actions.test.ts`, mirroring `plugins/console/app/users/__tests__/actions.test.ts`'s structure: `vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))`, `vi.mock('next/headers', ...)` returning a `Headers` with `x-sovereign-user-id` (the `adminFetch` helper at `groups/actions.ts:16-28` reads it), and `vi.mock('@sovereignfs/sdk', ...)` stubbing `sdk.auth.{requireSession,hasCapability}` plus `sdk.directory.{resolveUsers,searchUsers}` (per the existing precedent in `plugins/console/app/plugins/__tests__/toggle-actions.test.ts:16`).
- For every one of the 8 exported actions in `groups/actions.ts` (`createGroupAction`, `updateGroupAction`, `deleteGroupAction`, `listResolvedGroupMembers`, `searchGroupDirectoryUsers`, `addGroupMemberAction`, `removeGroupMemberAction`), add a test asserting the action rejects (throws, for the `void`-returning ones; returns `{ success: false, error: ... }` for `createGroupAction`/`addGroupMemberAction`) when `hasCapability` returns `false`, and that `fetch` is never called in that case — following `users/__tests__/actions.test.ts`'s `expect(fetch).not.toHaveBeenCalled()` pattern.
- For at least one action, assert `hasCapability` is called with `expect.anything(), 'user:manage'` specifically (not a different or absent capability string), matching `users/__tests__/actions.test.ts:238-252`'s `resetMfaAction` regression-test pattern — this is the exact check class that was missing entirely for `resetMfaAction` before it was caught.
- Add at least one happy-path test per action (authorized session, mocked `fetch` via a `mockAdminFetch`-style helper keyed by `METHOD path`) asserting the expected admin API call shape (URL, method, body) and, where applicable, `revalidatePath('/console/groups')` behavior via the successful return value.
- Add `plugins/console/app/entitlements/__tests__/actions.test.ts` covering all 3 exported actions (`saveLicenseKeyAction`, `deleteLicenseKeyAction`, `grantLicenseAction`), asserting each returns `{ ok: false, error: 'Unauthorized — only platform owners can ...' }` (the exact per-action message from `entitlements/actions.ts:15`, `:41`, `:68`) when `hasCapability(session, 'role:assign')` is `false`, without calling `fetch`.
- Add a happy-path test per entitlements action asserting the outbound `fetch` call to `RUNTIME_URL` (`/api/admin/license-keys` POST/DELETE, `/api/admin/entitlements` POST) uses the expected method/body/`Authorization: Bearer <adminKey>` header, and that a non-ok response surfaces the API's `error` field or the `API error ${status}.` fallback (`entitlements/actions.ts:28-31`, `:53-56`, `:86-89`).
- Add a test for `grantLicenseAction`/`saveLicenseKeyAction`/`deleteLicenseKeyAction` covering the `catch` branch (`fetch` rejecting) returning `{ ok: false, error: 'Failed to reach the runtime API.' }`, since this is a distinct code path from a non-ok HTTP response and is currently completely unexercised.
- Run `pnpm --filter console-plugin test` (or the equivalent workspace-scoped Vitest invocation already used by the sibling `__tests__` directories) to confirm both new files pass and are picked up by the existing test glob with no config changes needed.

**Dependencies:** None.

**SRS reference:** None — this is remediation of a test-coverage gap identified in a codebase audit, not new design; no RFC or SRS section defines these actions' behavior beyond the existing capability model (SRS's role/capability system, already implemented).

**Review checklist:**

- `ls plugins/console/app/groups/__tests__ plugins/console/app/entitlements/__tests__` shows an `actions.test.ts` in each.
- Every exported action in both `actions.ts` files has at least one test asserting rejection when the required capability is absent, and that no `fetch` call is made in that case.
- At least one test per file asserts the exact capability string checked (`user:manage` for groups, `role:assign` for entitlements) via `expect(hasCapability).toHaveBeenCalledWith(expect.anything(), '<capability>')`, not just that some capability was checked.
- Deliberately weakening or deleting one of the `requireGroupManageCapability()`/inline `hasCapability` checks in either source file causes the corresponding new test to fail (spot-checked manually, then reverted) — confirming the tests actually exercise the guard rather than mocking around it.
- `pnpm test -- plugins/console/app/groups/__tests__/actions.test.ts plugins/console/app/entitlements/__tests__/actions.test.ts` passes.
- `pnpm format:check && pnpm lint && pnpm typecheck && pnpm test` all pass with no changes to non-test files.

---

#### ✅ 13.14 — Sweep Console's user-facing copy from "plugin" to "app"

**Goal:** Close the naming-convention violation CLAUDE.md calls out by name: "plugin" must never appear in a string the end user reads, yet Console's own copy says it pervasively — the Apps table's heading, search box, empty state, and column header; the entitlements section's heading, body copy, and column header; the settings page's "Example plugins"/"Root plugin" headings and forms; the groups lede; the plugin-access dialog's labels, help text, and warnings; the delete-user confirmations' "plugin data" phrasing; a capability display label; the license generator's error text and selector label; the external-clients page's lede; and the Console home tiles and sub-nav label that all still say "Plugins" instead of "Apps". The sibling `plugins/launcher/app/_components/LauncherOfflineView.tsx` already gets this right ("Your installed apps and tools.", "No apps installed yet"), proving the convention is known and applied elsewhere — it just never made it into Console. Fix by sweeping every `.tsx` file under `plugins/console/app/` for "plugin(s)" in rendered JSX text, `placeholder`, `aria-label`, `title`, and `label` strings, replacing with "app(s)" to match Launcher, while leaving code identifiers (`pluginId`, `PluginRow`, `PluginAccessDialog`, `RemovePluginButton`), the `/console/plugins` route path, the `plugins:self-manage` capability id, and developer-facing comments untouched, per CLAUDE.md's own plugin-vs-app scope table.

**Deliverables:**

- `plugins/console/app/plugins/PluginsTable.tsx`: section heading "Plugins" (line 566) → "Apps"; search `placeholder`/`aria-label` "Search plugins…"/"Search plugins" (467, 471) → "Search apps…"/"Search apps"; empty state "No plugins match your filters." (580) → "No apps match your filters."; table column header "Plugin" (588) → "App"; toggle-button `title` "Disable plugin"/"Enable plugin" (241) → "Disable app"/"Enable app"; disabled-Open `title`s "Open — restricted by this plugin's access policy" (286) and "You are not currently allowed to open this plugin under its access policy." (393) → "app"; `ActivatedPolicyPrompt`'s `FormField label="Who can open this plugin"` (113) → "Who can open this app". Leave `pluginId`/`pluginName` props, `PluginRow`/`PluginStatus` types, and the `/console/plugins` route path untouched — this is a copy-only sweep, not a routing or type-rename change.
- `plugins/console/app/entitlements/EntitlementsSection.tsx`: heading "Plugin entitlements" (87) → "App entitlements"; body copy "...for paid plugins." (89) → "...for paid apps."; table column header "Plugin" (114) → "App".
- `plugins/console/app/settings/page.tsx`: section headings "Example plugins" (110) → "Example apps", "Root plugin" (116) → "Root app".
- `plugins/console/app/settings/SettingsForms.tsx`: `ExampleAppsForm`'s checkbox label "Show example plugins" (158), help text "The bundled reference/demo plugins ship hidden by default. ... individual example plugins from the Plugins page." (160–162), and submit label "Save example plugins" (168) → "apps"/"Apps page" throughout; `RootPluginForm`'s `FormField label="Plugin served at /"` (192) → "App served at /".
- `plugins/console/app/groups/page.tsx`: lede "Groups are reusable audiences for plugin access policies and future operator workflows — not plugin-scoped roles." (48–49) → "app access policies" / "not app-scoped roles".
- `plugins/console/app/plugins/RemovePluginButton.tsx`: `ConfirmDialog title="Remove plugin"` (83) → "Remove app". (The button's own `title={`Remove ${pluginName}`}` at line 57 already uses the resolved name, no change needed.)
- `plugins/console/app/layout.tsx`: sub-nav entry `{ href: '/console/plugins', label: 'Plugins' }` (20) → `label: 'Apps'` (href unchanged).
- `plugins/console/app/page.tsx` (Console home tiles): tile `title: 'Plugins'` (17) → `'Apps'`; tile descriptions "Define reusable audiences for plugin access policies." (13), "View installed plugins and enable or disable them." (18), "...and the root plugin." (23) → "app"/"apps"; page lede "...manage users, control installed plugins, and review system health." (36) → "control installed apps".
- `plugins/console/app/plugins/PluginAccessDialog.tsx`: `FormField label="Who can open this plugin"` (383) → "this app"; "Disabled is the strongest state — no one can open this plugin..." (403–404) → "this app"; "Allow eligible users to self-service enable/disable this plugin (requires the `plugins:self-manage` capability)" (420–421) → "this app" — keep the `<code>plugins:self-manage</code>` capability id itself unchanged, it's a real system capability constant (`runtime/src/capabilities.ts:29`), not prose; "...nobody can open this plugin until you grant at least one." (429–430) → "this app"; reword the policy-section intro "Managing a plugin here does not automatically grant you app access — Console management and plugin app access are separate." (380–381), which already mixes both terms confusingly — rewrite for clarity as well as compliance, not a mechanical find-replace (e.g. distinguish "managing this app's access policy here" from "the app's own permission grant").
- `plugins/console/app/groups/ManageGroupDialog.tsx`: delete-confirmation copy "...If the group is used by a plugin access policy, deletion is blocked until you confirm again." (247–248) → "an app access policy".
- `plugins/console/app/users/UserCard.tsx`: delete-user confirmation "...profile, activity, plugin data, and files. Cannot be undone." (266) → "app data".
- `plugins/console/app/users/UserActionButtons.tsx`: delete-user confirmation "...profile, activity history, plugin data, and files. This cannot be undone." (95) → "app data".
- `plugins/console/app/users/CapabilitiesButton.tsx`: capability display label `'plugins:self-manage': 'Self-service plugin enable/disable'` (14) → `'Self-service app enable/disable'`; keep the `'plugins:self-manage'` map key unchanged (it's the actual `GrantableCapability` id, not display text).
- `plugins/console/app/entitlements/LicenseGenerator.tsx`: `setGenError('Selected plugin not found.')` (238) → `'Selected app not found.'`; selector `<label htmlFor="gen-plugin">Plugin</label>` (326) → "App" (keep the `gen-plugin` element id unchanged).
- `plugins/console/app/oauth-clients/page.tsx`: lede "Let a standalone app on its own domain — not a Sovereign plugin — offer 'log in with Sovereign' against this instance." (29) — reword to avoid "plugin" without losing the architectural distinction being made (external OAuth client vs. an installed Sovereign app), e.g. "...not an installed Sovereign app — offer...".
- Run `grep -rniE "plugin" plugins/console/app --include="*.tsx"` after the sweep and triage every remaining hit: acceptable survivors are code identifiers/props (`pluginId`, `pluginName`, `PluginRow`, `PluginAccessDialog`, `RemovePluginButton`, `isPlatformType`), the `/console/plugins` route path, the `plugins:self-manage` capability id, the `sv keys rotate-blind-index --plugin` CLI flag reference in `FieldEncryptionStatus.tsx:60`, and dev-facing comments (`layout.tsx:9-14`, `plugins/page.tsx` doc comments) — everything else must be gone.
- Bump `plugins/console/manifest.json`'s `version` field (currently `0.5.5`) per this repo's "Plugins version only their `manifest.json`" convention — this is user-facing copy shipped inside a plugin, not a platform `package.json` change.

**Dependencies:** None. This is a copy-only sweep of existing, already-shipped Console UI (Tasks 13.1–13.9 and later Console additions) — no data model, API, or routing changes, and no other in-flight task blocks it.

**SRS reference:** None — this is remediation of the naming-convention rule already stated in `CLAUDE.md` ("Naming conventions" section, which names Console's copy explicitly), not new design or an RFC-tracked feature. The correct pattern this task brings Console in line with already exists in `plugins/launcher/app/_components/LauncherOfflineView.tsx` ("Your installed apps and tools.", "No apps installed yet").

**Review checklist:**

- `grep -rniE "plugin" plugins/console/app --include="*.tsx"` shows only the allowlisted survivors (code identifiers/props, the `/console/plugins` route, the `plugins:self-manage` capability id, the `--plugin` CLI flag reference, and comments) — no remaining hits inside JSX text, `placeholder`, `aria-label`, `title`, or `label` strings.
- Live check, desktop and mobile widths: Console's sub-nav strip and home-page tile both read "Apps", not "Plugins" (`layout.tsx:20`, `page.tsx:17`).
- Live check: the Apps table's heading, search placeholder/aria-label, empty-filter state, and column header all read "App(s)", and the row-level Disable/Enable and disabled-Open tooltips say "app" not "plugin".
- Live check: Settings → "Example apps" and "Root app" sections, including the checkbox label, help text, and save-button text, read "app(s)" throughout; Entitlements' heading, body copy, and column header read "App"/"apps"; Groups' lede reads "app access policies"/"app-scoped roles"; the plugin-access dialog's labels/warnings and the delete-user confirmation dialogs all read "app" not "plugin".
- `plugins/console/manifest.json`'s `version` was bumped from the pre-change value, per the "plugins version only their manifest.json" convention — `plugins/console/package.json`'s version was NOT touched (stays pinned at `0.0.0`).
- No unrelated string was changed — `pluginId`/`pluginName` props, `PluginRow`/`PluginStatus`/`PluginAccessDialog`/`RemovePluginButton` identifiers, the `/console/plugins` URL, and the `plugins:self-manage` capability id are byte-for-byte unchanged; `git diff` touches only string literals in rendered JSX/attributes.
- `pnpm format:check && pnpm lint && pnpm typecheck && pnpm test` all pass.

---

#### ✅ 13.15 — Convert togglePluginAction to the ActionResult/useActionState convention

**Goal:** Goal: `togglePluginAction` (`plugins/console/app/plugins/actions.ts:51-61`) is the enable/disable control wired to both the desktop icon-button and mobile card toggle on the Apps page — one of the most frequently used controls in Console — and it still throws a raw `Error` on a non-ok admin-API response (`throw new Error(`Failed to toggle plugin: ${res.status}`)`, line 59) instead of returning the shared `{success, error?}` `ActionResult` shape this file already uses for its sibling actions (`ActivatePluginActionState`, `PluginAccessActionState`). Both call sites (`PluginsTable.tsx:231` desktop, `PluginsTable.tsx:372` mobile) invoke it via a bare `<form action={togglePluginAction}>` with no `useActionState`, no pending state, and no inline error rendering — a failed toggle currently has no visible failure mode at all beyond Next.js's generic default error page, since `plugins/console/app` has no `error.tsx`/`global-error.tsx` (confirmed: none exists under that tree) to even give it plugin-scoped copy. The fix pattern already exists one function away in the same file/component: `activatePluginAction` returns `ActivatePluginActionState`, and `PluginsTable.tsx`'s `useActivate` hook (lines 145-161) plus `PluginAccessDialog.tsx`'s `UserPicker`/group-picker forms (lines 37, 68, 121-123) both show the real, already-adopted convention — `useActionState<T | null, FormData>(action, null)`, a `pending` flag driving the button's disabled/label state, and `{state && !state.success && <p className={styles.errorText}>{state.error}</p>}` for the inline error. This task converts `togglePluginAction` to that same shape and wires both row/card UIs through it, and adds the missing plugin-scoped `error.tsx` boundary so an unexpected throw (e.g. the `requirePluginManage()` authorization check, which correctly keeps throwing per the sv-ui-design error-UX convention) degrades to plain copy instead of the bare platform 500.

**Deliverables:**

- Add `export type PluginToggleActionState = { success: true } | { success: false; error: string };` to `plugins/console/app/plugins/actions.ts`, next to the existing `ActivatePluginActionState`/`PluginAccessActionState` type declarations.
- Convert `togglePluginAction` (`plugins/console/app/plugins/actions.ts:51-61`) from `(formData: FormData): Promise<void>` to `(_prevState: PluginToggleActionState | null, formData: FormData): Promise<PluginToggleActionState>` — keep `await requirePluginManage()` throwing as-is (authz failures are correctly unexpected/unreachable from normal UI per the sv-ui-design error-UX convention), but replace the `if (!res.ok) throw new Error(...)` on line 59 with `if (!res.ok) return { success: false, error: `Failed to toggle plugin: ${res.status}` };`, then `revalidatePath('/console/plugins'); return { success: true };` on the success path.
- In `plugins/console/app/plugins/PluginsTable.tsx`, add a `useToggle(row: PluginRow)` hook mirroring `useActivate` (lines 145-161) but built on the real `useActionState` hook (`import { useActionState } from 'react'`, matching `PluginAccessDialog.tsx:37`): `const [state, formAction, pending] = useActionState<PluginToggleActionState | null, FormData>(togglePluginAction, null);` — return `{ state, formAction, pending }`.
- `DesktopRow` (lines 163-298): replace `<form action={togglePluginAction} ...>` (line 231) with `<form action={formAction} ...>` from the new hook; add `disabled={pending}` to the `<button type="submit">` (line 238) so a double-submit can't fire while the toggle is in flight; add `{state && !state.success && <p className={styles.errorText}>{state.error}</p>}` inside `.rowActions` after the form, mirroring the existing `{error && <p className={styles.errorText}>{error}</p>}` pattern already used in the `inactive` branch at line 227.
- `MobileCard` (lines 300-440): same conversion for its own `<form action={togglePluginAction}>` (line 372) — wire through `formAction`/`pending`/inline error inside `.pluginCardActions`, matching the desktop treatment.
- Add `plugins/console/app/error.tsx` — a `'use client'` plugin-scoped error boundary (`export default function ConsoleError({ error, reset }: { error: Error & { digest?: string }; reset: () => void })`) using `@sovereignfs/ui`'s `EmptyState` (`heading`, `description`, `action={<Button onClick={reset}>Try again</Button>}`) rather than hand-rolled CSS, following `plugins/warden/app/error.tsx`'s existing shape and doc-comment convention (cites the sv-ui-design error-UX split between expected/inline and unexpected/boundary).
- Update `plugins/console/app/plugins/__tests__/toggle-actions.test.ts`'s `'throws on a non-ok response rather than silently succeeding'` test (lines 84-94): it currently asserts `togglePluginAction(formData(...))` rejects with `'Failed to toggle plugin: 500'` — this must change to call `togglePluginAction(null, formData(...))` and assert the resolved value is `{ success: false, error: 'Failed to toggle plugin: 500' }`; update the other four tests in the same file to pass `null` as the first argument to match the new signature (they don't need new assertions, just the call-site signature fix).
- `runtime/app/(platform)/(plugins)/console/plugins/actions.ts` and `PluginsTable.tsx` are gitignored, `pnpm generate`-composed copies of the two files above (`runtime/app/(platform)/(plugins)/.gitignore`) — do not hand-edit them; they pick up the change automatically on the next `pnpm generate`/`pnpm dev`.

**Dependencies:** None — plugins/console/app/plugins/actions.ts and PluginsTable.tsx already exist in their current form as of Task 13.9 (Console Plugins page: unified filterable table), which this task's file references build on but do not otherwise depend on.

**SRS reference:** None — this is remediation, not new design. The target convention is documented in `.claude/skills/sv-ui-design/references/writer-first-patterns.md` ("Error UX convention": expected failures return the shared ActionResult shape and render via `useActionState`; unexpected failures throw and are caught by a plugin-scoped `error.tsx`) and is already implemented by sibling code in this same file/directory (`activatePluginAction` + `useActivate`, `PluginAccessDialog.tsx`'s `useActionState` forms) — this task brings `togglePluginAction` in line with an existing, already-adopted local pattern rather than introducing a new one.

**Review checklist:**

- `togglePluginAction` no longer contains a `throw` on the non-ok-response path — `grep -n 'throw new Error' plugins/console/app/plugins/actions.ts` shows only the pre-existing authz throw inside `requirePluginManage`, not one inside `togglePluginAction` itself.
- `plugins/console/app/plugins/__tests__/toggle-actions.test.ts` passes with the updated signature and the rewritten non-ok-response test asserting a returned `{success:false, error}` instead of a rejected promise.
- Live-verified in the preview browser: disabling then re-enabling a plugin from the Apps page (desktop icon button and mobile card, both ≥768px and <768px) shows the button/icon in a disabled/pending state for the duration of the request and the row's status flips correctly on success.
- Live-verified: temporarily forcing the admin API call to fail (e.g. an invalid `pluginId` or a stubbed 500) renders the inline `styles.errorText` message next to the toggle control on both desktop and mobile, without navigating away from `/console/plugins` or losing the rest of the table's state.
- `plugins/console/app/error.tsx` exists and is reachable — live-verified by temporarily throwing inside a Console plugins page component and confirming the plugin-scoped `EmptyState`/'Try again' boundary renders instead of Next.js's default error page; reverted after confirming.
- `pnpm format:check && pnpm lint && pnpm typecheck && pnpm test` all pass.
- `pnpm generate` run at least once after the change and `runtime/app/(platform)/(plugins)/console/plugins/actions.ts`/`PluginsTable.tsx` confirmed to have picked up the new signature (spot-check, not a diff — these files are gitignored and not committed).

---

#### ✅ 13.16 — Fix Console's Activity log empty-state/error-state handling

**Goal:** Fix `plugins/console/app/activity/page.tsx`'s `getActivity()` (lines 30-48), which catches both a non-OK `GET /api/admin/activity` response and a thrown fetch error, logs each only via server-side `console.error` (invisible in the browser), and returns `{ events: [], total: 0, limit: PAGE_SIZE, offset }` in both cases — a shape indistinguishable from a genuinely empty activity log. `ActivityPage` (lines 97-104) then renders one unconditional "No activity recorded yet." message whenever `events.length === 0`, so an admin hitting a real backend failure (misconfigured `SOVEREIGN_ADMIN_KEY`, `GET /api/admin/activity` erroring, a network blip) sees no error at all — just a misleading claim that the instance has no activity history. The same message also displays unchanged when a search query (`q`) legitimately returns zero matches, which the codebase already has a filter-aware pattern for elsewhere (`PluginsTable.tsx:580`'s "No plugins match your filters.") that this page doesn't follow.

**Deliverables:**

- In `plugins/console/app/activity/page.tsx:23-28`, widen `ActivityResponse` (or introduce a distinct return type for `getActivity()`) to carry an `error: string | null` field, so a failed fetch is distinguishable in the caller from a genuinely empty result — currently both paths return the identical `{ events: [], total: 0, limit: PAGE_SIZE, offset }` shape.
- Set that field in both failure branches of `getActivity()` (`page.tsx:39-42` for the non-OK response, `page.tsx:44-47` for the thrown fetch error) with a short admin-facing message (e.g. `Unable to load activity log (HTTP ${res.status}).` / `Unable to load activity log.`), keeping the existing `console.error(...)` calls as-is — this adds a user-visible signal, it doesn't replace the server-side log.
- Import `Alert` from `@sovereignfs/ui` in `page.tsx` (currently only imports `Badge` at line 2) and render `<Alert variant="error">{error}</Alert>` above the results in `ActivityPage` (`page.tsx:97-99`) whenever `getActivity()` returned an error — `Alert` is RSC-safe (no `'use client'` directive) and is documented in `packages/ui/src/components/Alert/Alert.tsx:31-34` as the component for exactly this case ("form-level errors, or explaining an empty/blocked state"), so no new component is needed.
- Replace the single unconditional empty-state branch at `page.tsx:101-104` (`events.length === 0` → always "No activity recorded yet.") with two cases: keep "No activity recorded yet." only when `q` is empty and there was no fetch error; when `q` is non-empty and zero events returned with no error, show a filter-aware message instead (e.g. "No activity matches your search."), mirroring the existing pattern in `plugins/console/app/plugins/PluginsTable.tsx:580` (`No plugins match your filters.`).
- When `getActivity()` returned an error, suppress the empty-state paragraph entirely (the `Alert` banner is the only messaging shown) rather than rendering both the error banner and "No activity recorded yet." underneath it.

**Dependencies:** None. Standalone bug fix in already-shipped Console code (Task 13.4 introduced the Activity page; RFC 0005 shipped the underlying activity log).

**SRS reference:** [RFC 0005](../rfcs/0005-activity-log.md) — Activity log (Implemented). This task fixes an error/empty-state handling gap in Console's consumption of that already-shipped feature; it introduces no new design.

**Review checklist:**

- With `GET /api/admin/activity` forced to return a non-OK status (e.g. temporarily set `SOVEREIGN_ADMIN_KEY` to a wrong value in the runtime's env so `checkAdminKey` rejects it), loading `/activity` in Console shows an inline error banner (`Alert variant="error"`), not "No activity recorded yet."
- With a real activity log containing events, searching for a term that matches none of them (`?q=<nonsense>`) shows the new filter-aware empty-state copy, not "No activity recorded yet."
- With a genuinely empty activity log and no search query, the page still shows "No activity recorded yet." (no regression of the true-empty case).
- The fetch failure is still logged server-side via `console.error` in addition to the new browser-visible banner — the existing debugging signal isn't lost.
- `pnpm format:check && pnpm lint && pnpm typecheck && pnpm test`

---

#### 📋 13.17 — Console shell: overlay → default + `ThreeColumnLayout` sidebar/main + mobile drilldown

**Goal:** Console moves from `shell: "overlay"` to `shell: "default"` and its
`layout.tsx` is rebuilt around `@sovereignfs/ui`'s `ThreeColumnLayout`: a
persistent vertical section nav (desktop sidebar, column 1) replaces today's
horizontal scrollable tab strip, routed page content is column 2. Mobile gets
no persistent sidebar — the bare `/console` route (Overview) becomes a
drill-down index (grouped icon+label+chevron rows, tap → push into a section)
and every other section gets a `‹ Console` back link above its content. Both
desktop's sidebar and mobile's index are built on a new `packages/ui`
component, `NavList` (task 9.28), which must land first. Full technical
detail, the exact section grouping, and the `ResponsiveSurface`/
`data-plugin-fullbleed` structure are in
[workstream 0022](../workstreams/0022-console-shell-and-three-column-layout.md)
leg 1 — this entry tracks the task, not the design.

**Deliverables:**

- `plugins/console/manifest.json`: `"shell": "default"`; remove
  `shellConfig.overlaySize`.
- `plugins/console/app/layout.tsx`: `ResponsiveSurface` fork — desktop
  renders `ThreeColumnLayout` (`NavList variant="static"` sidebar + main
  column, `data-plugin-fullbleed` root); mobile renders `children` with a
  conditional back link, no sidebar.
- `plugins/console/app/page.tsx` (Overview): `ResponsiveSurface` fork —
  desktop keeps a dashboard card grid (extended to all 11 sections, not
  today's 5); mobile renders `NavList variant="drilldown"`.
- `plugins/console/app/console.module.css`: remove the dead `.nav`/`.header`/
  `.headerHiddenOnMobile` tab-strip rules and their mobile media queries; add
  the new fullbleed/sidebar/mobile-frame rules.
- `docs/architecture-rules.md`'s "(Account, Console)" overlay-size reference
  narrows to "(Account)"; `docs/plugins/console.md` and this file's own
  Overview section updated to describe `shell: "default"`.
- `docs/epics/platform-shell.md` task 2.5/2.19 get a forward pointer to this
  task/workstream (not a rewrite of their own completed-task history).
- `plugins/console/manifest.json` version bump (manifest-only, per this
  repo's plugin-versioning convention) + platform root `package.json` minor
  bump.

**Dependencies:** Task 9.28 (`NavList` component) must ship first.

**SRS reference:** None — see workstream 0022's "Why no RFC."

**Review checklist:** See workstream 0022 leg 1's full technical notes and
"Do not proceed if" condition; at minimum, `pnpm format:check && pnpm lint &&
pnpm typecheck && pnpm test` pass, `pnpm generate` no longer emits a
`@modal/(.)console/*` tree, and `__tests__/e2e/console.spec.ts`/
`console-auditor.spec.ts`/`console-settings.spec.ts` pass against the new DOM.

---

#### ✅ 13.18 — Console Users page: selection-driven detail column

**Goal:** Add a 3rd `ThreeColumnLayout` column to `/console/users`: selecting
a row shows a detail pane with role assignment, capabilities, and status
actions, replacing `CapabilitiesButton`'s dialog and the per-row action
buttons. Full technical detail in
[workstream 0022](../workstreams/0022-console-shell-and-three-column-layout.md)
leg 2 (see that leg's Outcome note for exactly what shipped).

**Dependencies:** Task 13.17.

**SRS reference:** None — see workstream 0022's "Why no RFC."

**Review checklist:**

- `CapabilitiesButton.tsx`'s dialog is gone from the desktop table — its
  content moved into `UserCapabilitiesFields.tsx`, rendered inline in
  `UserDetailPane.tsx`; `CapabilitiesButton` itself survives only as
  `UserCard.tsx`'s mobile button+`Dialog` wrapper around that same content.
- Selecting a row navigates to `?page=<n>&user=<id>`; closing the detail
  pane (`<Link replace>`) drops `user` while preserving `page`. Verified live
  in the browser: selecting a user (desktop, ≥900px viewport) shows the
  detail pane with role, capabilities, and status actions; the owner account
  shows a protected/no-actions state; closing clears the pane back to a
  full-width table; a hard reload of a `?user=<id>` URL renders the detail
  pane directly (linkable/refreshable).
- Below 900px (but still above the 768px mobile breakpoint —
  `DETAIL_COLLAPSE_BREAKPOINT_PX` in `layout.tsx`), the detail column
  collapses to sidebar + table only, verified live via viewport resize.
- Mobile (<768px) card list and its `CapabilitiesButton` dialog are
  unaffected — verified live.
- `pnpm format:check && pnpm lint && pnpm typecheck && pnpm test` pass; a
  full `pnpm --filter runtime build` compiled every `/console/*` route
  cleanly (the check that actually exercises the real, composed plugin
  files — `runtime/tsconfig.json` excludes them from its own `tsc --noEmit`
  scope).
- `plugins/console/manifest.json` bumped `0.6.0` → `0.7.0`.

---

#### ✅ 13.19 — Console Groups page: selection-driven detail column

**Goal:** Add a 3rd `ThreeColumnLayout` column to `/console/groups`:
selecting a group shows a detail pane, replacing `ManageGroupDialog`.
`CreateGroupDialog` (create-new) is evaluated independently — see workstream
0022 leg 3's technical notes for how leg 2 resolved the equivalent
`InviteDialog` question before assuming the same answer applies unchanged.

**Dependencies:** Task 13.18.

**SRS reference:** None — see workstream 0022's "Why no RFC."

**Review checklist:** See workstream 0022 leg 3's technical notes; at
minimum, `ManageGroupDialog.tsx`'s dialog is gone and
`pnpm format:check && pnpm lint && pnpm typecheck && pnpm test` pass.

**Outcome:** `ManageGroupDialog`'s body (details form, members list/picker,
danger zone) was extracted into `GroupDetailFields.tsx`, reused by both a
slimmed `ManageGroupDialog` (kept mobile-only) and a new `GroupDetailPane.tsx`
(desktop 3rd column), mirroring task 13.18's `UserCapabilitiesFields` split
exactly. `CreateGroupDialog` was confirmed live to need no change — it stays
a plain dialog, same reasoning as `InviteDialog`. Leg 2's `.userDetail*` CSS
classes were generalized to `.detail*` (dropping the `user` prefix) since
this is the second of four legs reusing the identical shape;
`UserDetailPane.tsx` was updated to the renamed classes in the same change.
Groups has no separate mobile/desktop render fork (unlike Users) — one shared
card grid handles both, with the selection `<Link>`/chevron indicator and the
`ManageGroupDialog` trigger each CSS-gated to their own breakpoint
(`.cardChevron`/`.cardManageMobile`, 769px, matching the existing
768px mobile breakpoint used elsewhere in this file). Verified live end to
end against the dev server: creating a group, selecting it to open the
desktop detail pane, editing details, the empty members state, the delete
confirmation flow (group and its detail pane both disappear on confirm), the
900px detail-collapse breakpoint, and the mobile Manage dialog opening
unaffected. `pnpm --filter runtime build` confirmed `/console/groups`
compiles (composed plugin directories are excluded from `runtime`'s own
`tsc --noEmit` scope). `plugins/console/manifest.json` bumped `0.7.0` →
`0.8.0`.

---

#### ✅ 13.20 — Console Plugins/Apps page: selection-driven detail column

**Goal:** Add a 3rd `ThreeColumnLayout` column to `/console/plugins`:
selecting a plugin row shows a detail pane, replacing `PluginAccessDialog`.
Must coexist with `PluginsTable.tsx`'s existing filter-bar/examples-toggle
state without either resetting the other unexpectedly. Full technical detail
in workstream 0022 leg 4.

**Dependencies:** Task 13.19.

**SRS reference:** None — see workstream 0022's "Why no RFC."

**Review checklist:** See workstream 0022 leg 4's technical notes; at
minimum, `PluginAccessDialog.tsx`'s dialog is gone, changing a filter while a
plugin is selected doesn't silently clear the selection unless the plugin
drops out of the filtered set, and
`pnpm format:check && pnpm lint && pnpm typecheck && pnpm test` pass.

**Outcome:** `PluginAccessDialog`'s body (permissions list, policy select,
selected users/groups grant lists) was extracted into `PluginAccessFields.tsx`,
reused by both a slimmed `PluginAccessDialog` (kept mobile-only, unchanged
kebab-menu integration) and a new `PluginDetailPane.tsx` (desktop 3rd
column) — the same split legs 2/3 established. Scoped narrower than legs 2/3
on purpose: Activate/Toggle enable-disable/Open/Remove stay row-level
actions rather than moving into the pane too, since those (especially
"Open") are frequent, low-risk actions an admin should reach without opening
a detail pane every time, and this leg's own technical note names only
`PluginAccessDialog`'s content as moving — a deliberately narrower scope
than the fuller action consolidation legs 2/3 did, given this leg was
already flagged as the most complex of the four. A row is selectable
(`isSelectable()`) under exactly the same condition `PluginAccessDialog`
used to render (`!row.isChrome && status is enabled/disabled`) — chrome
plugins and inactive/incompatible rows show no selection Link or chevron.
Selection lives in `?plugin=<id>`, resolved server-side in `page.tsx`
against the full (unfiltered) row list — `PluginsTable`'s own client-only
filter/search/examples-toggle state (never URL-synced) is a separate React
component instance that isn't remounted by the parent's re-render, so
neither state resets the other. Verified live end to end against the dev
server, exactly the coexistence risk this leg's own technical note flagged:
selected a row (Warden), typed a search query that filtered it out of the
visible table, and confirmed the detail pane stayed fully intact and
functional (including live-editing its access policy) the entire time;
clearing the filter brought the row back with its `.trSelected` highlight
still applied. Also verified the access-policy select switching to
"Selected users" correctly reveals the picker/grant-list sections inline in
the pane, the Close link clears `?plugin=`, and the mobile kebab menu's
"Access" entry still opens `PluginAccessDialog` unaffected.
`plugins/console/manifest.json` bumped `0.8.0` → `0.9.0`.

---

#### 📋 13.21 — Console External clients page: selection-driven detail column

**Goal:** Add a 3rd `ThreeColumnLayout` column to `/console/oauth-clients`:
selecting a client shows a detail pane for secret rotation/revocation.
`OAuthClientsClient.tsx`'s internal structure hasn't been read as part of
this task's planning — read it first; if client secrets are only ever shown
once at creation with no later "view" state to select into, escalate for a
design call rather than forcing a detail pane where there's nothing to show.
Full technical detail in workstream 0022 leg 5.

**Dependencies:** Task 13.20.

**SRS reference:** None — see workstream 0022's "Why no RFC."

**Review checklist:** See workstream 0022 leg 5's technical notes; at
minimum, `pnpm format:check && pnpm lint && pnpm typecheck && pnpm test` pass.

---

## Related RFCs

- [RFC 0065 — User groups and plugin access policy](../rfcs/0065-user-groups-plugin-access.md)
- [RFC 0070 — Per-user capability grants](../rfcs/0070-per-user-capability-grants.md)

## Related Docs

- [docs/plugins/console.md](../plugins/console.md) (if it exists)
- [plugin-development.md](../plugin-development.md)
