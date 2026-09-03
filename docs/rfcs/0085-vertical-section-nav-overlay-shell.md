# RFC 0085 — Vertical section navigation for overlay-shell plugins (`NavRail`)

**Status:** Partially implemented — Account's half fully shipped across tasks
14.5 and 14.6; Console's half superseded by workstream 0022's different
design — see update below\
**Date:** August 2026\
**Author:** Claude Code + kasunben\
**Scope:** `packages/ui` (new component, `Dialog` sizing, Storybook),
`plugins/console`, `plugins/account`, `docs/design-system.md`,
`docs/plugin-development.md`. Related to [RFC 0076](0076-ds-sizing-alignment-and-new-primitives.md)
(new-primitives precedent) and [RFC 0001](0001-overlay-shell-variant.md)
(original overlay shell design).\
**Incorporated into plan:** Partially — Console's half (originally epic task
9.22 in the [Design System](../epics/design-system.md) epic) was rejected as
scoped; see below. Account's half is scoped as
[epic task 14.5](../epics/plugin-accounts.md) (desktop rail) and
[epic task 14.6](../epics/plugin-accounts.md) (mobile drill-down nav) in the
[Plugin — Accounts](../epics/plugin-accounts.md) epic.

> **Update:** Written independently of, and in parallel with,
> [workstream 0022](../workstreams/0022-console-shell-and-three-column-layout.md),
> which resolves the same underlying problem (Console's hand-rolled
> horizontal tab strip) for Console with a different, incompatible design:
> `shell: "overlay"` → `shell: "default"` (a real full page, not a resized
> dialog) plus `ThreeColumnLayout` and a new `NavList` component, including
> a mobile drill-down redesign this RFC had explicitly deferred as
> "future work, not a follow-up task yet." The two designs surfaced as a
> genuine merge conflict (workstream 0022 had already shipped code before
> this RFC's existence was discovered); the developer chose to keep
> workstream 0022's direction for Console. **This RFC's Console-specific
> proposal is superseded and will not be built as written** — epic task 9.22
> is marked Rejected accordingly. The `NavRail`-in-overlay pattern itself,
> and its application to Account (untouched by workstream 0022), are **not**
> rejected — they remain a live option, just no longer scoped as a single
> combined task with Console. A future task revisiting `NavRail` for Account
> alone would need to re-derive its own scope from this RFC rather than
> reuse rejected task 9.22.

> **Update 2:** Account's half re-scoped as
> [epic task 14.5](../epics/plugin-accounts.md). Two changes from this RFC's
> original design, decided during that re-scoping: Account stays
> `shell: "overlay"` rather than following Console's `shell: "default"`
> conversion — Console's composition depends on a full-page height-unlock
> hook (`data-plugin-fullbleed`) that doesn't reach inside a `Dialog`. And no
> new `NavRail` component is built — `@sovereignfs/ui`'s existing `NavList`
> (shipped for Console in workstream 0022 leg 1) has no such height
> dependency and drops into Account's `Dialog` directly, so this RFC's
> originally-proposed component work is no longer needed for Account either.
> The originally-planned `"lg" → "md"` resize itself did **not** ship as
> scoped, in three further rounds during implementation: task 14.5 first kept
> `overlaySize: "lg"` unchanged (`md`'s content-driven height would have made
> the dialog resize between short and long sections, which `lg`'s fixed box
> was specifically chosen to avoid), then, once `lg` itself read as oversized
> for a settings surface, switched to `@sovereignfs/ui`'s existing `auto`
> size instead of `md` — content-driven on both axes, already used by
> runtime-direct `<Dialog>` callers, extended to the manifest `overlaySize`
> enum for the first time — and finally, once `auto`'s own content-driven
> sizing turned out to visibly shrink to fit a near-empty intermediate page
> during Account's `/account` → `/account/profile` redirect before growing
> once real content landed, switched again to a new `DialogSize`, `fixed` —
> a true fixed box like `lg` (content never resizes it) but capped at
> `64rem × 44rem` instead of filling the viewport. See task 14.5's own
> Status note for the full three-round account.

> **Update 3:** This RFC's own Alternatives/Open-questions entries below
> ("Ship the full mobile drill-down... Noted as explicit future work so it
> isn't lost" / "Full mobile drill-down list. Explicitly future work... not
> scheduled by this RFC") are picked up by
> [epic task 14.6](../epics/plugin-accounts.md), scoped as a follow-up to
> 14.5 rather than folded into it. Account's mobile nav now matches the
> drill-down pattern Console itself shipped for its own mobile nav (task
> 13.17, workstream 0022): a full-screen index of tappable section rows,
> selecting one navigates into that section, which shows a `‹ Account`
> back-link instead of any persistent nav. See task 14.6's own Status note
> for the full account, including a real correctness risk found and
> resolved during planning (a redirect-vs-viewport race, same bug class as
> task 14.5's own rounds 3–4).

---

## Summary

Console and Account currently render their section navigation ("Users",
"Plugins", "Settings"... / "Profile", "Security", "Data"...) as a horizontal
underline tab strip at the top of a full-screen (`overlaySize: "lg"`) dialog.
This RFC proposes switching both to a **vertical rail** navigation pattern —
similar to Claude's own desktop settings modal — backed by a new
`packages/ui` primitive (`NavRail`), and shrinking the dialog both plugins
render in from `lg` (full-screen) to a resized `md` (a fixed, landscape-
oriented box) so the rail-plus-content layout doesn't sprawl across the whole
viewport. Mobile keeps its current behavior unchanged in this pass.

## Motivation

Console has 11 sections and Account has 7; a horizontal strip at this count
already wraps or scrolls sideways, and a full-screen dialog for what is
functionally a settings panel reads as heavier than the content warrants. A
vertical rail scales better to a longer, flatter list of sections and matches
a well-established pattern for exactly this kind of surface (OS preference
panes, Claude's own settings modal, GitHub repo settings).

Separately, today's implementation is duplicated: Console and Account each
hand-roll their own horizontal nav CSS rather than sharing a component, which
is exactly the kind of drift `docs/design-system.md`'s "DS-first: plugins are
consumers" principle exists to prevent. This RFC's component work retires
that duplication in the same pass as the visual change.

## Current state (what this builds on)

- **Overlay sizing already has three fixed-box sizes.** `Dialog`
  (`packages/ui/src/components/Dialog/Dialog.tsx:59`) exposes
  `DialogSize = 'sm' | 'md' | 'lg' | 'full'`; the manifest schema
  (`packages/manifest/src/schema.ts:166`) already validates
  `overlaySize: z.enum(['sm', 'md', 'lg'])`. `md` is defined in
  `Dialog.module.css:108-113` as a fixed `36rem × 42rem` (576×672px, portrait)
  box, but **no shipped plugin uses it** — only the reference
  `example-plugins/example-overlay-medium`. Console and Account are both
  pinned to `overlaySize: "lg"` (`plugins/console/manifest.json`,
  `plugins/account/manifest.json`).
- **Every size collapses to full-screen on mobile regardless of value**
  (`Dialog.module.css:163-198`, `@media (max-width: 768px)`), so resizing
  `md` is a desktop-only concern.
- **Three separate tab implementations already exist, none vertical:**
  `packages/ui`'s `Tabs` (`components/Tabs/Tabs.tsx`, controlled
  `value`/`onChange`, ARIA `tablist`/`tab`, horizontal underline) and
  `NavTabs` (`components/NavTabs/NavTabs.tsx`, link-based `href`/`active`,
  horizontal underline) are both unused by Console/Account. Console
  (`runtime/app/(platform)/(plugins)/console/layout.tsx:16-44`,
  `console.module.css:20-51`, classes `.nav`/`.navLink`) and Account
  (`plugins/account/app/layout.tsx:8-32`, `account.module.css`, classes
  `.tabs`/`.tab`) each hand-roll a third, near-identical copy locally.
- **Mobile tab-strip placement is a distinct, load-bearing mechanism.**
  `useOverlaySecondRow` (`Dialog.tsx:49-57`) lets a plugin layout hand its nav
  strip up to the enclosing `Dialog`'s mobile `OverlayHeader`, which renders
  it as a second header row (`OverlayHeader.tsx:59`) — solving the
  "double header" problem where a plugin's own sticky strip would otherwise
  render a second time inside the scrolling content area. Both Console and
  Account layouts call this today; a vertical rail does not have a natural
  "second row" equivalent, so this RFC deliberately leaves mobile using the
  same mechanism unchanged (see Alternatives / Open questions).
- **`packages/ui` is a published, versioned public contract.** Currently
  `0.47.0` (`packages/ui/package.json:3`). Per NFR-04, breaking changes need
  at minimum a minor bump and a migration note in `docs/upgrade.md`,
  regardless of whether any shipped plugin currently consumes the value being
  changed.
- **No existing rail/sidebar DS primitive.** Plugin-local sidebars exist
  (Shopper's `Sidebar.tsx`, Tasks' `ListSidebar.tsx`, Tally's
  `GroupSidebar.tsx`) but are all data-list UIs specific to their plugin, not
  a generic vertical section-nav primitive.

## Proposed design

### A. New component — `NavRail` (`packages/ui`)

- Link-based like `NavTabs` (`items: { label, href, active, icon? }[]`), not
  controlled-state like `Tabs` — Console and Account are real routes
  (hard/soft navigation), not client-side panel switches.
- Vertical stack layout, own column width, left-edge active indicator in
  place of `NavTabs`'s bottom-underline.
- `icon` is an optional per-item slot (not required) — additive capacity
  matching the reference screenshot's aesthetic, but Console/Account don't
  need to adopt icons in this same change.
- Follows existing `packages/ui` conventions: CSS Modules, semantic tokens
  only, no framework-specific link element baked in (consumes `<Link>` the
  same way `NavTabs`/`Breadcrumb` do per Next.js convention).
- Storybook: new story under `packages/ui/src/stories/`, gallery entry in
  `DesignSystemOverview.stories.tsx`'s Component Gallery section, verified
  with `pnpm --filter @sovereignfs/ui typecheck` per the Storybook hygiene
  rule in `CLAUDE.md`.
- Explicitly **out of scope for this RFC**: grouped/sectioned rail items
  (category headers like Claude's "General"/"Visuals"/"Desktop app"). Console
  and Account's section lists are flat today; forcing a grouping API before
  either plugin has grouped data would be speculative. See Open questions.

### B. Redefine `DialogSize.md`

Change `Dialog.module.css`'s `.md` from `36rem × 42rem` (portrait) to a
landscape box sized for a rail-plus-content layout — starting point
proposal, to refine visually during implementation: **`60rem × 40rem`**
(960×640px). Desktop-only change (mobile already ignores size, see above).

This is a visible change to a public design-system value, so per NFR-04 it
ships as a **minor** version bump (`0.47.0 → 0.48.0`) with a migration note
in `docs/upgrade.md`, even though no shipped plugin currently sets
`overlaySize: "md"` — the discipline applies to the contract, not current
uptake.

### C. Migrate Console and Account

- `plugins/console/manifest.json` and `plugins/account/manifest.json`:
  `shellConfig.overlaySize` `"lg" → "md"`.
- Delete the hand-rolled `.nav`/`.navLink` (`console.module.css:20-51`) and
  `.tabs`/`.tab` (`account.module.css`) rules; replace both layouts' nav
  strips with `NavRail`.
- **Mobile: no behavior change in this pass.** Both layouts keep calling
  `useOverlaySecondRow` with a horizontal nav strip exactly as today. A
  future full drill-down list (section links as a plain vertical list filling
  the mobile screen, closer to Claude Mobile's settings pattern) is
  explicitly deferred — see Alternatives.

## UI flows

**Desktop, inside the `md` dialog (soft-navigated overlay):**

```
┌─────────────────────────────────────────────────┐
│ ┌──────────┐  ┌───────────────────────────────┐ │
│ │ Overview │  │                                │ │
│ │ Users    │  │        (section content)       │ │
│ │ Groups   │  │                                │ │
│ │ Plugins  │  │                                │ │
│ │ Settings │  │                                │ │
│ │ ...      │  │                                │ │
│ └──────────┘  └───────────────────────────────┘ │
└─────────────────────────────────────────────────┘
```

**Mobile (unchanged):** full-screen sheet, `OverlayHeader` title row +
horizontal scrollable section strip as the second row, content below.

## Alternatives considered

**Add an `orientation` prop to the existing `NavTabs` instead of a new
component.** Rejected — the two aren't just a CSS flip: active-indicator
side, container sizing (rail has an intrinsic column width; `NavTabs` is
full-bleed), and icon-slot support diverge enough that `packages/ui` already
treats `Tabs` and `NavTabs` as separate components rather than one
parameterized component. A third distinct component keeps that precedent
rather than breaking it with a conditional internal branch.

**Redefine `md` vs. add a new size token.** Considered adding a new size
alongside `md` to avoid touching a published value at all. Rejected for this
RFC: `md` is unused by any shipped plugin today, so redefining it costs
nothing in practice while adding a new token would leave `md` permanently
occupying a value nothing was ever built for. Flagged here rather than
silently decided — see Open questions for the exact target dimensions.

**Ship the full mobile drill-down (Claude Mobile-style list) now.** Rejected
for this RFC's scope — it's new mobile UX, not a reuse of an existing
mechanism, and would meaningfully grow this change's surface. Noted as
explicit future work so it isn't lost. **Picked up by [epic task
14.6](../epics/plugin-accounts.md)** — see Update 3 above.

## Open questions

- **Desktop title placement.** Today's `<h1>Console</h1>` / `<h1>Account</h1>`
  sits above the horizontal nav (`console.module.css` `.title`,
  `account.module.css` equivalent). Claude's reference modal has no
  equivalent page title — the rail starts near the top. Does the title move
  into a rail header, get dropped on desktop, or stay as its own row above
  the rail+content pane? Needs a decision before implementation, not
  specified by this RFC.
- **Standalone hard-navigation route treatment.** Visiting `/console` or
  `/account` directly (no `Dialog` ancestor, `useOverlaySecondRow` is a
  no-op) currently renders the same horizontal header at full width. Does
  this route also switch to the vertical rail on desktop for consistency, or
  keep its current horizontal header? Not decided here.
- **Grouped rail sections.** Deferred, per Proposed design §A — flagged as
  possible future `NavRail` API growth (e.g. an optional `groups` shape) once
  Console or Account's list actually needs grouping.
- **Exact `md` pixel dimensions.** `60rem × 40rem` is a starting proposal,
  not a committed value — refine visually once the rail component exists and
  Console's real content (widest case: the users table) is laid out inside
  it.
- **Full mobile drill-down list.** Explicitly future work (see Alternatives)
  — not scheduled by this RFC, but the intent is recorded so it isn't
  forgotten. **Picked up by [epic task 14.6](../epics/plugin-accounts.md)**
  — see Update 3 above.

## Adoption path

Documentation-first; no `ROADMAP.md` scheduling commitment yet, matching the
pattern of RFCs 0076–0078. Tentatively a single epic task (9.22, Design
System epic) covering all three parts (`NavRail` component, `md` resize,
Console/Account migration) as one branch/PR, since the migration is
meaningless without the other two and the pieces are small enough not to
need independent review gates.

**Semver:**

- `@sovereignfs/ui`: **minor** bump (`0.47.0 → 0.48.0`) under `feat/`, with a
  migration note in `docs/upgrade.md` for the `md` size change per NFR-04.
- `plugins/console` and `plugins/account`: version only their own
  `manifest.json` (never `package.json`, which stays pinned at `0.0.0`) —
  bump each manifest's `version` per the visual/behavioral change (currently
  `0.1.0` and `0.1.1` respectively).
- Platform root `package.json`: minor bump at implementation time, per the
  standard "each completed task bumps the minor version" convention.

## Changelog

| Version | Date        | Change        |
| ------- | ----------- | ------------- |
| 0.1     | August 2026 | Initial draft |
