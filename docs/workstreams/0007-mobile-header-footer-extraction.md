# Workstream 0007 — Mobile header/footer as Design System components

**Status:** ✅ Complete — leg 1 (task 9.23, `MobileHeader`/`MobileFooter`
shipped in `packages/ui` at platform `0.62.0`) and leg 2 (task 9.24, runtime
consumption, shipped at platform `0.63.0`) are both done. Leg 2's
header-title wiring was implemented and then deliberately reverted the same
day — see leg 2 detail and the changelog below.\
**Date:** August 2026\
**Author:** kasunben\
**Goal owner:** kasunben\
**RFCs:** 0088 (builds on 0013, 0075)\
**Epics touched:** 9 (Design System)\
**Research:** None — scoped directly from a stakeholder brainstorming session; see RFC 0088's Motivation/Alternatives for the reasoning that would otherwise live in a research doc.

---

## Goal

`packages/ui` gains two new presentational components, `MobileHeader` and
`MobileFooter`, with a deliberately drawn immutable/overridable boundary
(brand, avatar, bell, and the center launcher are fixed; an optional header
title and up to two footer icons per side are not). The runtime's mobile
shell (`(platform)/layout.tsx`, `MobileNav.tsx`) renders through them
instead of its current inline markup. The RFC 0013 "active-plugin title"
dead-code gap was wired up during leg 2 and briefly rendered, then
deliberately reverted the same day (brand name and plugin name side by side
read oddly, and per-plugin titles weren't actually the goal) — so the
shipped result is a like-for-like markup swap with no visible change. This
is groundwork for a future,
not-yet-designed use case — a plugin rendering its own equivalent mobile
chrome — which this workstream does not attempt to build.

## Definition of done

- [x] `MobileHeader` and `MobileFooter` exist in `packages/ui`, are
      presentational (no data fetching, no SDK import), and have Storybook
      coverage for every stated prop combination (task 9.23).
- [x] The runtime's mobile header and footer render through these
      components; a mobile-viewport visual diff shows no change (task 9.24
      — the header-title wiring was implemented and then deliberately
      reverted the same day; see leg 2 detail below).
- [x] `ActivePluginTitle.tsx` is deleted. Its logic was ported into a new
      `useActivePluginTitle` hook and a `PlatformMobileHeader` wrapper to
      surface it as `MobileHeader`'s `title`; both were then deleted the
      same day when the title was reverted, so no rendered title and no
      reference to the old file remain either way.
- [x] RFC 0075's visibility toggle (`shellConfig.mobileHeader`/`mobileFooter`)
      continues to work unchanged — existing tests pass without modification
      to their assertions.
- [x] No manifest, SDK, or plugin-facing behavior changes — this workstream
      only touched `packages/ui` and the runtime's own consumption of it.

## Decisions locked

| Decision                                                               | Choice                                                                                                         | Rejected alternative and why                                                                                                                                                        |
| ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Where the components live                                              | `packages/ui`, presentational only (props/slots, no data fetching)                                             | Self-fetching/SDK-aware components — rejected as premature; no consumer needs it yet and it would be `packages/ui`'s first "smart" component (RFC 0088 Alternative 2).              |
| Header immutable parts                                                 | Brand/logo, avatar menu, notification bell always render, not overridable                                      | Making avatar/bell configurable now — rejected, no expressed need, and it's the one part everyone agreed must stay fixed.                                                           |
| Header title                                                           | Optional `title` prop, absent by default, wired to the existing (orphaned) active-plugin-name resolution logic | A brand-new title-resolution design — rejected; `ActivePluginTitle.tsx` already solved this in RFC 0013 and was simply never connected.                                             |
| Header search                                                          | Deferred entirely, no slot reserved                                                                            | Building a reserved search slot now — rejected per explicit request to keep it for "another phase"; adding one later is additive, not breaking.                                     |
| Footer center                                                          | Always the "Apps" launcher, fixed, not overridable                                                             | A configurable center slot — rejected, this was the one non-negotiable constraint from the outset.                                                                                  |
| Footer side icons                                                      | `leftIcons`/`rightIcons`, symmetric, 1 or 2 each (3 or 5 total)                                                | Asymmetric counts — rejected, breaks the centered-launcher requirement. A single flat icon list — rejected, loses the explicit bilateral symmetry that keeps the launcher centered. |
| Plugin self-render opt-out mechanism (manifest semantics + data model) | Out of scope for this workstream — left as RFC 0088 Open questions 1–2                                         | Designing it now — rejected, no concrete trigger use case exists yet; premature design risks the wrong shape.                                                                       |

## Prerequisites

None. RFC 0088 is the only design dependency and is included in this same
change set (drafted alongside this workstream, not merged separately first).

## Legs

| Leg | Name                     | Epic tasks | Epics | Gate? | Done when                                                                                                                                                      |
| --- | ------------------------ | ---------- | ----- | ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `packages/ui` components | 9.23 ✅    | 9     | No    | `MobileHeader`/`MobileFooter` ship in `@sovereignfs/ui` with full Storybook coverage; typecheck/lint/test pass.                                                |
| 2   | Runtime consumption      | 9.24 ✅    | 9     | No    | Runtime's mobile shell renders through both components; visual diff shows no change (title fix reverted same day); all existing RFC 0075 tests pass unchanged. |

Each leg is one branch, one draft PR, one review gate. The agent runs
uninterrupted within a leg and stops at its end. See
[README.md](README.md#the-leg-contract).

## Leg detail

### Leg 1 — `packages/ui` components

**Epic tasks:** 9.23

**Why this leg is first:** The components have to exist, with their props
settled and reviewed in isolation via Storybook, before the runtime is
refactored to depend on them. Reviewing the immutable/overridable boundary
on its own — without simultaneously reviewing a runtime diff — makes it
easier to catch a wrong prop shape before it's load-bearing in production
chrome.

**Technical notes:** Reuse the existing `--sv-shell-header-height` /
`--sv-shell-footer-height` tokens verbatim — do not introduce new ones;
`MobilePatterns.stories.tsx` already documents these as a de facto public
contract. Follow `SwipableMobileCarousel`'s dev-mode-only `console.error`
guard pattern (never throw) for the footer's mismatched-icon-count case —
it's the established precedent for a non-fatal correctness nudge in this
package. `NotificationBell` and `AccountMenu` are **not** moved into
`packages/ui` — they stay runtime-owned and are passed into `MobileHeader`
as `ReactNode` props, since they're bound to session/notification data this
package deliberately doesn't fetch.

**Do not proceed if:** Storybook review surfaces a prop shape that doesn't
actually reproduce today's runtime markup pixel-for-pixel (e.g. the launcher
can't stay centered with the proposed `leftIcons`/`rightIcons` shape) — fix
the shape within this leg before opening its PR, since leg 2 depends on it
being right.

### Leg 2 — Runtime consumption

**Epic tasks:** 9.24

**Why this leg is second:** Depends on leg 1's components existing and
being merged; this is also the higher-blast-radius leg (it touches the
shared `(platform)/layout.tsx` every `default`-shell plugin renders through)
and benefits from being reviewed independently of the new components'
own API design.

**Technical notes:** `ActivePluginTitle.tsx`'s longest-`routePrefix`-match
logic (`ActivePluginTitle.tsx:18-33`) should be ported, not
reimplemented — copy the matching behavior exactly, since it's already
correct and tested-by-existing-comment (RFC 0013), just disconnected.
Watch `ClientShell.tsx`'s `syncViewport()`
(measures `[data-mobile-header]`) and the RFC 0075
`data-mobile-header`/`data-mobile-footer` visibility conditionals — both
must keep working against the new component markup exactly as they did
against the old inline markup, since neither this leg nor RFC 0088 changes
RFC 0075's behavior.

**Do not proceed if:** the leg 1 PR hasn't merged yet (standard cross-leg
rule), or if reproducing today's exact footer icon layout via `leftIcons`/
`rightIcons` turns out to require a prop shape leg 1 didn't ship — escalate
back to leg 1 rather than patching around it in the runtime.

**Outcome:** Shipped in `fix(runtime): consume MobileHeader/MobileFooter in
the mobile shell` (`80f01fb`), including the title wiring via
`useActivePluginTitle` + `PlatformMobileHeader`. A same-day follow-up,
`fix(runtime): drop wrapper divs and plugin-name header title` (`1f35a95`),
reverted the title — showing the instance brand and active-plugin name side
by side read oddly, and per-plugin titles weren't actually the goal — and
also dropped the plain `<div>` wrappers around both components in favor of
putting `className`/`data-mobile-header`/`data-mobile-footer` directly on
their own root via prop APIs. `layout.tsx` renders `MobileHeader` as a
server component again, with no `title` set. The footer's Home icon uses
`onClick` + `router.push` rather than `MobileFooter`'s `href` prop, to
preserve client-side navigation instead of a full page reload.
`MobileSearch`'s footer-height probe reads
`document.querySelector('[data-mobile-footer]')` directly now that
`MobileFooter` has no wrapper `ref` to forward.

## Risks

- **Shared-layout staleness.** `(platform)/layout.tsx` is one layout shared
  by every `default`-shell plugin; RFC 0075 already documents a client-side
  navigation staleness trap here (`ClientShell.tsx`'s refresh-diffing). This
  workstream doesn't add a new per-route signal, so the existing guard is
  unaffected. (Moot in practice: the per-route title state this risk was
  written about — `useActivePluginTitle` — shipped and was reverted the same
  day; see leg 2's Outcome note.)
- **Token drift.** `MobilePatterns.stories.tsx` treats
  `--sv-shell-header-height`/`--sv-shell-footer-height` as documented public
  tokens; leg 1 must not change their values even incidentally (e.g. via a
  different internal padding structure that changes computed height).

## Kill criteria

Low risk, low cost to abandon at either leg boundary: if leg 1's Storybook
review reveals the immutable/overridable boundary itself was drawn wrong
(unlikely, given RFC 0088 was written from an explicit stakeholder
decision), stop after leg 1 with the components shipped-but-unconsumed
rather than force a wrong shape into the runtime in leg 2 — `packages/ui`
gains reusable groundwork either way, and the runtime keeps working exactly
as it does today until leg 2 is ready.

## Changelog

| Version | Date     | Change                                                                                                                                                                 |
| ------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0.1     | Aug 2026 | Initial draft                                                                                                                                                          |
| 0.2     | Aug 2026 | Leg 2 shipped (`80f01fb`, platform `0.63.0`); header-title wiring built then reverted the same day (`1f35a95`). Workstream complete — status updated, DoD checked off. |
