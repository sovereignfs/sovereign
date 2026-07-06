# RFC 0065 — User groups and plugin access policy

**Status:** Draft\
**Date:** July 2026\
**Author:** kasunben\
**Scope:** `packages/db`, `runtime`, `plugins/console`, `plugins/launcher`, docs; builds
on RFC 0021, RFC 0022, RFC 0041, RFC 0054, and existing `plugin_status` behavior\
**Incorporated into plan:** Yes — epic tasks 1.15, 2.21, and 13.7. Roadmap slot
versions are deferred.

## Summary

Installed plugins are currently platform-wide: once a plugin is installed and not globally
disabled, it is visible and openable for all active users unless the plugin has bespoke
checks such as admin-only handling. Sovereign needs a platform-owned access layer so an
operator can decide which users may open each installed plugin.

This RFC adds two foundations:

- User groups, managed by admins/owners, as reusable audience sets.
- Plugin access policies: `everyone`, `admins`, `selected_users`, `selected_groups`, and
  `disabled`.

`everyone` is the default for existing behavior. `disabled` is the strongest state: the
plugin remains installed and manageable from Console, but no user can open the app until an
admin changes the policy.

## Motivation

Sovereign is single-tenant and multi-user in v1. Operators need to install one plugin once
and expose it only to the users who should use it. Examples:

- A finance plugin should be visible only to the finance group.
- A support plugin should be visible to selected staff users during rollout.
- An experimental plugin should be installed for validation without appearing for everyone.
- A sensitive plugin should be disabled immediately without uninstalling it or deleting data.

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

## Proposal

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

### Storage model

Extend the existing plugin status/configuration persistence instead of introducing a
separate installation concept.

Proposed additions:

```text
plugin_status.access_policy

plugin_access_users(
  tenant_id,
  plugin_id,
  user_id,
  granted_by_user_id,
  granted_at
)

plugin_access_groups(
  tenant_id,
  plugin_id,
  group_id,
  granted_by_user_id,
  granted_at
)
```

The current enabled/disabled flag should migrate cleanly:

- Existing enabled plugins use `access_policy = everyone`.
- Existing disabled plugins either remain `enabled = false` with an effective disabled state
  or migrate to `access_policy = disabled`.
- The admin UI should present one coherent disabled concept to operators.

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

Console plugin management gets an Access section for each installed plugin:

- Policy selector: Everyone, Admins and owners, Selected users, Selected groups, Disabled.
- User picker for `selected_users`, backed by the user directory primitives.
- Group picker for `selected_groups`.
- Effective access summary and empty-state warnings.
- Clear copy that managing a plugin from Console does not automatically grant app access.
- Audit events for policy changes and user/group grant changes.

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
RFC intentionally starts with one positive policy plus the hard `disabled` state.

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

- Should `selected_users` and `selected_groups` stay separate policy values, or should the
  final schema use one `selected` policy that supports both grant types? The UI can still
  present the current five choices either way.
- Should plugin manifests support an optional access-policy hint for install-time defaults,
  while keeping operator policy authoritative?
- When an admin/owner can manage but not open a plugin, should Console show a disabled
  "Open" button with the reason, or hide it entirely?
- What cache invalidation mechanism should be used so policy changes take effect immediately
  across middleware, shell navigation, and API routing?

## Adoption path

1. Add user groups and Console group management.
2. Add the plugin access schema, migration, and centralized resolver.
3. Enforce access in runtime routing, Launcher, shell navigation, and plugin API delegation.
4. Add Console plugin Access management.
5. Add regression tests for every policy, including direct-route denial and root-plugin
   fallback.
6. Update operator and plugin developer docs to distinguish platform app access from
   plugin-scoped authorization.

## Changelog

- 2026-07 — Drafted after deciding that plugin visibility must become platform-enforced
  access control, backed by user groups and explicit plugin policies.
