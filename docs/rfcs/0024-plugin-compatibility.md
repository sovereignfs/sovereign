# RFC 0024 — Plugin compatibility & versioning

**Status:** Accepted\
**Date:** June 2026\
**Author:** kasunben\
**Scope:** `packages/manifest` (`maxPlatformVersion` + semver validation + `CURRENT_MANIFEST_SCHEMA_VERSION` + a `checkCompatibility` resolver; add `semver`), `scripts/generate-registry.ts` + `scripts/install-plugins.ts` + `bin/sv` (install/build gates), runtime startup + `plugin_status` + `/api/admin/health` (boot disable + surface), `registry/plugins.json` (Task 0.5.18), `docs/plugin-development.md` + `docs/self-hosting.md`; **amends RFC 0006** (consumes the boot gate + admin-health surfacing), disambiguates from **RFC 0007** (`schemaVersion` clash), relates to Task 0.5.18/0.5.19\
**Incorporated into plan:** Yes — scheduled as roadmap Task 0.5.21; documentation-first. This RFC defines the compatibility model and where it is enforced; SRS requirement IDs, scheduling, and task allocation are deferred.

---

## Summary

Make the manifest's dormant version fields functional. Today `schemaVersion` and
`compatibility.minPlatformVersion` are declared, structurally validated, and then
**ignored** — no semver check, no comparison against the running platform, no
`maxPlatformVersion`. This RFC:

- adds real **semver** validation and a **platform-version compatibility** model —
  **`minPlatformVersion` hard-enforced**, a new **`maxPlatformVersion` advisory**
  (warns, doesn't block);
- makes **`schemaVersion`** functional via a current-version constant (accept older,
  reject unknown-newer manifest formats);
- enforces all of it through **one shared resolver** at four points — **install**,
  **build**, **boot**, and the **registry** — with **tiered** behaviour: install and
  build **refuse** an incompatible plugin; boot **disables and surfaces** it so a
  single bad plugin never bricks the instance.

## Motivation

A plugin built for a newer platform should fail loudly at install rather than
misbehave; an instance that upgrades its platform shouldn't be bricked by one plugin
that now requires something newer; and the manifest format needs room to evolve
without breaking every existing plugin. The fields to express all this already exist
— they're just inert. RFC 0006 already called for reusing `minPlatformVersion` as an
install-/start-time check "so a plugin built for a newer platform fails loudly," and
deferred the implementation; this RFC supplies the model.

## Current state (what this builds on)

- **Declared, not enforced.** `packages/manifest/src/schema.ts` has
  `schemaVersion: z.number().int().positive()` (always `1`, no constant) and
  `compatibility: { minPlatformVersion: z.string().min(1) }` (any non-empty string).
  A repo-wide search finds **no version comparison anywhere** — both fields are
  declarative.
- **No `maxPlatformVersion`** and **no `semver` library** in the repo.
- **Validation pipeline.** `validateManifest` (`packages/manifest/src/validate.ts`) is
  structural-only; `scripts/generate-registry.ts` fails the build on an invalid
  manifest — the natural place to add a compatibility gate.
- **Platform version.** Lives in root `package.json` (currently `0.6.0`), read via
  `getPlatformVersion()` (`packages/sdk/src/platform.ts`), exposed through
  `sdk.platform.getConfig().version` and `/api/admin/health`.
- **RFC 0006 anticipated this** — "reuse `compatibility.minPlatformVersion` as an
  install-/start-time check … fail loudly," plus a startup version gate surfaced in
  admin health (deferred). **Task 0.5.18** registry "must target compatible platform
  version" is a human review note today; **Task 0.5.19** defines SDK semver.

## The three version concepts (disambiguation)

| Concept                                                           | Versions what                                      | Compared against                                 |
| ----------------------------------------------------------------- | -------------------------------------------------- | ------------------------------------------------ |
| Manifest **`schemaVersion`**                                      | The **manifest format** itself                     | The platform's `CURRENT_MANIFEST_SCHEMA_VERSION` |
| **`compatibility.minPlatformVersion`** / **`maxPlatformVersion`** | The **platform version range** the plugin supports | The running platform version (semver)            |
| **SDK semver** (Task 0.5.19)                                      | The plugin↔platform **contract**                   | (v1: implied by platform version)                |

For v1 the **platform version is the single compatibility axis** a plugin declares —
the SDK ships with the platform, so plugins don't separately pin an SDK range.

**Note the clash with RFC 0007:** that RFC reuses the name `schemaVersion` for a
plugin's **data-format** version inside export bundles — a different field in a
different namespace. This RFC's `schemaVersion` is the **manifest format** version.
The two are intentionally distinct.

## Proposed design

### Semver validation

Add `semver` (pure JS, catalog-pinned) to `packages/manifest`. Tighten
`minPlatformVersion` (and the new `maxPlatformVersion`) from `z.string().min(1)` to
**valid semver** at validation time, and use real semver comparison (a lexicographic
compare would mis-order `0.10.0` vs `0.9.0`).

### `minPlatformVersion` (hard) + `maxPlatformVersion` (advisory)

- **`minPlatformVersion`** — a **hard gate**: a plugin whose minimum exceeds the
  running platform version is **incompatible**.
- **`maxPlatformVersion`** — a new **optional** field, **advisory**: a plugin running
  on a platform _above_ its declared max still loads, but emits a **warning**
  (surfaced in Console/health, logged) — "tested up to X; running on Y." This avoids
  stranding working plugins or forcing a max bump every platform release.

### `schemaVersion` (functional)

Add `CURRENT_MANIFEST_SCHEMA_VERSION` (= 1) in `packages/manifest`. Accept a manifest
with `schemaVersion ≤ current` (older plugins keep working as the format evolves);
**reject** a higher value with a clear error — "manifest format newer than this
platform understands." (An optional `MIN_SUPPORTED_SCHEMA_VERSION` lets ancient
formats be dropped eventually.)

### The shared resolver

A pure function in `packages/manifest`, reused everywhere so behaviour is identical:

```ts
checkCompatibility(
  manifest: SovereignManifest,
  platformVersion: string,
): { compatible: boolean; reason?: string; warnings: string[] };
```

- `compatible: false` + `reason` when `minPlatformVersion` > platform, or
  `schemaVersion` > current.
- `warnings` for the advisory `maxPlatformVersion` overshoot.
- No platform dependencies; unit-tested in isolation.

### Tiered enforcement

| Check point                                       | Behaviour on incompatible                                          |
| ------------------------------------------------- | ------------------------------------------------------------------ |
| **Install** (`sv plugin add` / `install-plugins`) | **Refuse** with a clear error before adding.                       |
| **Build / generate** (`generate-registry.ts`)     | **Fail the build** for composed in-repo plugins (the dev path).    |
| **Boot / startup**                                | **Disable + surface** the plugin (Console/health) — never brick.   |
| **Registry** (Task 0.5.18)                        | **Filter** so users only see plugins installable on their version. |

The boot path re-checks against the (possibly upgraded) platform version and marks
the plugin **incompatible-disabled** — distinct from an admin-disabled plugin in
`plugin_status`/Console — feeding RFC 0006's admin-health version gate. Advisory-max
warnings surface but don't disable.

### Coordination with RFC 0006 / 0007

This RFC owns the **model + fields + resolver + install/build checks**; **RFC 0006
consumes** the boot-time gate and the admin-health surfacing (cross-referenced; a
light amendment). RFC 0007's export-bundle `schemaVersion` remains a separate concept
(noted above).

## UI / flows

A developer whose `minPlatformVersion` is too new gets a build/install error naming
**required vs current** version. After a platform upgrade, an incompatible installed
plugin appears as **disabled-incompatible** in Console + `/api/admin/health` with the
reason. A plugin past its advisory `max` shows a **non-blocking warning**. The
registry hides plugins that don't satisfy the viewer's platform version.

## Alternatives considered

1. **Hand-rolled version compare.** Rejected — lexicographic ordering mishandles
   `0.10.0` vs `0.9.0`; `semver` is tiny, pure-JS, and correct.
2. **Hard-enforced `maxPlatformVersion`.** Rejected (per decision) — it strands
   working plugins and forces a maintenance bump on every platform release; advisory
   is the pragmatic default.
3. **Fail loudly everywhere on incompatibility.** Rejected — at boot, one external
   plugin requiring a newer platform would take down the whole instance; tiered
   (refuse on the explicit actions, disable+surface at boot) is safer.
4. **Leave `schemaVersion` declarative.** Rejected — the goal includes real schema
   validation + backward compatibility as the manifest format evolves.

## Open questions

1. **Incompatible-disabled representation** — a `plugin_status` flag vs derived at
   boot from the resolver.
2. **Max escalation** — should advisory `max` ever become hard at a platform
   **major** boundary?
3. **`MIN_SUPPORTED_SCHEMA_VERSION`** — introduce now or when the format first changes?
4. **SDK range** — should plugins additionally pin an SDK version range later
   (deferred — platform version is the v1 axis)?
5. **Requirement IDs** — deferred until accepted.

## Adoption path

1. **Documentation-first (this RFC).**
2. **When accepted & scheduled:** add `semver` + `maxPlatformVersion` + semver
   validation + `CURRENT_MANIFEST_SCHEMA_VERSION` + the `checkCompatibility` resolver
   (manifest **minor** bump); wire the four check points; surface boot
   incompatibility in Console/health (with RFC 0006); document in
   `docs/plugin-development.md` + `docs/self-hosting.md` (+ docs-parity for the new
   field).

## Changelog

| Version | Date     | Change                                                                                                                                                                                                                                                                                           |
| ------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 0.1     | Jun 2026 | Initial draft; makes `schemaVersion` + `compatibility` functional — semver-validated `minPlatformVersion` (hard) + advisory `maxPlatformVersion`, a `CURRENT_MANIFEST_SCHEMA_VERSION` accept-range, one shared resolver, tiered enforcement at install/build/boot/registry; documentation-first. |
| 0.2     | Jun 2026 | Accepted; scheduled in the roadmap as Task 0.5.21.                                                                                                                                                                                                                                               |
