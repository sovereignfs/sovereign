# RFC 0076 — Design system sizing alignment and new primitive components

**Status:** Draft\
**Date:** July 2026\
**Author:** Claude Code\
**Scope:** `packages/ui` (tokens, existing components, new components,
Storybook), `docs/design-system.md`. Builds on
[Research 0004](../research/0004-ui-component-sizing-and-catalog-expansion.md).\
**Incorporated into plan:** No — documentation-first. This RFC covers phases
1–2 of Research 0004's phased plan only: token/sizing alignment across
existing components, plus a curated set of new, non-breaking primitive
components. It does not cover the compound-API rework of existing components
or the mobile-adapted Combobox/Input OTP — those are separate RFCs per
Research 0004's "Next steps."

---

## Summary

Align `packages/ui`'s sizing scale toward a denser, more conventional web-app
baseline (control heights, spacing rhythm, font sizes, radii) across existing
components, and add 13 new primitive components Sovereign is missing:
Switch, Radio Group, Slider, Progress, Separator, Skeleton, Table, Alert,
Breadcrumb, Pagination, Kbd, Accordion, Collapsible. Both parts are additive
— no existing component's public API changes, only visual sizing and net-new
exports.

## Motivation

Research 0004 found that a wholesale catalog/spec rework conflates three
different-risk changes. This RFC scopes the lowest-risk one: a denser sizing
scale is a useful rhythm reference, and Sovereign is missing a set of boring,
generic primitives (switches, sliders, tables, alerts…) that any plugin
building a settings screen, form, or list view will eventually reach for and
currently has to hand-roll. Shipping these first, without touching any
existing component's API, delivers real value immediately and establishes
the sizing baseline that later, riskier phases (compound-API rework,
Combobox/Input OTP) will design against.

## Current state (what this builds on)

- `packages/ui/src/tokens/primitives.css` already defines a scale that tracks
  a common 4px/8px spacing rhythm closely: `--sv-font-size-sm` is 14px,
  `--sv-radius-md` is 8px, spacing steps follow the same rhythm. This RFC
  does not propose new primitive tokens — the scale is already close enough
  that alignment is mostly about _applying_ it consistently to component
  dimensions, not redefining it.
- `Button.module.css` already establishes the pattern this RFC generalizes:
  visual rendered height per size (24/30/36px for sm/md/lg) with
  `min-height: var(--sv-touch-target-min, 44px)` as the actual hit target,
  backed by the `--sv-touch-target-min: 44px` primitive token. Every new or
  resized interactive component in this RFC follows the same pattern.
- Two-tier token architecture (primitive → semantic) is documented in
  `docs/design-system.md` §"Token architecture" — new components consume
  semantic tokens only, per existing convention.
- `packages/ui` is currently at `0.42.0`, published as `@sovereignfs/ui`
  under NFR-04.

## Proposed design

### Part A — sizing alignment on existing components

Audit each existing interactive component (`Button`, `Input`, `Select`,
`Checkbox`, `Toggle`, `SegmentedControl`, `Tabs`, `Menu` items, `Dialog`
padding/radius, `Card` padding/radius) against a denser default/sm/lg scale
and adjust CSS Module values to match, using the Button pattern as the
template: visual size matches the target scale, `min-height`/hit-area stays at or above
`--sv-touch-target-min`. Where a component doesn't yet expose size variants
(sm/md/lg) that the target scale does, this RFC does not add them speculatively —
sizing alignment applies to whatever variants already exist today; adding new
size variants to an existing component is a separate, scoped decision (each
would itself need a Storybook story update and is arguably an API surface
change worth its own review, even if additive).

This is a visual-only change. No component's props, exports, or DOM
structure change. Under NFR-04's letter this doesn't require a version bump
(no breaking change), but per its spirit — visible change to a public design
system — ships with a minor bump and a `design-system.md` note so consumers
notice at a glance (see Adoption path).

### Part B — new primitive components

13 new components, each following existing `packages/ui` conventions (CSS
Modules, semantic tokens only, flat controlled-prop API matching the style of
`Tabs`/`Toggle`/`Checkbox`, `min-height`/hit-area on anything interactive,
Storybook story + `DesignSystemOverview.stories.tsx` gallery entry per the
Storybook hygiene rule in `CLAUDE.md`):

| Component     | Notes                                                                                                                                                                                                           |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Switch`      | On/off control, distinct from existing button-style `Toggle`                                                                                                                                                    |
| `RadioGroup`  | Controlled `items` + `value`/`onChange`, same shape as `Tabs`'s API                                                                                                                                             |
| `Slider`      | Single-thumb range input; range/dual-thumb deferred until a consumer needs it                                                                                                                                   |
| `Progress`    | Determinate bar; indeterminate variant only if a consumer needs it                                                                                                                                              |
| `Separator`   | Horizontal/vertical divider; likely the smallest component in the set                                                                                                                                           |
| `Skeleton`    | Loading-state placeholder block(s); pairs with existing `Spinner`                                                                                                                                               |
| `Table`       | Plain semantic table (`thead`/`tbody`/`tr`/`td` wrappers with DS styling) — explicitly not a full sortable/filterable/virtualized Data Table; see Research 0004's "full Data Table — Out" decision              |
| `Alert`       | Inline, non-dismissible banner — distinct from `Toast` (transient) and `SystemBanner` (instance-wide); fills the "form-level error / explain an empty state" gap `sv-ui-design`'s ActionResult convention wants |
| `Breadcrumb`  | Link trail; consumes `<Link>` per Next.js convention like `NavTabs` does                                                                                                                                        |
| `Pagination`  | Page-number / prev-next control                                                                                                                                                                                 |
| `Kbd`         | Inline keyboard-key styling; trivial, useful once any shortcut/palette surface exists                                                                                                                           |
| `Accordion`   | Expand/collapse single or multi-section; keyboard support (Enter/Space to toggle, no arrow-key requirement since sections aren't a roving-tabindex widget)                                                      |
| `Collapsible` | Single expand/collapse primitive `Accordion` composes internally, exported separately since it's independently useful (e.g. a "show more" toggle)                                                               |

All components are net-new exports from `@sovereignfs/ui` — zero risk to
existing consumers.

## Alternatives considered

**Bundle Part A and Part B with the compound-API rework (Research 0004
Option A / phase 3).** Rejected per Research 0004's phased recommendation —
mixing an additive, no-risk change with a breaking one forces every consumer
to absorb both at once and removes the ability to ship this RFC's value
quickly.

**Skip the sizing audit, only add new components sized to the target scale.**
Rejected — would leave existing and new components visually inconsistent
with each other (e.g. a densely-sized `Switch` next to an unaligned `Button`),
undermining the stated goal ("sizes should be the same") and the actual
motivation (visual consistency across the whole DS).

## Open questions

- Should `Accordion` and `Collapsible` ship together in this RFC's scope, or
  should `Collapsible` land first as the smaller primitive with `Accordion`
  as a fast-follow that composes it? (Sizing/risk is identical either way —
  purely a sequencing question for the eventual epic tasks.)
- Exact per-component size-variant audit (which of sm/md/lg each existing
  component should expose) is deferred to implementation — this RFC commits
  to the _pattern_, not a component-by-component table, to avoid the RFC
  going stale against the actual token values by the time it's scheduled.

## Adoption path

Documentation-first; no `ROADMAP.md` scheduling commitment yet. Broken down
into epic tasks 25.1–25.6 in the new [UI Component Parity](../epics/ui-component-parity.md)
epic: one task for Part A (sizing audit), and five tasks for Part B's
component batches (`Switch`+`RadioGroup`, `Slider`+`Progress`,
`Table`+`Alert`, `Breadcrumb`+`Pagination`+`Kbd`, `Accordion`+`Collapsible`).
Each follows normal branch-per-task convention once assigned a roadmap slot.

**Semver:** `@sovereignfs/ui` takes a **minor** bump under `feat/` per NFR-04
(new components are a feature addition; the sizing audit is a visual, non-API
change but ships in the same bump for consumer visibility). No migration
note required in `docs/upgrade.md` since nothing breaks. Each Storybook story
addition follows the existing hygiene rule — `DesignSystemOverview.stories.tsx`
gallery entry + `pnpm --filter @sovereignfs/ui typecheck` per component PR.

## Changelog

| Version | Date      | Change        |
| ------- | --------- | ------------- |
| 0.1     | July 2026 | Initial draft |
