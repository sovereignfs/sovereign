# Epic: Plugin — Launcher

> The home screen — a responsive plugin grid that serves as the default root page at `/`.

## Status

✅ Complete

## Overview

The Launcher (`fs.sovereign.launcher`) is a `type: platform`, `shell: default` plugin that renders a tile grid of all installed, enabled, non-chrome plugins. It is the default `root_plugin_id` — navigating to `/` loads it via the root-plugin rewrite in runtime middleware. Admin users see a separate "Admin" section for `adminOnly: true` plugins. Tiles show plugin icon, name, and description; clicking navigates to the plugin's `routePrefix`. The Launcher reads its plugin list from a session-gated runtime API (`/api/plugins`) rather than importing the registry directly — enforcing the SDK boundary.

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
