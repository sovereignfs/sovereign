# Epic: Example Plugins

> A frictionless plugin on-ramp — canonical starter skeletons and capability-demo examples that double as runtime test fixtures.

## Status

✅ Complete — 12.1 (starter template & examples), 12.2 (extraction to own repo), 12.3 (admin disable surface).

## Overview

Task 0.5.28 delivered three entry points to the same canonical skeleton: a GitHub template repo (`sovereign-plugin-template`), a `sv plugin new <name>` CLI command, and an `npm create @sovereignfs/plugin` initializer. Capability-demo examples (`example-basic`, `example-api`) demonstrate runtime composition, route-guard patterns, `apiProvider`, and plugin-declared capabilities (Task 0.6.1 extends `example-basic` to demo the `capabilities` manifest field). These examples also serve as fixtures for integration and E2E tests.

The example set has since grown to seven plugins (`example-basic`, `example-api`, `example-minimal`, `example-monetized`, `example-overlay-small/medium/large`) committed directly in `plugins/` via a gitignore allowlist. Tasks 12.2–12.3 move that set out of the monorepo into the dedicated `sovereign-plugins-examples` repository — re-bundled at build time so a default install still ships them — and give operators a first-class way to identify and disable example plugins (in bulk or one at a time) so a production instance need not surface demo apps.

## Related RFCs

- [RFC 0017 — Plugin starter template & examples](../rfcs/0017-plugin-starter-and-examples.md)

## Related Docs

- [plugin-development.md — Getting started](../plugin-development.md)

## Notes

More worked examples (e.g. `example-monetized` for the monetization paywall pattern) are added alongside feature tasks — see [Monetization](monetization.md) for the post-v1 Stripe/PayPal example plugin.

## Tasks

#### ✅ 12.1 — Plugin starter template & example plugins

> Full entry: **[3.12]** in [plugins-runtime.md](plugins-runtime.md) — Plugin starter template & example plugins.
> This task delivered the GitHub template repo, `sv plugin new`, `npm create @sovereignfs/plugin`, and the `example-basic`/`example-api` capability-demo plugins.

---

#### ✅ 12.2 — Extract example plugins to their own repository

**Goal:** Move the seven bundled example plugins out of this monorepo into a
dedicated `sovereign-plugins-examples` repository, then re-bundle them at build/install
time via the existing clone-at-build mechanism so a default install still ships
with them. Keeps the platform tree focused on the runtime and its core platform
plugins, while examples version and iterate independently.

**Current state:**

The seven example dirs (`example-basic`, `example-api`, `example-minimal`,
`example-monetized`, `example-overlay-small/medium/large`) are committed in
`plugins/` through a gitignore allowlist (`.gitignore:35-41`). They are
discovered by `readPlugins()` in `scripts/generate-registry.ts:117` (which scans
every `plugins/*/manifest.json`) and copied into the runtime route groups by
`composePlugins()`. `scripts/install-plugins.ts` already clones externally-hosted
plugins listed in `sovereign.plugins.json` into `plugins/<id>/` (gitignored, each
with its own repo); that config is currently empty. Discovery is
source-agnostic — a cloned plugin is composed identically to a committed one.

**Deliverables:**

- New `sovereign-plugins-examples` repository containing the seven plugin dirs (verbatim,
  manifests unchanged for this task).
- Remove the seven dirs from this monorepo and drop their allowlist lines in
  `.gitignore:35-41`; the generic `/plugins/*/` ignore then covers them as cloned
  plugins.
- Populate `sovereign.plugins.json` (or a dedicated default-examples manifest read
  by `scripts/install-plugins.ts`) with the seven entries, **pinned by ref/commit**
  so builds are reproducible.
- **Docker impact (flag + resolve):** confirm `scripts/install-plugins.ts` runs
  during the image build with the network access it needs, or vendor a pinned
  snapshot into the build context — the production Docker build must still ship
  the examples offline-reproducibly. Update `Dockerfile` / `docker-compose*.yml`
  / `.dockerignore` as required.
- Update fixtures/tests that reference bundled example dirs by path (`bin/__tests__`,
  any generate/registry tests) to the cloned-plugin layout.
- Update `docs/plugin-development.md` ("Example plugins") and
  `docs/self-hosting.md` to describe examples as clone-at-build plugins and how to
  exclude them.

**Version bumps:** root platform → minor (roadmap task). No published-package API
change; `runtime`/`bin` patch only if discovery or install code changes.

**Dependencies:** none (foundational for 12.3).

**Review checklist:**

- A fresh `pnpm install` + `pnpm dev` clones the seven examples and composes them
  exactly as before — routes, launcher tiles, and overlays all present.
- `git status` shows no example dirs tracked in the monorepo; `.gitignore` no
  longer allowlists them.
- The production Docker image contains the seven example plugins and builds
  reproducibly (pinned refs), with the plugin-install step documented.
- `pnpm registry:check` and the generate/compose tests pass against the cloned
  layout.
- `pnpm format:check && pnpm lint && pnpm typecheck && pnpm test`

---

#### ✅ 12.3 — Admin disable surface for example plugins

**Goal:** Give operators a first-class way to turn example plugins off — all at
once or one at a time — and to identify which installed plugins are examples.
Optionally default examples to off outside development so a production instance
does not surface demo apps in the launcher.

**Current state:**

A per-plugin enable/disable already exists (CON-07): the Console Plugins page
writes to the `plugin_status` table and middleware returns **404** for disabled
routes and hides them from the launcher. There is **no** notion of an "example"
plugin — the seven examples piggyback on the existing `type` values (`platform`
and `sovereign`), so nothing lets the platform target them as a group, and there
is no bulk toggle.

**Deliverables:**

- **Manifest marker:** add an optional `example: true` flag to
  `packages/manifest/src/schema.ts` (preferred over overloading `type`, which the
  examples already use inconsistently); set it on all seven example manifests in
  the `sovereign-plugins-examples` repo. Surface the flag through the generated registry
  so Console and middleware can read it. Update `docs/plugin-development.md` and
  the docs-parity test.
- **Console controls:** a **Settings → Example plugins** toggle shows/hides all
  example plugins instance-wide (persisted in `platform_settings`), and the Plugins
  page groups the example plugins into their own section where each can still be
  toggled individually (overriding the instance default).
- **Default posture:** examples ship inside the image but are **hidden by
  default**. Resolution precedence (highest first): an explicit per-plugin
  `plugin_status` row → the persisted `examples_enabled` instance setting (the
  Settings toggle) → the `SOVEREIGN_EXAMPLES_ENABLED` env seed → off. Implemented
  as a single effective-disabled resolver (`runtime/src/plugin-status.ts`) shared
  by the middleware gate, launcher, sidebar shell, root-plugin selection, and
  portability, so a hidden example 404s and shows no launcher/sidebar icon.
- **Activity log:** record the Settings toggle and per-plugin changes.
- Update `docs/plugins/console.md` with a new CON entry for the example
  disable surface.

**Version bumps:** `@sovereignfs/manifest` → minor (new optional field), `runtime`
→ minor, `plugins/console` → minor, root platform → minor.

**Dependencies:** Task 12.2 (examples live in the separate repo where the `example`
marker is set).

**Review checklist:**

- The Settings → Example plugins toggle shows/hides all example plugins instance-wide,
  and the Plugins page groups the examples with a working per-example toggle.
- Hiding examples (via the toggle or the env default) 404s their routes and
  removes their launcher/sidebar icons immediately, with no rebuild; showing them
  again restores them. A per-plugin toggle overrides the instance default.
- `packages/manifest` accepts `example: true` and the docs-parity test passes.
- A non-example platform plugin (console/launcher/account) is never affected.
- `pnpm format:check && pnpm lint && pnpm typecheck && pnpm test`

---
