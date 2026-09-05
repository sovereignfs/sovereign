# Console Plugin

**Version:** 0.1\
**Date:** June 2026\
**Author:** kasunben\
**Purpose:** Canonical specification for the Console core plugin — the single source of truth for its manifest, access model, data model, and build plan.\
**Status:** Draft

---

**Console** is Sovereign's core administration plugin — the admin surface for
user management, plugin management, tenant configuration, and system health. It
ships in the monorepo (`plugins/console/`) and is the canonical reference for a
`type: platform` plugin.

This document is the **single source of truth for the Console plugin's spec**.
It consolidates and refines what the proposal/SRS
(`docs/sovereign-proposal-plan-srs.md`) and the implementation tasks
(`ROADMAP.md`) define, and resolves the gaps those
documents leave open. Where this doc and the SRS disagree on Console-specific
detail, this doc wins; the SRS remains authoritative for platform-wide concerns
(roles, capabilities, manifest schema).

## Contents

- [What Console is](#what-console-is)
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

## What Console is

A first-class plugin, not a special-cased admin app. The platform decision
(decision log, Jun 2026) is deliberate:

> **Console as core plugin, not a separate app** — consistent with the plugin
> architecture, avoids running a third Next.js process, admin scope enforced by
> middleware.

This means Console proves the plugin contract end to end: it is installed,
registered, routed, and access-gated through exactly the same machinery a
third-party plugin uses. Anything Console needs that the SDK cannot provide is a
gap in the platform, not a reason to special-case Console.

Console owns **no domain data of its own** in v1. It is a read/write _view_ over
platform-level tables (users, plugin status, tenant config) exposed through the
SDK. Its own `db/schema.ts` is empty.

## Identity and manifest

| Property      | Value                                         |
| ------------- | --------------------------------------------- |
| `id`          | `fs.sovereign.console`                        |
| `name`        | `Console`                                     |
| `type`        | `platform`                                    |
| `runtime`     | `native`                                      |
| `routePrefix` | `/console`                                    |
| `shell`       | `default`                                     |
| `adminOnly`   | `true`                                        |
| `icon`        | `icon.svg`                                    |
| `database`    | `shared` (omitted — `shared` is the default)  |
| `permissions` | `auth:session`, `db:readWrite`, `mailer:send` |

Proposed `manifest.json`:

```json
{
  "schemaVersion": 1,
  "id": "fs.sovereign.console",
  "name": "Console",
  "version": "0.1.0",
  "description": "Platform administration: users, plugins, settings, and system health.",
  "type": "platform",
  "runtime": "native",
  "routePrefix": "/console",
  "shell": "default",
  "adminOnly": true,
  "icon": "icon.svg",
  "permissions": ["auth:session", "db:readWrite", "mailer:send"],
  "compatibility": {
    "minPlatformVersion": "0.4.0"
  }
}
```

Notes:

- `adminOnly: true` is the canonical way to require admin. The middleware maps it
  to the `console:access` capability check. Do **not** also list `admin:*` in
  `permissions` — that union member exists for future fine-grained plugin-level
  admin scopes, and `adminOnly` already covers Console's need (SRS §5).
- `repository` is omitted: it is required only for `sovereign`/`community` types.
- `database` is omitted because `shared` is the default and Console declares no
  tables.
- No `minPlatformVersion` below `0.4.0` — Console _is_ the v0.4 milestone, so it
  cannot target an earlier platform.
- `icon.svg` is what the shell renders in the **sidebar bottom section** (and the
  mobile footer launcher), visible to `platform:admin` only (PLT-11). Console is
  shell chrome — it never appears in the sidebar middle section or the Launcher
  grid (LCH-04).
- `shell: default` — clicking the ⚙ navigates to `/console` as a full page
  under the platform sidebar, not a dialog. Console previously shipped as
  `shell: overlay` (RFC 0001, task 2.5) and was later moved back to `default`
  (workstream 0022) so its own persistent section nav (a `ThreeColumnLayout`
  sidebar on desktop, a drill-down index on mobile) reads as a real page
  rather than a transient dialog. The `adminOnly` 403 gate is unaffected by
  the shell mode either way (enforced by URL prefix in the middleware, before
  presentation).

## Access control

Console is admin-only. The full chain, per SRS §4.1 and PLT-03:

- Role `platform:admin` carries the `console:access` capability;
  `platform:user` does not.
- `adminOnly: true` in the manifest → middleware requires `console:access`.
- **Unauthenticated** request to a `/console` route → redirect to login (PLT-02).
- **Authenticated non-admin** → **403** (PLT-03).
- Console appears in the launcher **only** for users who hold `console:access`.

The first user to register on a fresh instance is auto-assigned `platform:admin`
(AUTH-08). Every subsequent promotion to admin happens through Console itself
(CON-05) — so the bootstrap admin is the platform's root of trust for the admin
role.

## Functional requirements

Mirrors SRS §4.4. These are the acceptance surface for the plugin.

| ID     | Requirement                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CON-01 | Accessible only to `platform:admin` (`console:access`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| CON-02 | View all registered users with role, status, and join date.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| CON-03 | Invite a new user by email — generate an invite token, send the invite email.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| CON-04 | Deactivate and reactivate user accounts.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| CON-05 | Change a user's role between `platform:admin` and `platform:user`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| CON-06 | View all installed plugins with version and enabled/disabled status.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| CON-07 | Enable or disable a plugin — disabling hides it from the launcher and blocks its routes.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| CON-08 | Configure tenant settings: tenant name.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| CON-09 | Display a system health summary: runtime version, DB type + connection status, auth status, disk usage.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| CON-10 | Toggle invite-only registration from Console without editing environment config.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| CON-11 | View the current root plugin and change it to any installed, enabled, non-adminOnly plugin. Change takes effect immediately without restart. The root plugin serves the platform root `/`; the sidebar's first icon resolves to it.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| CON-12 | Show or hide the bundled example plugins (manifest `example: true`) instance-wide from a Settings → Example plugins toggle, persisted in `platform_settings` and overriding the `SOVEREIGN_EXAMPLES_ENABLED` env default (no restart). A per-plugin toggle (CON-07) still overrides the instance default for that one example. Examples ship hidden by default (fresh instances create no `plugin_status` row for them — see "Resolved decisions" below) from the Launcher, sidebar, **and** the Plugins page table (CON-14): the table's "Show examples" filter defaults to the resolved instance setting, not hard-coded on, so a bulk-disabled example without an individual override is hidden there too until the admin either flips the bulk toggle or ticks the filter to reveal-and-manage it individually. The Settings → Example plugins section itself only renders when the build actually composed `example-plugins/` in the first place (`GET /api/admin/settings`'s `hasExamplePlugins`, derived from the registry, not the persisted setting) — a separate, build-time layer of the same `SOVEREIGN_EXAMPLES_ENABLED` var, see `docs/self-hosting.md`'s "Reference example plugins". On a default (examples-off) build the section is hidden entirely rather than showing a toggle with nothing to reveal. |
| CON-13 | Set a per-plugin access policy governing who may **open** the plugin's app — Everyone, Admins and owners, Selected users, Selected groups, or Disabled — from an Access dialog on the Plugins page, independent of CON-07's enable/disable state and of `console:access` (which governs who can manage plugins in Console, not who can open them). Selected-user/group policies support a self-service toggle (requires `plugins:self-manage`, RFC 0070) and warn when no user/group is yet granted. Policy and grant changes are audited.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| CON-14 | List every cataloged plugin — active or not — in a single table (no separate catalog/installed/examples sections), with keyword search (name/id/description) and a status filter (Inactive/Enabled/Disabled/Incompatible). Row actions are contextual to status: `Activate` for inactive, the existing toggle/Access/Open/Remove for active. Chrome plugins (Account/Console/Launcher) never show Access — access policy is a permanent no-op for them.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| CON-15 | Flag a plugin as still under active development (manifest `development: true`) with an amber "in development" badge next to its type badge on the Plugins page. Purely informational, like CON-12's `example` classification — no effect on routing, access policy, or the enable/disable default. The same flag also badges the plugin's Launcher tile (LCH-09).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| CON-16 | `SOVEREIGN_HIDE_DEVELOPMENT_PLUGINS` (env, no Console setting) hard-hides every `development: true` plugin instance-wide — routes 404, no sidebar/Launcher entry — with **no per-plugin override**: unlike CON-12's example toggle, an explicit enable on this page does not undo it. The plugin still lists on this page (like any other plugin, per CON-06) so an admin can see it's flagged, but its `enabled` toggle is inert while the env var is set. See `docs/self-hosting.md`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |

## Directory structure

Follows the standard plugin internal structure (SRS §2.3). Console still owns
no domain tables of its own — `db/schema.ts` stays intentionally empty; every
table it reads or writes belongs to the platform schema (see
[Data model](#data-model)).

```
plugins/console/
├── manifest.json            # identity, permissions, routing (above)
├── icon.svg                 # Console icon — rendered in the sidebar bottom section
├── app/                     # Next.js route segment, mounted at /console
│   ├── layout.tsx           # ThreeColumnLayout shell — NavList sidebar (desktop) / drill-down index (mobile), task 13.17
│   ├── page.tsx             # Overview — at-a-glance stats + system health (CON-09 folded in here; no separate health/ section)
│   ├── OverviewClient.tsx
│   ├── _lib/
│   │   ├── sections.ts      # CONSOLE_SECTIONS — single source of truth for the sidebar and mobile drill-down nav
│   │   ├── detail-pane.tsx  # ConsoleDetailPaneProvider/useConsoleDetailPane — shared 3rd-column mechanism (tasks 13.18–13.21)
│   │   └── health.ts        # system health summary (CON-09)
│   ├── _components/         # ActivitySearch, ConsoleDetailSlot, CopyIdButton — shared across sections
│   ├── users/               # list, invite, role change, capabilities, detail pane (CON-02–05, task 13.18)
│   ├── groups/              # user-group CRUD + member management, detail pane (task 13.19)
│   ├── plugins/             # unified filterable app table, access policy, detail pane (CON-06/07/13/14, task 13.20)
│   ├── entitlements/        # license generation and entitlement management
│   ├── oauth-clients/       # external OAuth client registration, detail pane (task 13.21)
│   ├── identity/            # instance identity/branding
│   ├── settings/            # tenant name, invite-only, example plugins, root plugin, SMTP, retention, encryption status (CON-08/10/11/12)
│   ├── backups/             # instance backup trigger + job list (RFC 0084, epic task 8.17)
│   ├── activity/            # platform-wide activity feed
│   ├── broadcast/           # admin broadcast messages
│   └── messages/            # admin-composed user messages (RFC 0048)
├── db/
│   └── schema.ts            # intentionally empty — Console owns no tables
└── package.json
```

Mutations (role change, deactivate/reactivate, enable/disable, settings writes,
access-policy changes) are implemented as **Next.js server actions**
(`actions.ts` beside each section's `page.tsx`), not REST handlers — applied
consistently across every section above.

## Data model

Console reads and writes **platform tables**, never its own. The tables it
touches:

| Table               | Owner                       | Console use                                                                       |
| ------------------- | --------------------------- | --------------------------------------------------------------------------------- |
| users (auth)        | better-auth / `packages/db` | List, role, status, join date (CON-02/04/05).                                     |
| `plugin_status`     | platform (`packages/db`)    | Per-plugin enabled/disabled flag (CON-06/07).                                     |
| `tenants`           | platform (`packages/db`)    | Tenant name + invite-only flag (CON-08/10).                                       |
| `platform_settings` | platform (`packages/db`)    | Key-value config; `root_plugin_id` (CON-11, PLT-15), `examples_enabled` (CON-12). |

Resolved decisions (gaps the SRS left open):

- **`plugin_status` and `tenants` are platform tables defined in `packages/db`**,
  not in `plugins/console/db/`. Console only declares no tables because these
  belong to the platform schema — the runtime, auth server, and middleware also
  read them. Console is a consumer, not the owner.
- All user-scoped tables carry `tenant_id` from day one per the hard
  architectural rules, even though v1 is single-tenant.
- The invite-only flag lives on `tenants` and is read by the **auth server** at
  registration time (AUTH-03). Console writes it; auth enforces it. No restart
  required (review checklist, 0.4.04).
- **(2026-07-19 correction) On a fresh instance's first boot, only the platform
  chrome plugins (Account/Console/Launcher — never gated by `plugin_status` at
  all) are active by default.** Every other plugin, examples included, starts
  with **no** `plugin_status` row and is therefore inactive/hidden across the
  sidebar, Launcher, and this Plugins table, until an admin either activates it
  individually (CON-07) or — for examples — flips the Settings → Example
  plugins bulk toggle (CON-12). An earlier boot-time backfill
  (`backfillPluginCatalogOnce`, RFC 0065 Task 3.28) used to eagerly create an
  `enabled: true` row for every non-chrome plugin including examples on first
  boot, which defeated both of those controls from the very first boot — see
  RFC 0065's changelog for the full writeup and why it was safe to remove.

## SDK dependencies

Console exercises four SDK surfaces. Their readiness is sequenced across v0.4
and v0.5:

| SDK surface    | Used for                               | Status when Console needs it                       |
| -------------- | -------------------------------------- | -------------------------------------------------- |
| `sdk.auth`     | session, user list, role, deactivate   | **Real impl wired in Task 0.4.2** (prerequisite).  |
| `sdk.mailer`   | sending invite emails (CON-03)         | **Real impl wired in Task 0.4.2** (prerequisite).  |
| `sdk.platform` | `getConfig()` for tenant name (CON-08) | Stubbed through v0.4; **completed in Task 0.5.5**. |
| `sdk.db`       | reading/writing platform tables        | Stubbed through v0.4; **completed in Task 0.5.5**. |

**Sequencing caveat (carry into the build):** Task 0.4.4 needs
`sdk.platform.getConfig()` and `sdk.db`, but their real implementations don't
land until Task 0.5.5. For v0.4, Console's settings/health pages work against
the stubbed `platform`/`db` surfaces (or read the tables directly via
`packages/db` where the SDK stub is insufficient), and the SDK-routed path is
finalized in 0.5.05. This is a known ordering wrinkle, not a contradiction —
record any temporary direct-table access so 0.5.05 can route it through the SDK.

## UI

Console consumes `@sovereignfs/ui` (the Sovereign Design System) — it is named
explicitly as a first-party consumer alongside the runtime shell
(`docs/design-system.md`). Console uses both **tokens** and **components**:

- Build all Console UI from `@sovereignfs/ui` components (`Button`, `Card`,
  `Input`, `Badge`, …). No hardcoded colours, spacing, or radii — reference
  `--sv-*` semantic tokens only.
- Tables (user list, plugin list) and forms (invite, settings) should drive any
  net-new primitives they need _into_ `packages/ui` rather than building
  one-off styled markup in the plugin, so third-party plugins inherit them.
- Console's shell composes `ThreeColumnLayout`, `NavList` (both variants —
  `static` for the desktop sidebar, `drilldown` for the mobile index),
  `ResponsiveSurface`, `PageContainer`, and `OfflineGate` (workstream 0022,
  tasks 13.17–13.21 — see [Build plan](#build-plan)). The four
  selection-driven sections (Users, Groups, Plugins, External clients) each
  register a 3rd detail-pane column through a shared
  `ConsoleDetailPaneProvider`/`useConsoleDetailPane` context
  (`app/_lib/detail-pane.tsx`), mirroring `@sovereignfs/ui`'s own
  `Dialog`/`useOverlaySecondRow` pattern.

## Build plan

Console's full functional scope (CON-01–16) shipped across the sequenced
tasks summarized below — `docs/epics/plugin-console.md` has the complete
task-by-task history; this section stays a concise summary, not a changelog.

### 1 — Console scaffold (Task 13.1)

Directory structure, manifest, and routing wired into the runtime via the
generate script: `manifest.json`, `app/layout.tsx`, `app/page.tsx`, empty
`db/schema.ts`, `package.json`. `/console` 403s for `platform:user` and is
accessible for `platform:admin`; Console shows in the launcher for admins only.

### 2 — User management (Task 13.2)

User list, invite, role change, deactivate/reactivate (CON-02–CON-05):
`app/users/page.tsx` (paginated) and `app/users/invite/page.tsx`, with role
change and deactivate/reactivate as server actions. Landed alongside the
first real `sdk.auth`/`sdk.mailer` implementations, a prerequisite for this
task.

### 3 — Plugin management (Task 13.3)

Installed plugin list with enable/disable (CON-06, CON-07, PLT-04):
`app/plugins/page.tsx`, writing to `plugin_status`. The runtime middleware
enforces disabled status immediately — disabled routes 404, no rebuild
required, and disabled plugins disappear from the launcher.

### Plugin access policy (RFC 0065, CON-13, Task 13.7)

An Access dialog on the Plugins page, additive to plugin management: who may
**open** each installed plugin's app — Everyone, Admins and owners, Selected
users, Selected groups, or Disabled, auto-saved to
`plugin_status.accessPolicy`. Selected-users/groups policies show a
search-and-grant picker plus a self-service checkbox and an empty-grant
warning. Managing access here never grants the acting admin/owner app access
themselves — Console management (`console:access`) and plugin app access
(this policy) are deliberately separate axes — and chrome plugins (Account,
Console, Launcher) are exempt. Every policy change and grant/revoke is logged
to the activity feed. Enforced at the request layer
(`runtime/src/plugin-access-server.ts`), not just advisory in the UI —
middleware and the route guard both check it on every request.

### Unified plugin table (RFC 0065 Task 13.9, CON-14)

One row per cataloged plugin, whether active or not — replaced the original
three separate sections (catalog, installed, examples) with a single
filterable table. Row `status` is derived, not stored:
`incompatible` → `inactive` (no `plugin_status` row) → `enabled`/`disabled`.
The filter bar combines a client-side keyword search, a status pill row
(All/Inactive/Enabled/Disabled/Incompatible), and a "Show examples" toggle
seeded from the resolved `examples_enabled` setting. Row actions are
contextual to status (`Activate`/`Remove` for inactive; the existing
toggle/Access/Open/Remove for active, Access hidden for chrome plugins);
mobile moves Access and Remove behind a `⋯` kebab menu.

### 4 — Tenant settings and system health (Task 13.4)

Tenant name, invite-only toggle, and the root plugin selector
(CON-08, CON-10, CON-11) in `app/settings/page.tsx`; system health (CON-09)
originally shipped as its own `app/health/page.tsx`, later folded into the
Overview page (`app/page.tsx`) rather than kept as a separate section — see
the shell rework below. Tenant name is exposed via `sdk.platform.getConfig()`;
the invite-only toggle is read by the auth server at registration, both
without a restart.

### Shell rework: `ThreeColumnLayout` + selection-driven detail panes (workstream 0022, Tasks 13.17–13.21)

Console moved from `shell: "overlay"` back to `shell: "default"` — a full
reversal of its original RFC 0001 migration — and `layout.tsx` was rebuilt
around `@sovereignfs/ui`'s `NavList` and `ThreeColumnLayout`: a persistent
vertical section nav on desktop (column 1), routed page content (column 2),
and — for Users, Groups, Plugins, and External clients — a selection-driven
3rd detail column that replaced what were previously separate dialogs
(`CapabilitiesButton`, `ManageGroupDialog`, `PluginAccessDialog`). Mobile has
no persistent sidebar: the bare `/console` route renders a
`NavList variant="drilldown"` index instead, and every other section shows a
`‹ Console` back link. See [UI](#ui) above and
[workstream 0022](../workstreams/0022-console-shell-and-three-column-layout.md)
for the full technical detail.

## Open questions

Tracked here so they're resolved deliberately, not silently during
implementation:

1. **Health metrics precision.** "Disk usage" for SQLite is the DB file size;
   for Postgres the SRS says "connection" — the exact Postgres health signal
   (connection liveness only, or also DB size via a query) isn't pinned.
2. **Invite token lifecycle.** Token format, expiry, single-use vs reusable, and
   where it's stored (auth server vs platform table) — referenced by CON-03 but
   not specified. Likely belongs to the auth spec, cross-referenced from here.

## Changelog

| Version | Date     | Change                                                         |
| ------- | -------- | -------------------------------------------------------------- |
| 0.1     | Jun 2026 | Initial draft — consolidated from SRS §4.4 and the v0.4 tasks. |
