# Example plugins plan

**Status:** Partially implemented
**Scope:** Adhoc implementation blueprint outside the main roadmap
**Retention:** Keep after implementation as a planning and decision log

This document captures the planned example plugin set for Sovereign. It is a
documentation-first implementation plan: no code should be changed from this
document alone. Future implementation tasks should cite this plan, update the
adhoc task status in this document, and then make the corresponding code,
registry, and documentation changes.

Documents under `docs/adhoc/` track implementation plans that should stay
outside the canonical roadmap/epic queue. They are retained after completion as
lightweight logs of scope, decisions, and follow-up work.

## Implementation log

### 2026-07-02

- Tightened the manifest schema so code accepts only `runtime: "native"`;
  future runtime models remain documented as planned/deferred.
- Added `Example: Overlay Small`, `Example: Overlay Medium`, and
  `Example: Overlay Large` as separate plugins because overlay size is
  manifest-level configuration.
- Added `Example: Minimal` for the chrome-free shell mode.
- Expanded `Example: API` into the active `apiProvider: true` reference with
  deterministic GET/POST delegated routes and structured errors.
- Expanded `Example: Monetized` with explicit manifest, middleware, and reserved
  SDK billing notes.
- Updated the generated registry and plugin development docs for the seven
  local examples.
- Remaining: externalize shippable example sources into first-party repository
  infrastructure and wire them into default install configuration.

## Goals

- Ship a small, coherent set of example plugins that demonstrate the platform's
  supported plugin surfaces.
- Keep examples installable by default, while moving their primary source out of
  the main platform repository.
- Keep the main repository focused on the platform runtime, SDK, tests, and
  deterministic fixtures.
- Avoid exposing not-yet-implemented runtime models as accepted manifest values.
- Preserve the current documentation-first workflow: plan, document, task, then
  implement.

## Non-goals

- Do not introduce new runtime models as part of the example plugin work.
- Do not implement iframe, remote, or external plugin runtimes yet.
- Do not make example plugins full product plugins. They are teaching artifacts
  and regression fixtures, not end-user apps.
- Do not remove deterministic test coverage just because the shippable examples
  move out of the main repository.

## Final example set

The default example set should contain seven installed example plugins. Product
UI should continue using "app" for end-user labels where appropriate, but these
developer-facing examples may use "plugin" in docs and source.

| Display name              | Purpose                            | Primary surface demonstrated                 |
| ------------------------- | ---------------------------------- | -------------------------------------------- |
| `Example: Basic`          | Normal native plugin               | `runtime: "native"`, `shell: "default"`      |
| `Example: Overlay Small`  | Small overlay dialog               | `shell: "overlay"`, `overlaySize: "sm"`      |
| `Example: Overlay Medium` | Medium overlay dialog              | `shell: "overlay"`, `overlaySize: "md"`      |
| `Example: Overlay Large`  | Large overlay dialog               | `shell: "overlay"`, `overlaySize: "lg"`      |
| `Example: Minimal`        | Full-screen/chrome-free plugin     | `shell: "minimal"`                           |
| `Example: API`            | Public API namespace provider      | `apiProvider: true`                          |
| `Example: Monetized`      | Paid plugin and entitlement gating | `monetization`, paywall, license import flow |

The three overlay examples are intentionally separate plugins because
`shellConfig.overlaySize` is manifest-level configuration. A single plugin
cannot show all three sizes at runtime without changing its manifest. Separate
plugins make the behavior honest, visible, and easy to test.

## Example details

### Example: Basic

Keep the existing `Example: Basic` concept. It remains the default "first
plugin" reference.

Manifest intent:

- `runtime: "native"`
- `shell: "default"` or omitted
- `permissions`: at least `auth:session`
- `capabilities`: include one simple plugin-declared capability with
  `defaultGrant: "all"` so developers can see the namespaced capability pattern.

Demonstrates:

- Reading the current session with `sdk.auth`.
- Using `@sovereignfs/ui` components.
- Styling with `--sv-*` design tokens.
- Checking a plugin-declared capability with `sdk.auth.hasCapability`.
- Explaining `adminOnly` as a nearby manifest option.

Implementation notes:

- Do not enable `adminOnly` on this plugin by default. The Basic example should
  stay visible to all authenticated users.
- Document `adminOnly` in the page or plugin README as the route-level
  admin-gating option.
- Keep code minimal and stable. This plugin should be the easiest one to copy.

### Example: Overlay Small

Manifest intent:

- `runtime: "native"`
- `shell: "overlay"`
- `shellConfig.overlaySize: "sm"`
- `permissions`: `auth:session`

Demonstrates:

- Compact interruption-style overlay UI.
- Platform-owned dialog chrome.
- Hard-load fallback to a full page.
- No plugin-owned modal wrapper.

Implementation notes:

- Keep content intentionally small: a compact settings or quick-action form.
- Include one intra-overlay navigation action that uses replace navigation,
  matching the overlay routing rule.

### Example: Overlay Medium

Manifest intent:

- `runtime: "native"`
- `shell: "overlay"`
- `shellConfig.overlaySize: "md"`
- `permissions`: `auth:session`

Demonstrates:

- Medium dialog layout for workflows with multiple controls.
- Overlay route composition and hard-load fallback.
- Stable dimensions independent of content height.

Implementation notes:

- Use a two-section form or preview surface.
- Keep the structure similar to the small and large examples so the size
  difference is the main thing developers notice.

### Example: Overlay Large

Manifest intent:

- `runtime: "native"`
- `shell: "overlay"`
- `shellConfig.overlaySize: "lg"`
- `permissions`: `auth:session`

Demonstrates:

- Large overlay layout for settings, admin, or quick management workflows.
- The default overlay size when `overlaySize` is omitted.
- Multi-section content inside platform-owned dialog chrome.

Implementation notes:

- This can be the most content-rich overlay example, but it should still avoid
  becoming a product app.
- Mention that `lg` is the default overlay size.

### Example: Minimal

Manifest intent:

- `runtime: "native"`
- `shell: "minimal"`
- `permissions`: `auth:session`

Demonstrates:

- Chrome-free, full-bleed plugin composition.
- Plugin-owned navigation because the platform shell is absent.
- Good use cases: kiosk display, canvas/editor, wallboard, immersive workflow.

Implementation notes:

- Make the visual layout clearly different from a default-shell page.
- Include an obvious way back to the Launcher or root route because the platform
  sidebar/header is absent.
- Prefer a simple fullscreen control surface, dashboard, or canvas-like view.

### Example: API

Keep the existing `Example: API` concept and expand it.

Manifest intent:

- `runtime: "native"`
- `shell: "default"`
- `apiProvider: true`
- `permissions`: whichever permissions are actually required by the example

Demonstrates:

- Public `/api/*` namespace delegation.
- The one-provider-per-instance rule.
- Mapping from `/api/<slug>/*` to the plugin serve route.
- Route handlers for at least one `GET` request and one `POST` request.
- Structured success and error responses.
- A lightweight API-key or signed-request pattern if that is the intended
  guidance for public API consumers.

Implementation notes:

- The page should show concrete request examples and expected responses.
- The route handlers should be deliberately simple and deterministic.
- Avoid implying that all plugin pages are public. Only the delegated API
  namespace is public.

### Example: Monetized

Keep the existing `Example: Monetized` concept and expand the explanation.

Manifest intent:

- `runtime: "native"`
- `shell: "default"`
- `type: "sovereign"` or `community`
- `monetization` with a paid model, tiers, and Ed25519 public key
- `permissions`: `auth:session`

Demonstrates:

- Manifest-declared monetization.
- Platform paywall behavior.
- Offline Ed25519 license verification.
- License import flow through Account.
- Entitlement visibility through Console.
- Tier-aware UI patterns.

Implementation notes:

- Be precise about what is implemented now versus reserved. Route-level
  entitlement gating and license import are demonstrable; any SDK billing
  helper that still throws must be labeled as reserved/planned until implemented.
- Keep committed demo keys clearly marked as demo-only.
- Include copy-pasteable local test steps in docs, not just in source comments.

## Repository and default-install model

The shippable examples should move out of the main platform repository, but they
should still be installed by default for local development and fresh
self-hosted instances that use the default plugin set.

Recommended structure:

1. Use separate first-party example plugin repositories, or one first-party
   examples repository with one directory per plugin.
2. Publish/pin each example through the plugin registry.
3. Add the desired examples to the default install configuration used by
   `scripts/install-plugins.ts` / `sv plugin add` workflows.
4. Keep minimal deterministic fixtures in the platform repository only where
   tests need local source without network access.
5. Make the distinction explicit in docs:
   - shippable examples live outside the platform repository;
   - test fixtures may live inside the platform repository;
   - default-installed examples are resolved from the registry/default install
     configuration.

The default-installed examples should be pinned by commit/ref and content hash
where the registry supports provenance. Floating references are inappropriate
for CI and reproducible installs.

## Runtime manifest cleanup

Current manifest schema accepts runtime values that are not implemented. The
code should stop accepting future runtime values until those runtimes are
implemented.

Code should accept:

- `native`

Docs may continue describing future runtime concepts as planned/deferred:

- `static`
- `iframe-local`
- `iframe-remote`
- `external`

Implementation tasks:

1. Change the manifest schema runtime enum to accept only `native`.
2. Update generated/exported manifest types accordingly.
3. Update manifest validation tests that currently expect future runtime values
   to pass.
4. Update plugin development docs so the manifest reference lists only
   currently accepted code values, with a separate future-runtimes note.
5. Update the SRS/runtime design docs to distinguish implemented manifest values
   from planned runtime models.
6. Check scaffolding code and template docs for runtime choices.
7. Run docs parity and manifest validation checks.

This cleanup is intentionally separate from implementing the example plugins.
It can land before the examples are externalized.

## Implementation phases

### Phase 1: Documentation and task setup

Deliverables:

- This planning document.
- Roadmap and epic task entries for the implementation work.
- Updated plugin development docs that preview the new example set.

Review checklist:

- The plan clearly separates current implementation from future runtimes.
- The overlay size decision is documented as three plugins.
- No source code changes are mixed into the planning-only task.

### Phase 2: Runtime manifest cleanup

Deliverables:

- Manifest schema accepts only `runtime: "native"`.
- Docs continue to mention deferred runtime models without presenting them as
  accepted code values.
- Tests updated for the tighter schema.

Review checklist:

- Existing first-party plugins validate.
- Invalid future runtime values fail manifest validation.
- Docs explain how future runtime models will return later.

### Phase 3: Expand in-repo examples or fixtures

Deliverables:

- Add `Example: Overlay Small`, `Example: Overlay Medium`,
  `Example: Overlay Large`, and `Example: Minimal`.
- Expand `Example: API` and `Example: Monetized`.
- Keep `Example: Basic` behavior stable.

Review checklist:

- `pnpm generate` composes all examples correctly.
- Overlay plugins exercise all three `overlaySize` values.
- Minimal plugin composes under the minimal route group.
- API provider uniqueness still holds.
- Monetized plugin paywall flow remains covered by E2E tests.

### Phase 4: Externalize shippable example sources

Deliverables:

- Move shippable examples into first-party external repos or a first-party
  examples repository.
- Add registry entries with pinned provenance.
- Add default install configuration so the examples are installed by default.
- Keep or add local fixtures needed for deterministic tests.

Review checklist:

- Fresh install/dev flow includes the examples by default.
- CI does not depend on floating network state.
- Documentation points developers to the external example sources.
- Runtime tests still have deterministic local fixtures.

### Phase 5: Documentation polish and cross-links

Deliverables:

- Update `docs/plugin-development.md` example plugin table.
- Update `docs/epics/example-plugins.md` or create new task entries if the old
  epic remains complete.
- Update relevant RFC status notes if needed.
- Add links from API, overlay, minimal shell, and monetization sections to the
  corresponding examples.

Review checklist:

- Developers can discover which example teaches which feature.
- End-user-facing language uses "app" where appropriate.
- Developer docs use "plugin" consistently for architecture and manifest
  concepts.

## Suggested task breakdown

These are candidate tasks for roadmap/epic planning. Stable epic task IDs should
be assigned when the roadmap is updated.

| Candidate task                           | Scope                                                          |
| ---------------------------------------- | -------------------------------------------------------------- |
| Example plugin plan                      | Add this document and task planning entries.                   |
| Tighten runtime manifest enum            | Accept only `native` in code; keep future runtimes in docs.    |
| Overlay example plugins                  | Add small, medium, and large overlay examples.                 |
| Minimal example plugin                   | Add full-bleed minimal-shell example.                          |
| API example expansion                    | Add richer endpoint examples and developer-facing docs.        |
| Monetized example expansion              | Clarify billing/entitlement behavior and local test flow.      |
| External default example plugin install  | Move shippable sources out of repo; install by default.        |
| Example fixture/test separation          | Keep deterministic local fixtures where runtime tests need it. |
| Plugin development documentation refresh | Update example table, links, and future-runtime language.      |

## Open decisions

- Whether the external examples live in one repository or one repository per
  example plugin.
- Whether externalized examples use `type: "sovereign"` from the start or keep
  a transitional in-repo `platform` type until registry installation is wired.
- Whether `static` should be removed from accepted code values along with the
  iframe and external runtime values. The strict plan is to accept only
  `native` until any non-native runtime is implemented.
- Whether the API example should demonstrate API-key auth, signed requests, or
  only public deterministic endpoints.
- Whether example plugins remain enabled in production defaults or only in
  development/demo presets.
