# Epic: Example Plugins

> A frictionless plugin on-ramp — canonical starter skeletons and capability-demo examples that double as runtime test fixtures.

## Status

✅ Complete — 12.1 (starter template & examples), 12.2 (extraction to own repo, later reversed), 12.3 (admin disable surface), 12.4 (manifest cleanup & example-set expansion), 12.5 (`example-mobile-poc` relocated into the set).

## Overview

Task 0.5.28 delivered three entry points to the same canonical skeleton: a GitHub template repo (`sovereign-plugin-template`), a `sv plugin new <name>` CLI command, and an `npm create @sovereignfs/plugin` initializer. Capability-demo examples (`example-basic`, `example-api`) demonstrate runtime composition, route-guard patterns, `apiProvider`, and plugin-declared capabilities (Task 0.6.1 extends `example-basic` to demo the `capabilities` manifest field). These examples also serve as fixtures for integration and E2E tests.

The example set has since grown to nine plugins (`example-basic`, `example-api`, `example-minimal`, `example-monetized`, `example-overlay-small/medium/large`, `example-mobile`, `example-mobile-poc`) committed directly in `example-plugins/` (a sibling of `plugins/`, composed only when `SOVEREIGN_EXAMPLES_ENABLED` is set). Tasks 12.2–12.3 originally moved that set out of the monorepo into a dedicated `sovereign-plugins-examples` repository and gave operators a first-class way to identify and disable example plugins (in bulk or one at a time); Task 12.2's externalization was itself reversed on 2026-08-01 back to the current in-repo model (see its correction note). Task 12.4 covers the manifest-schema tightening and the expansion from the original two examples to eight; Task 12.5 covers the ninth.

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

**Post-completion corrections:**

- **(2026-08-01 reversal)** The externalization this task shipped has been
  reversed — the example plugins moved back in-repo, tracked in git under
  `example-plugins/` (not `plugins/`, and not gitignored). `sovereign.plugins.json`
  / `scripts/install-plugins.ts` no longer clone them at all; they were never
  actually populated into the default `sovereign.plugins.default.json` in
  practice, so this closes a gap where the documented clone-at-build path
  existed but shipped no examples by default. Composition is now gated
  directly by `SOVEREIGN_EXAMPLES_ENABLED` in `scripts/generate-registry.ts`
  (off by default) — a second, build-time meaning for the same env var CON-12
  already used for runtime visibility (`docs/self-hosting.md`'s "Reference
  example plugins" section has the full two-layer model). Motivation: the
  clone-based model added build-time network dependence and friction without
  ever actually shipping the examples by default, while keeping them in-repo
  also makes them directly browsable as reference code for plugin developers.
  (Task 12.4's expanded set, including `example-mobile`, landed in the same
  pass.) `sovereignfs/sovereign-plugins-examples` has since been retired outright
  (2026-08-01) now that nothing references it — see `docs/repositories.md`.

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

**Post-completion corrections:**

- **(RFC 0065 Task 13.9, superseding the "Console controls" deliverable above)**
  The Plugins page does **not** group examples into their own section — Task
  13.9 replaced the original catalog/installed/examples sections with a single
  unified, filterable table (see `docs/plugins/console.md` CON-14). Examples
  are distinguished there by a "Show examples" filter checkbox, not a separate
  section.
- **(2026-07-19 fix)** The "Hiding examples... 404s their routes" checklist
  item above was not actually true on a fresh instance between RFC 0065's
  catalog/activation model landing and this fix: a boot-time backfill
  (`backfillPluginCatalogOnce`) eagerly created an explicit, `enabled: true`
  `plugin_status` row for every example plugin on first boot, which — per this
  task's own "an explicit row always wins" precedence — made the bulk toggle
  permanently inert for every example on that instance from the very first
  boot. Fixed by removing the backfill's eager row creation for non-chrome
  plugins entirely (see RFC 0065's changelog) and by making the access-policy
  resolver in `runtime/src/plugin-access-server.ts` example-aware, so a
  row-less example plugin now correctly follows the bulk toggle on both the
  enabled/disabled axis (`plugin-status.ts`, already correct) and the
  access-policy axis (previously not, since it defaulted every row-less
  plugin — examples included — to `accessPolicy: 'disabled'` regardless of the
  bulk setting).
- **(2026-08-01 reversal)** Task 12.2's externalization (this task's
  dependency) was reversed — see that task's own correction note. The
  `example: true` manifest marker and everything else this task shipped
  (Console toggle, `plugin_status` precedence, access-policy resolution) are
  unaffected; only _where the example plugins' source lives_ and _whether
  they're composed into a given build_ changed.

---

#### ✅ 12.4 — Expand example plugins and tighten the runtime manifest enum

**Goal:** Grow the example set to cover every `shell`/`overlaySize`
combination and the API-provider/monetization surfaces, and stop the
manifest schema from accepting runtime models that don't exist in code yet.

**Deliverables:**

- Manifest schema (`packages/manifest/src/schema.ts`) accepts only
  `runtime: "native"`; `static`/`iframe-local`/`iframe-remote`/`external`
  remain documented as planned/deferred (`docs/plugin-development.md`'s
  "Future runtime models") but fail manifest validation until implemented.
- Three new overlay examples — `example-overlay-small`/`-medium`/`-large` —
  one per `shellConfig.overlaySize` value, since overlay size is
  manifest-level configuration a single plugin can't demonstrate at runtime.
- `example-minimal` (chrome-free `shell: "minimal"` composition) added.
- `example-api` and `example-monetized` expanded from stubs into fuller
  references (deterministic GET/POST delegated routes with structured errors
  for API; explicit manifest/paywall/license-import flow for monetized).
- `example-mobile` added in the same 2026-08-01 pass as Task 12.2's
  in-repo reversal, demonstrating `@sovereignfs/ui`'s responsive-layout/
  carousel work (RFC 0079) — bringing the set to its current 8 plugins.
- `docs/plugin-development.md`'s example table and the generated registry
  updated for the full set.

**Dependencies:** None — this manifest-enum and example-set work is
independent of where the examples are sourced from (Task 12.2), and was
unaffected by that task's later reversal.

**SRS reference:** None — documentation-first ad hoc plan, no RFC filed.
Originally tracked in `docs/adhoc/example-plugins-plan.md`; that file has
been retired and this task is now the canonical record (see
`docs/documentation-structure.md`'s note on `adhoc/` being phased out).

**Review checklist:**

- Existing first-party plugins validate against the tightened schema; an
  invalid future `runtime` value fails manifest validation with a clear
  error.
- `pnpm generate` composes all 8 examples; the overlay examples exercise all
  three `overlaySize` values; the minimal example composes under the minimal
  route group; API-provider uniqueness still holds; the monetized paywall
  flow stays covered by E2E tests.

**Known open item:** whether the API example should demonstrate API-key or
signed-request auth, or stay limited to public deterministic endpoints, was
an open question in the original plan and was never revisited —
`example-api` currently only demonstrates the latter.

---

#### ✅ 12.5 — Add `example-mobile-poc` and relocate it into the example set

**Goal:** A scratch plugin evaluating `@sovereignfs/ui`'s `MobileHeader`,
`MobileFooter`, and `SwipableMobileCarousel` stability ahead of the runtime
shell's own adoption of them (task 9.24) had accumulated directly under
`plugins/` — gitignored and untracked there, so it existed only locally and
was invisible to anyone else. Its manifest already declared `id:
"fs.sovereign.example-mobile-poc"` and `routePrefix: "/example-mobile-poc"`;
only the directory name and its missing `example: true` flag were wrong.

**Deliverables:**

- Moved `plugins/example-mobile` → `example-plugins/example-mobile-poc`
  (directory name now matches the manifest `id`/`routePrefix` it already
  had). Content unchanged — a tasks-style navigable section index with a
  per-section carousel and a desktop sidebar fork, navigation/UI events
  only, no data layer.
- Added the `example: true` manifest flag so it's discovered, gated by
  `SOVEREIGN_EXAMPLES_ENABLED`, and individually toggleable like every other
  example — it had none of that while it sat under `plugins/`.
- `docs/plugin-development.md`'s example table gained a ninth row.

**Dependencies:** None — a relocation and a manifest flag, not new
functionality. Distinct from Task 9.24 itself (the runtime shell's real
adoption of `MobileHeader`/`MobileFooter`), which this plugin evaluates but
does not implement.

**SRS reference:** None — not RFC-tracked; a workspace-hygiene fix.

**Review checklist:**

- `plugins/` no longer contains any `example`-flagged or example-purposed
  content — `pnpm --filter @sovereignfs/example-mobile-poc typecheck`
  passes from its new location.
- `SOVEREIGN_EXAMPLES_ENABLED=1 pnpm generate` composes all 9 examples with
  no plugin ID or route-prefix collisions.

---
