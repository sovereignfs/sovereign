# Epic: Plugin — Launcher

> The home screen — a responsive plugin grid that serves as the default root page at `/`.

## Status

⏳ In Progress

## Overview

The Launcher (`fs.sovereign.launcher`) is a `type: platform`, `shell: default` plugin that renders a tile grid of all installed, enabled, non-chrome plugins. It is the default `root_plugin_id` — navigating to `/` loads it via the root-plugin rewrite in runtime middleware. Admin users see a separate "Admin" section for `adminOnly: true` plugins. Tiles show plugin icon, name, and description; clicking navigates to the plugin's `routePrefix`. The Launcher reads its plugin list from a session-gated runtime API (`/api/plugins`) rather than importing the registry directly — enforcing the SDK boundary.

## Related RFCs

- [RFC 0065 — User groups and plugin access policy](../rfcs/0065-user-groups-plugin-access.md)
- [RFC 0070 — Per-user capability grants](../rfcs/0070-per-user-capability-grants.md)

## Related Docs

- [docs/plugins/launcher.md](../plugins/) (plugin spec)
- [plugin-development.md](../plugin-development.md)

## Tasks

#### ✅ 15.1 — Launcher plugin

**Goal:** Platform home screen that lists all installed plugins, serving as the default root page at `/`.

**Deliverables:**

- `plugins/launcher/` with:
  - `manifest.json` — id: `fs.sovereign.launcher`, type: `platform`, runtime: `native`, routePrefix: `/launcher`, shell: `default`, icon: `icon.svg`, permissions: `["auth:session", "db:readOnly"]`, minPlatformVersion: `0.4.0`
  - `icon.svg` — grid-of-dots or home symbol
  - `app/page.tsx` — plugin grid: reads installed, enabled plugins from registry; excludes chrome plugins (`fs.sovereign.launcher`, `fs.sovereign.account`, `fs.sovereign.console`); renders main grid for accessible plugins; renders a separate "Admin" section for `adminOnly: true` plugins (visible to `platform:admin` only); empty state when no non-chrome plugins are installed
  - `components/PluginGrid.tsx` — responsive grid layout
  - `components/PluginTile.tsx` — tile card: plugin icon + name + description; clicking navigates to the plugin's `routePrefix`

**Dependencies:** Task 0.4.03 (plugin registry and `plugin_status` table), Task 0.4.04 (root plugin redirect so `/` loads Launcher by default)

**SRS reference:** LCH-01–LCH-05, PLT-12, `docs/plugins/launcher.md`

**Review checklist:**

- Navigating to `/` loads the Launcher page (via the root plugin redirect set in Task 0.4.04)
- All installed, enabled, non-chrome plugins appear as tiles with icon, name, and description
- `adminOnly` plugins appear only in the Admin section and only for `platform:admin` users
- Chrome plugins (`fs.sovereign.launcher`, `fs.sovereign.account`, `fs.sovereign.console`) do not appear in any tile section
- Clicking a tile navigates to the plugin's `routePrefix`
- Empty state is shown when no non-chrome plugins are installed
- `pnpm lint`, `pnpm format:check`, and `pnpm typecheck` pass

---

#### 📋 15.2 — Launcher plugin workflow coverage

**Goal:** Add meaningful regression coverage for Launcher workflows that users
depend on.

**Deliverables:**

- Cover plugin filtering and ordering behavior.
- Cover hidden chrome plugins being excluded from app tiles.
- Cover monetized plugin tile and paywall behavior.
- Cover accessible plugin visibility for admin and non-admin users.

**Dependencies:** Task 15.1 (Launcher plugin), Task 2.13 (sidebar
customization), Task 7.1 (plugin monetization).

**SRS reference:** LCH-01, LCH-02, LCH-03, LCH-04, LCH-05.

**Review checklist:**

- Launcher coverage verifies the visible app tile list for ordinary users and
  admins.
- Monetized plugin tile and paywall behavior have regression coverage.
- Chrome plugins remain excluded from app tiles.

---

#### ✅ 2.22 — Launcher grid respects saved sidebar order

> Full entry: **[2.22]** in [platform-shell.md](platform-shell.md) — Launcher grid respects saved
> sidebar order. `/api/plugins` (the Launcher's data source) now applies the user's saved sidebar
> plugin order after its own role/admin filtering, so tile order matches the sidebar's custom
> order; hiding a plugin from the sidebar strip does not remove its Launcher tile.

---

#### 📋 15.3 — Plugin directory browsing and self-service enable/disable (RFC 0065)

**Goal:** Let a user with the `plugins:self-manage` capability (RFC 0070) browse plugins they're
eligible for but haven't turned on, and self-service enable/disable a `self_service`-enabled
`selected_users`/`selected_groups` plugin, without filing an admin request.

**Deliverables:**

- Add a plugin-directory view (Launcher or Account, TBD at implementation) listing plugins the
  current user is eligible for under RFC 0065's access policy, distinguishing "already on" from
  "eligible, not yet enabled."
- Render an enable/disable affordance only for plugins with `self_service = true` on their
  access policy, and only when the current user holds `plugins:self-manage` — the control does
  not exist for users without the capability, not merely disabled.
- Enabling/disabling calls the same resolver and `plugin_access_users` grant table an admin's
  Console grant uses (Task 2.21), with `granted_by_user_id` set to the user themselves.
- Self-service actions are audited identically to admin grants, attributed to the acting user.

**Dependencies:** Task 15.1 (Launcher plugin), Task 2.21 (plugin access policy enforcement —
self-service resolver and grant tables), Task 1.16 (per-user capability grants, RFC 0070).

**SRS reference:** [RFC 0065](../rfcs/0065-user-groups-plugin-access.md)

**Review checklist:**

- A user with `plugins:self-manage` can enable a `self_service`-enabled plugin they're eligible
  for and see it appear in their Launcher/sidebar immediately.
- A user without `plugins:self-manage` sees no enable/disable control anywhere, even for
  otherwise-eligible self-service plugins.
- Self-service grants are indistinguishable in the resolver from admin grants, but
  distinguishable in the audit log.
- Disabling a self-granted plugin removes it from the user's Launcher/sidebar without affecting
  other users' access.
- `pnpm format:check && pnpm lint && pnpm typecheck && pnpm test`

---
