# Epic: Example Plugins

> A frictionless plugin on-ramp — canonical starter skeletons and capability-demo examples that double as runtime test fixtures.

## Status

🔨 In progress — 12.1–12.2 complete; 12.3 planned (admin disable surface).

## Overview

Task 0.5.28 delivered three entry points to the same canonical skeleton: a GitHub template repo (`sovereign-plugin-template`), a `sv plugin new <name>` CLI command, and an `npm create @sovereignfs/plugin` initializer. Capability-demo examples (`example-basic`, `example-api`) demonstrate runtime composition, route-guard patterns, `apiProvider`, and plugin-declared capabilities (Task 0.6.1 extends `example-basic` to demo the `capabilities` manifest field). These examples also serve as fixtures for integration and E2E tests.

The example set has since grown to seven plugins (`example-basic`, `example-api`, `example-minimal`, `example-monetized`, `example-overlay-small/medium/large`) committed directly in `plugins/` via a gitignore allowlist. Tasks 12.2–12.3 move that set out of the monorepo into a dedicated `sovereign-examples` repository — re-bundled at build time so a default install still ships them — and give operators a first-class way to identify and disable example plugins (in bulk or one at a time) so a production instance need not surface demo apps.

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
dedicated `sovereign-examples` repository, then re-bundle them at build/install
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

- New `sovereign-examples` repository containing the seven plugin dirs (verbatim,
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

#### 📋 12.3 — Admin disable surface for example plugins

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
  the `sovereign-examples` repo. Surface the flag through the generated registry
  so Console and middleware can read it. Update `docs/plugin-development.md` and
  the docs-parity test.
- **Console bulk control:** on the Plugins page, group example plugins into a
  section with a single "Disable all examples" / "Enable all examples" action
  (a server action iterating the example set and writing `plugin_status`), while
  keeping the existing per-plugin toggle for individual examples.
- **Default posture (confirm during design):** optionally gate examples to
  disabled-by-default outside dev (env-driven), opt-in via Console — so a fresh
  production instance ships them installed but hidden.
- **Activity log:** record bulk enable/disable actions.
- Update `docs/plugins/console.md` with a new CON entry for the example
  disable surface.

**Version bumps:** `@sovereignfs/manifest` → minor (new optional field), `runtime`
→ minor, `plugins/console` → minor, root platform → minor.

**Dependencies:** Task 12.2 (examples live in the separate repo where the `example`
marker is set).

**Review checklist:**

- The Console Plugins page shows the seven examples grouped, with a working bulk
  disable/enable that toggles all of them and a per-example toggle that toggles
  one.
- Disabling an example (bulk or individual) 404s its routes and removes its
  launcher tile immediately, with no rebuild; re-enabling restores them.
- `packages/manifest` accepts `example: true` and the docs-parity test passes.
- A non-example platform plugin (console/launcher/account) is never swept up by
  the bulk action.
- `pnpm format:check && pnpm lint && pnpm typecheck && pnpm test`

---
