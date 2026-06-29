---
rfc: 0054
title: Plugin-scoped roles and grants
status: Draft
date: June 2026
author: kasunben
scope: packages/sdk, runtime, packages/db, packages/manifest, plugins/account, plugins/console, docs; builds on RFC 0021, RFC 0022, RFC 0005, RFC 0007, RFC 0033, and RFC 0051
incorporated_into_plan: 'Yes — epic task 1.13'
---

# RFC 0054 — Plugin-Scoped Roles and Grants

## Summary

Add a standard authorization model for plugins that need their own roles,
capability bundles, and resource-scoped grants. The platform keeps global
platform roles (`platform:owner`, `platform:admin`, `platform:auditor`,
`platform:user`) as-is, while plugins can define and enforce plugin-local roles
such as `project-owner`, `editor`, `agent`, `accountant`, or `viewer`.

This extends RFC 0022. Today plugins can declare capability names and
auto-grant simple capabilities to all users. This RFC defines the missing
middle: how plugins represent role presets, assign grants to users, scope grants
to plugin-owned resources, audit changes, and expose enough metadata for shared
UI without moving plugin-domain authorization into global platform roles.

## Motivation

Many serious plugins need authorization below the platform role layer:

- a board/project plugin needs owner/editor/viewer membership per project;
- a task plugin needs list owner/member roles;
- a CRM plugin may need shared-directory owner/editor/viewer roles;
- a shared inbox needs owner/agent/viewer roles per inbox;
- an invoicing plugin may need billing-profile owner/editor/accountant/viewer
  roles;
- a checkout plugin may need operator/viewer roles for submitted orders.

These roles are not platform roles. A `platform:user` may be a project owner in
one plugin and a viewer in another. A `platform:admin` should not automatically
become an editor of every private plugin resource unless an explicit, audited
override policy says so.

Without a shared model, every plugin will invent its own grant tables, role
names, assignment UI, audit behavior, export semantics, and fallback rules. That
works for one plugin at a time, but it creates inconsistent UX and makes
cross-plugin composition harder.

## Current state

- RFC 0021 implemented platform roles and platform capabilities. The resolver
  lives in `runtime/src/capabilities.ts` and derives capabilities from the
  current platform role.
- Middleware injects `x-sovereign-user-capabilities` into plugin requests. It
  combines platform-role capabilities with plugin-declared capabilities that
  have `defaultGrant: "all"`.
- RFC 0022 implemented manifest-declared plugin capabilities. The manifest
  schema supports a `capabilities` object whose local keys are namespaced to
  `<pluginId>:<capName>`.
- The generate script emits `runtime/generated/plugin-capabilities.ts` with
  `PLUGIN_CAPABILITIES` and `ALL_GRANTED_PLUGIN_CAPS`.
- `sdk.auth.hasCapability(session, cap)` checks only the flat capability list
  already present in the session headers.
- `defaultGrant: "none"` means the plugin must manage grants itself. There is no
  platform-standard table shape, SDK helper, role preset declaration, scoped
  grant convention, audit expectation, or shared assignment UI.
- The middleware route gate intentionally does not enforce plugin capabilities.
  Plugin feature authorization happens inside plugin server components, route
  handlers, and actions.

## Proposed design

### 1. Keep platform and plugin authorization separate

Platform roles continue to answer platform questions:

- can this user access Console?
- can this user manage users?
- can this user enable/disable plugins?
- can this user configure instance settings?

Plugin roles answer plugin-domain questions:

- can this user edit this project?
- can this user view this shared inbox?
- can this user issue invoices from this billing profile?
- can this user convert this checkout order?

Plugin role checks must not be performed in Edge middleware. They require
plugin-owned resource context and usually a database lookup.

### 2. Manifest role presets

Extend plugin manifests with optional `roles` metadata:

```jsonc
{
  "capabilities": {
    "project.view": { "description": "View a project." },
    "project.edit": { "description": "Edit a project." },
    "project.manage-members": { "description": "Manage project members." },
  },
  "roles": {
    "project-owner": {
      "description": "Full control of a project.",
      "capabilities": ["project.view", "project.edit", "project.manage-members"],
      "scope": "resource",
    },
    "project-editor": {
      "description": "Edit project content.",
      "capabilities": ["project.view", "project.edit"],
      "scope": "resource",
    },
    "project-viewer": {
      "description": "Read-only project access.",
      "capabilities": ["project.view"],
      "scope": "resource",
    },
  },
}
```

Role names are local to the plugin and namespaced by the platform for display
and audit as `<pluginId>:<roleName>`.

The manifest declares vocabulary only. It does not grant anyone access.

### 3. Grant shape

Define a standard grant model:

```ts
interface PluginGrant {
  id: string;
  tenantId: string;
  pluginId: string;
  userId: string;
  role?: string;
  capabilities?: string[];
  scope: {
    type: 'plugin' | 'resource';
    resourceType?: string;
    resourceId?: string;
  };
  grantedByUserId: string;
  grantedAt: string;
  expiresAt?: string;
  revokedAt?: string;
  metadata?: unknown;
}
```

Rules:

- `role` is a local plugin role name.
- `capabilities` are local plugin capability names.
- A grant may use a role, explicit capabilities, or both.
- `plugin` scope applies to the whole plugin for that user.
- `resource` scope applies to a plugin-owned resource such as project, list,
  shared inbox, billing profile, or directory.
- The provider plugin owns resource validation.

### 4. Storage model

The recommended first implementation is **plugin-owned grants with
platform-standard helpers**:

- grants live in plugin-owned tables, because the plugin owns the resource model;
- the SDK provides types/helpers and optional table helpers;
- Account/Console can read manifest role metadata, but do not need to understand
  every plugin resource;
- plugins expose assignment UI where the domain context is clear.

This avoids moving all plugin-domain authorization into platform tables while
still standardizing behavior.

Future implementations may add a platform grant registry for plugin-scope grants
only, but resource-scope grants should remain plugin-owned unless a later RFC
proves a safe shared model.

### 5. SDK helpers

Add `sdk.authz` for server-side plugin code:

```ts
await sdk.authz.hasGrant({
  userId,
  capability: 'project.edit',
  resource: {
    type: 'project',
    id: projectId,
  },
});

await sdk.authz.requireGrant({
  capability: 'project.manage-members',
  resource: {
    type: 'project',
    id: projectId,
  },
});
```

For plugin-owned storage, the SDK helper can delegate to a provider registered
by the plugin:

```ts
sdk.authz.provide({
  resolveGrant: async ({ userId, capability, resource }) => {
    return checkProjectMembership(userId, capability, resource.id);
  },
});
```

This gives plugins one authorization call shape without forcing a single table
schema for every resource type.

### 6. Assignment and revocation

Plugins own normal assignment flows:

- a project owner adds an editor to the project;
- a shared inbox owner adds an agent;
- an invoice profile owner adds an accountant;
- a CRM directory owner adds a viewer.

Assignment rules:

- only a user with the plugin's relevant manage-members capability can grant or
  revoke resource-scoped roles;
- the last owner rule is plugin-owned but required for resources where lockout is
  possible;
- grants and revocations write activity events;
- grants can optionally expire.

### 7. Platform owner override

The platform owner should not silently bypass every plugin's private resource
permissions.

If emergency access is needed, it should be explicit and audited:

- disabled by default or gated by instance policy;
- visible to the affected plugin/user where appropriate;
- reason required;
- read-only by default;
- never grants external effects automatically;
- stronger verification may be required through progressive verification.

This RFC does not require an owner override in v1. It defines the safety bar if
one is added later.

### 8. Session and middleware behavior

Resource-scoped plugin grants are not injected into the global session
capability header. Reasons:

- they can be numerous;
- they are resource-specific;
- they can change often;
- middleware lacks plugin resource context;
- header bloat and staleness would become real problems.

Only `defaultGrant: "all"` plugin capabilities remain globally injected as they
are today. Scoped grants are resolved server-side inside the plugin.

### 9. Audit, portability, and deletion

Grant changes must write activity events:

- grant created;
- grant revoked;
- role changed;
- ownership transferred;
- emergency override used.

Portability:

- plugin exports include grants for exported resources;
- imported grants are restored only when target users can be matched safely;
- otherwise imports preserve inert membership metadata with warnings.

Deletion:

- deleting a user removes or revokes their plugin grants;
- deleting a plugin resource removes its scoped grants;
- deleting a plugin removes its grant records.

## UI flows

### Plugin-managed resource membership

1. A user opens a plugin resource where they have `manage-members`.
2. The plugin shows a members/settings panel.
3. The user selects another Sovereign user through the user-directory SDK.
4. The plugin assigns a role such as `editor` or `viewer`.
5. The plugin records the grant in its own table.
6. The plugin writes an activity event.
7. The invited user sees the resource according to the new grant.

### Console visibility

Console may show a read-only overview:

- which plugins declare roles;
- whether a plugin provides grant-management UI;
- coarse counts of plugin grants if the plugin exposes them;
- emergency override status if that policy exists.

Console should not become the default place to manage resource-scoped plugin
membership. The plugin knows the domain context.

## Alternatives considered

### Put every plugin grant in the platform session

Rejected. It cannot scale to resource-scoped grants and would make headers
large, stale, and hard to reason about.

### Store every plugin grant in platform tables

Rejected as the default. The platform does not understand plugin-owned
resources well enough to validate membership, last-owner rules, or domain
constraints safely.

### Let every plugin invent its own model with no shared contract

Rejected. It fragments UX, audit, portability, and cross-plugin composition.

### Treat platform admins as implicit plugin admins

Rejected. Platform administration and private plugin resource access are
different trust domains. Any override must be explicit, narrow, and audited.

## Open questions

1. Should the first implementation provide reusable DB helper tables, or only SDK
   interfaces and documentation?
2. Should `roles` be added to the manifest schema immediately, or start as docs
   guidance until two plugins prove the shape?
3. Should role capability names allow dots (`project.edit`) or keep the current
   kebab-case capability name rule?
4. How should imported grants match users across instances: email, explicit
   mapping UI, or skip by default?
5. Should emergency platform-owner override exist at all in v1?
6. Should Account expose "resources shared with me" across plugins, or should
   that remain plugin-owned?

## Adoption path

1. Accept the model and update plugin-development docs with the recommended
   grant pattern.
2. Add manifest `roles` metadata and validation if accepted.
3. Add `sdk.authz` types and provider registration.
4. Add example plugin coverage for resource-scoped membership.
5. Add activity, export/import, and deletion guidance/tests.
6. Consider optional Console/Account visibility only after at least one real
   plugin implements the pattern.

Semver impact when implemented:

- `@sovereignfs/manifest`: minor if `roles` becomes a manifest field.
- `@sovereignfs/sdk`: minor for `sdk.authz` additions.
- `runtime`: minor for manifest generation/runtime support if needed.

## Changelog

| Version | Date      | Change        |
| ------- | --------- | ------------- |
| 0.1     | June 2026 | Initial draft |
