# RFC 0065 — User groups and plugin access policy

**Status:** Draft\
**Date:** July 2026 (revised July 2026)\
**Author:** kasunben\
**Scope:** `packages/db`, `packages/manifest`, `apps/auth`, `runtime`, `plugins/console`,
`plugins/launcher`, `scripts/install-plugins.ts`, docs; builds on RFC 0021, RFC 0022, RFC 0041,
RFC 0054, RFC 0070, and existing `plugin_status` behavior\
**Incorporated into plan:** Yes — epic tasks 1.15, 1.16, 1.17, 2.21, 2.23, 3.28, 13.7, 13.8, and
15.3. Roadmap slot versions are deferred; prioritized within plugins-runtime.

## Summary

Installed plugins are currently platform-wide: once a plugin is installed and not globally
disabled, it is visible and openable for all active users unless the plugin has bespoke
checks such as admin-only handling. Sovereign needs a platform-owned access layer so an
operator can decide which users may open each installed plugin.

This RFC adds four foundations:

- A **plugin catalog and install-time activation model**: every plugin declared in
  `sovereign.plugins.json` ships bundled inside the platform image; "installing" a plugin is a
  DB-driven activation (not a filesystem/rebuild event), and a newly activated plugin starts
  unavailable to end users until an admin sets its access policy.
- User groups, managed by admins/owners, as reusable audience sets.
- Plugin access policies: `everyone`, `admins`, `selected_users`, `selected_groups`, and
  `disabled` — including a self-service opt-in mode for `selected_users`/`selected_groups`
  policies, gated by a capability defined in RFC 0070.
- Invite-scoped plugin entitlement, so an admin can grant access to specific plugins as part of
  inviting a new user.

`disabled` is the strongest state: the plugin remains installed and manageable from Console, but
no user can open the app until an admin changes the policy. Existing enabled plugins keep working
unchanged under `everyone`; only newly activated plugins default to the stricter posture.

**Explicitly out of scope for this RFC:** true dynamic runtime installation of plugin code not
already bundled in the image (fetching/cloning a plugin into a running instance without a
rebuild/redeploy). That remains a real long-term goal — see "Dynamic runtime install (deferred)"
under Alternatives considered — but it is a build-pipeline and deployment-model change of a
different order of complexity than access control, and is intentionally deferred to a future RFC.

## Motivation

Sovereign is single-tenant and multi-user in v1. Operators need to install one plugin once
and expose it only to the users who should use it. Examples:

- A finance plugin should be visible only to the finance group.
- A support plugin should be visible to selected staff users during rollout.
- An experimental plugin should be installed for validation without appearing for everyone.
- A sensitive plugin should be disabled immediately without uninstalling it or deleting data.
- An operator should be able to browse everything available to install (not just what's
  already cloned into the repo) and activate a plugin for the instance in one action, without a
  redeploy.
- A new hire's invite should be able to say "this person gets Finance and Tasks" up front,
  instead of an admin remembering to grant access after the account exists.
- A trusted user should be able to turn on a plugin they've been made eligible for, without
  filing an admin request, when the operator has decided that's an acceptable self-service
  posture for that plugin.

Launcher-only filtering is not enough. A user who cannot see a plugin must also be denied
direct routes, public API entry points, and generated runtime routes for that plugin.

## Current state

- `plugin_status` provides install/enable state and some admin-only behavior.
- Launcher, sidebar, and mobile nav are built from installed plugin metadata and user
  preferences, but preferences are not authorization.
- RFC 0054 covers plugin-scoped roles and resource grants inside a plugin after a user has
  opened it. It does not answer whether the platform should let that user open the plugin at
  all.
- RFC 0041 provides user directory and member selection primitives, but there is no reusable
  group/audience model yet.
- "Installed" is purely a build-time/filesystem concept today: `scripts/install-plugins.ts`
  clones a plugin declared in `sovereign.plugins.json` into `plugins/<id>/`, and
  `scripts/generate-registry.ts` composes every directory found under `plugins/` into
  `runtime/generated/registry.ts` and the route tree — unconditionally, with no `enabled` check
  at generate time. A plugin's code is already part of the production image as soon as it's
  present under `plugins/`, regardless of whether an admin has ever enabled it.
- There is no runtime "install" action. An admin cannot make a new plugin available to an
  instance without someone running `sv plugin add` / `install-plugins.ts` against the
  repository and rebuilding/redeploying.
- `capabilities.ts` capabilities are role-derived only (RFC 0021) — there is no per-user
  capability grant, so "let this one user self-manage plugin access" cannot be expressed today.
  RFC 0070 adds that mechanism; this RFC depends on it for the self-service policy variant.
- Invites (`apps/auth/src/db.ts`) carry only `{token, email, created_at, expires_at,
consumed_at, invited_by}` — no role or scope field. An invited user's plugin access is decided
  entirely after account creation, by an admin performing a separate grant.

## Proposal

### Plugin catalog and install-time activation

Today, "which plugins exist in the image" and "which plugins an admin has turned on" are the
same question — a plugin is in the image iff someone ran `sv plugin add`/`install-plugins.ts`
and the platform was rebuilt. This RFC splits that into two questions:

1. **What's in the image?** Every plugin declared in `sovereign.plugins.json` — the full
   catalog of plugins the operator's build is willing to offer, not just the ones currently
   active — is cloned and composed at build time, exactly as `install-plugins.ts` and
   `generate-registry.ts` do today. Nothing changes about the build pipeline. Bundling more
   plugins this way adds low-single-digit megabytes per plugin to the standalone trace output
   (existing plugins range roughly 8 KB–570 KB of `app/` source; unique third-party npm
   dependencies not already shared are the larger variable, not plugin source size) —
   negligible next to typical Next.js standalone image sizes, and this is already how disabled
   plugins behave today: shipping in the image is already decoupled from being enabled.
2. **What has an admin turned on for this instance?** A plugin present in the image is
   **inactive** until an admin activates it from Console's catalog browser. Activation is a DB
   action: create the `plugin_status` row (if absent) and run the plugin's migrations
   (`sv plugin migrate` today; the same runner triggered from Console). No rebuild, no restart,
   no filesystem write.

A newly activated plugin's `access_policy` defaults to **`disabled`**: it is installed and
manageable from Console, but not visible or openable to anyone until an admin sets a policy.
This is the "enabled/disabled/open-to-everyone/open-to-selected" configurability the operator
needs — expressed as choosing an `access_policy` at (or shortly after) activation time, not as a
separate on/off flag layered on top of the policy. See "Storage model" below.

Existing plugins that are already active as of this RFC keep their current effective state:
already-`enabled` plugins migrate to `access_policy = everyone` (unchanged behavior), and
already-`disabled` plugins migrate to `access_policy = disabled`. Only plugins activated after
this ships get the disabled-by-default posture.

**Deferred:** installing a plugin _not_ already bundled in the image — i.e., fetching arbitrary
plugin code into a running instance without a rebuild — is a materially larger change (build
pipeline, route composition, dependency installation, and deployment-model implications) and is
intentionally out of scope here. See "Dynamic runtime install (deferred)" below.

### Two enforcement layers

Plugin availability remains platform-owned and is evaluated before any plugin route or SDK
surface is exposed:

1. The plugin must be installed and enabled.
2. The plugin access policy must allow the current user.

Plugin-local authorization remains plugin-owned. Once the platform allows a user to open a
plugin, RFC 0054-style plugin roles and grants decide what that user may do inside the
plugin.

### User groups

Add platform-managed user groups as a prerequisite for group-targeted plugin access.

Proposed tables:

```text
user_groups(
  id,
  tenant_id,
  name,
  slug,
  description,
  created_by_user_id,
  created_at,
  updated_at
)

user_group_members(
  tenant_id,
  group_id,
  user_id,
  added_by_user_id,
  added_at
)
```

Groups are administrative audiences, not plugin-domain roles. They should be reusable across
plugin access policies, notification audiences, and future operator workflows.

### Plugin access policies

Add a policy field to plugin status/configuration:

| Policy            | Meaning                                                                                  |
| ----------------- | ---------------------------------------------------------------------------------------- |
| `everyone`        | Any active authenticated user can open the plugin. Default for existing behavior.        |
| `admins`          | Only platform admins and owners can open the plugin.                                     |
| `selected_users`  | Only explicitly granted users can open the plugin.                                       |
| `selected_groups` | Only members of explicitly granted groups can open the plugin.                           |
| `disabled`        | No user can open the plugin. Console can still manage the installed plugin and its data. |

`disabled` is stronger than every other grant. A disabled plugin does not appear in the
Launcher or shell navigation, and direct routes return 404.

For `selected_users` and `selected_groups`, admins and owners are not automatically granted
app access. They can grant themselves access in Console, and that action should be audited.
Console management access is separate from plugin app access.

### Self-service opt-in

Some `selected_users`/`selected_groups` plugins should let eligible users turn the plugin on for
themselves — a support plugin during staff rollout, for example — without filing an admin
request. Rather than adding a third per-user on/off flag alongside install-activation and
access policy, self-service is modeled as the user granting themselves the same
`plugin_access_users` row an admin would otherwise create:

- A plugin's access policy gets an additional `self_service: boolean` flag (default `false`),
  settable by an admin alongside the policy itself.
- When `self_service` is true and the plugin's policy is `selected_users` or `selected_groups`,
  an eligible user (any active user for `selected_users`-self-service; any member of a group the
  admin has flagged as self-joinable for `selected_groups`-self-service) may add themselves to
  the grant table directly, from a plugin-directory browsing surface.
- Performing this self-grant requires the RFC 0070 `plugins:self-manage` capability. A user
  without that capability sees the plugin (if eligible) but has no enable/disable affordance —
  the feature does not exist for them, it is not merely disabled.
- Self-grants are audited identically to admin grants, with the granting actor recorded as the
  user themselves.
- Revoking a self-granted plugin is the same self-service action in reverse (remove the user's
  own `plugin_access_users` row); an admin can also revoke it directly at any time regardless of
  who granted it.

This keeps a single entitlement model (one grants table, one resolver) instead of a second
per-user "is it currently on" layer that would have to be reconciled against entitlement.

### Invite-scoped plugin entitlement

An admin creating an invite (`POST /api/admin/invites`, `apps/auth/app/api/admin/invites/route.ts`)
may optionally include a `plugins` scope: a list of plugin IDs to grant the invited user
`selected_users` access to at account-creation time, resolved via the same grant tables this RFC
introduces.

- `invites` gains a nullable `plugins` column (JSON array of plugin IDs). Absent/empty means "no
  invite-scoped grants" — entirely backward compatible with today's `{email}`-only invites.
- The register flow (`runtime/app/register/page.tsx` and its consuming action) reads the
  invite's `plugins` scope on successful registration and inserts a `plugin_access_users` row
  per listed plugin, with `granted_by_user_id` set to the inviter.
- A plugin ID in the invite scope that is not currently `selected_users`/`selected_groups`
  (e.g. it's `everyone` or `disabled`) is a no-op grant for that plugin — the invite scope
  grants eligibility, it does not override the plugin's own access policy.
- The invite-creation UI (Console "invite user" flow) gets a plugin multi-select, backed by the
  same catalog/access surfaces as the per-plugin Access section.

### Storage model

Extend the existing plugin status/configuration persistence instead of introducing a
separate installation concept.

Proposed additions:

```text
plugin_status.access_policy
plugin_status.self_service   -- boolean, default false; only meaningful for selected_users/selected_groups

plugin_access_users(
  tenant_id,
  plugin_id,
  user_id,
  granted_by_user_id,   -- the user themselves for self-service grants
  granted_at
)

plugin_access_groups(
  tenant_id,
  plugin_id,
  group_id,
  granted_by_user_id,
  granted_at
)

invites.plugins   -- nullable JSON array of plugin IDs; resolved into plugin_access_users at registration
```

The current enabled/disabled flag should migrate cleanly:

- Existing enabled plugins use `access_policy = everyone`.
- Existing disabled plugins either remain `enabled = false` with an effective disabled state
  or migrate to `access_policy = disabled`.
- The admin UI should present one coherent disabled concept to operators.
- Plugins activated after this ships default to `access_policy = disabled` (see "Plugin catalog
  and install-time activation" above) rather than `everyone` — this is a deliberate behavior
  change for newly activated plugins only, not a retroactive change to what's already running.

### Authorization resolver

Centralize the check so Launcher, middleware, API routes, and Console summaries all agree.

```text
canOpenPlugin(user, plugin):
  if plugin is not installed or not enabled:
    return false
  if plugin.access_policy == disabled:
    return false
  if plugin.access_policy == everyone:
    return user is active
  if plugin.access_policy == admins:
    return user is platform admin or owner
  if plugin.access_policy == selected_users:
    return user has direct plugin access grant
  if plugin.access_policy == selected_groups:
    return user belongs to a granted group
  return false
```

The resolver should return enough metadata for Console to explain why a plugin is or is not
available, but route guards should not expose private policy details to unauthorized users.

### Runtime enforcement

Apply the resolver to every platform-owned entry point:

- Launcher app grid.
- Sidebar and mobile navigation.
- `/api/plugins` and any plugin registry endpoint exposed to authenticated users.
- Root plugin resolution and fallback.
- Generated plugin route eligibility in runtime middleware.
- Public API namespace delegation where authenticated plugin APIs are routed.

Denied direct plugin app routes should return 404. This keeps restricted plugin existence
from being disclosed to users who are not allowed to open it.

### Console UX

Console gets a **plugin catalog browser**, separate from the existing per-plugin management
list: every plugin declared in `sovereign.plugins.json` (bundled in the image, per "Plugin
catalog and install-time activation" above), showing which are already active and which are not
yet. Activating a plugin runs its migrations and immediately prompts the admin for an initial
access policy (defaulting the selector to `disabled`, matching the storage default) instead of
leaving that as a follow-up step.

Console plugin management gets an Access section for each installed plugin:

- Policy selector: Everyone, Admins and owners, Selected users, Selected groups, Disabled.
- A self-service toggle, enabled only for Selected users/Selected groups policies, with copy
  explaining it requires the acting user to hold the plugins:self-manage capability (RFC 0070).
- User picker for `selected_users`, backed by the user directory primitives.
- Group picker for `selected_groups`.
- Effective access summary and empty-state warnings.
- Clear copy that managing a plugin from Console does not automatically grant app access.
- Audit events for policy changes and user/group grant changes, including self-service
  grants/revocations (attributed to the acting user, distinguishable from admin-initiated
  grants).

The Console "invite user" flow gets an optional plugin multi-select, applied as the invite's
`plugins` scope (see "Invite-scoped plugin entitlement" above).

Console also gets user group management:

- Create, rename, and describe groups.
- Add/remove users.
- Show where a group is used by plugin access policies.
- Prevent accidental deletion of an in-use group unless the admin explicitly confirms the
  impact.

### Root plugin behavior

If the configured root plugin is not openable by the current user, runtime should fall back
to Launcher. If Launcher is also inaccessible or no plugins are available, show a platform
owned "No apps available" state rather than leaking inaccessible plugin names.

### Manifest defaults

No manifest-level default access policy is required for v1. Access is operator policy, not a
developer guarantee. A future manifest hint may be considered later for install-time Console
recommendations, but the platform must treat operator configuration as authoritative.

## Alternatives considered

### Per-user only

Direct per-user grants are simple but do not scale for real teams. They are useful for
exceptions and rollout, but groups should be the primary reusable audience primitive.

### Groups only

Groups-only access is clean but too rigid. Operators often need to test a plugin with one
user or grant temporary access without creating a permanent group.

### Deny overrides

Allow/deny matrices add complexity and make effective access harder to reason about. This
RFC intentionally starts with one positive policy plus the hard `disabled` state. A
"block specific users from an otherwise-open plugin" requirement is satisfiable without a deny
list: move the plugin from `everyone` to `selected_users`/`selected_groups` and grant everyone
except the blocked user(s). That's more admin effort for a large allow-list against a small
block-list, but it keeps the resolver a single positive check with no precedence rules between
allow and deny. If real usage shows the block-list case is common and the allow-list workaround
is unworkable at scale, revisit as a follow-up amendment rather than complicating the v1
resolver.

### Dynamic runtime install (deferred)

An admin could install a plugin not already bundled in the image — the running instance fetches
the plugin's source (from a registry entry or arbitrary repository), installs its dependencies,
regenerates routes, and restarts/rebuilds — all without a human running `sv plugin add` and
redeploying. This is the more expansive interpretation of "browse and install any available
plugin," and it's a real long-term goal for Sovereign's plugin ecosystem.

It's deferred here because it's a different kind of change: today plugin routes are a **build
artifact** (`scripts/generate-registry.ts` composes `plugins/*/app/` into route groups before
`next build`; the Docker image is otherwise immutable — see Dockerfile:44-46's explicit choice
not to ship plugin source/`node_modules` into the runner stage). Making install-without-redeploy
work means either writable plugin code inside a running production container (in tension with
the immutable-image deployment model) or an admin-triggered CI rebuild+redeploy with a
"pending restart" UI state — both are build-pipeline/deployment-model decisions with their own
security, versioning, and rollback questions, not access-control questions. This RFC's
DB-activation model (bundle everything cataloged, activate via DB) delivers the "browse and
install" _experience_ the operator wants today without touching the build pipeline; true dynamic
code-fetching install is left for a future RFC once there's a concrete need it can't cover.

### Launcher-only filtering

Hiding apps from Launcher would improve ergonomics but would not be authorization. Direct
routes and plugin APIs must enforce the same policy.

### Per-user installation

Installing separate plugin copies per user conflicts with Sovereign's platform-plugin model
and creates avoidable upgrade/data duplication problems.

### Use plugin-scoped roles only

RFC 0054 is still needed for inside-plugin permissions, but platform plugin access must be
enforced before plugin code runs.

## Open questions

- ~~Should `selected_users` and `selected_groups` stay separate policy values, or should the
  final schema use one `selected` policy that supports both grant types?~~ **Resolved:** keep
  them separate. Merging adds a code path that always has to check both grant tables regardless
  of which policy is active, for a scenario (mixing individual users into a group-based policy)
  that's already reachable today by adding the individual to a group.
- Should plugin manifests support an optional access-policy hint for install-time defaults,
  while keeping operator policy authoritative? Still open; not required for v1 (see "Manifest
  defaults" above).
- ~~When an admin/owner can manage but not open a plugin, should Console show a disabled "Open"
  button with the reason, or hide it entirely?~~ **Resolved:** show it disabled, with the reason.
  An admin managing a plugin already knows it exists (they're looking at its Console page); a
  disabled button with an explanation is more useful than hiding an affordance the admin
  otherwise expects to be there, and it's consistent with the 404-to-avoid-disclosure principle
  applying only to users who don't already have management visibility.
- What cache invalidation mechanism should be used so policy changes take effect immediately
  across middleware, shell navigation, and API routing? Still open — resolve by reusing whichever
  mechanism `plugin_status`'s existing enabled/disabled flag already relies on
  (`runtime/src/plugin-status.ts`) rather than introducing a second invalidation path for the new
  `access_policy`/grant tables.

## Adoption path

1. Add user groups and Console group management.
2. Add the plugin access schema (including `self_service` and `invites.plugins`), migration,
   and centralized resolver.
3. Add the plugin catalog browser and DB-driven activation flow (migrations-on-activate,
   disabled-by-default policy).
4. Enforce access in runtime routing, Launcher, shell navigation, and plugin API delegation.
5. Add Console plugin Access management, including the self-service toggle and the invite
   plugin scope.
6. Land RFC 0070 (per-user capability grants) far enough to gate `plugins:self-manage`, or ship
   self-service disabled-by-default until it lands.
7. Add regression tests for every policy, including direct-route denial, root-plugin fallback,
   self-service grant/revoke, and invite-scope resolution at registration.
8. Update operator and plugin developer docs to distinguish platform app access from
   plugin-scoped authorization, and to document the catalog/activation model.

This RFC has no `@sovereignfs/sdk` or `@sovereignfs/ui` surface changes and no manifest schema
change (see "Manifest defaults"); it is an internal `packages/db`/`runtime`/`apps/auth`/Console
change.

## Changelog

- 2026-07 — Drafted after deciding that plugin visibility must become platform-enforced
  access control, backed by user groups and explicit plugin policies.
- 2026-07 (revision) — Added the plugin catalog/install-time activation model (disabled-by-default
  for newly activated plugins, addressing the "browse and install" and "configurable default
  scope" requirements without a deny-override matrix); added self-service opt-in for
  selected_users/selected_groups gated by the new RFC 0070 capability-grant mechanism; added
  invite-scoped plugin entitlement; resolved three of the four open questions; documented dynamic
  runtime install as an explicitly deferred future RFC.
