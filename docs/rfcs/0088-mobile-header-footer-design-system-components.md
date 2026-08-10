# RFC 0088 — Mobile header and footer as Design System components

**Status:** Implemented\
**Date:** August 2026\
**Author:** kasunben\
**Scope:** `packages/ui` (new components), `runtime/app/(platform)/layout.tsx`, `runtime/app/(platform)/_components/MobileNav.tsx`, `runtime/app/(platform)/_components/ActivePluginTitle.tsx` (removed), `docs/design-system.md`, `docs/plugin-development.md`; builds on RFC 0013 (mobile responsiveness & PWA — origin of the footer launcher pattern and the still-unwired "active-plugin title" concept this closes), RFC 0075 (per-plugin mobile header/footer visibility toggle, unchanged by this RFC), RFC 0079 (mobile PWA layout/gesture consistency — sibling `packages/ui` extraction precedent)\
**Incorporated into plan:** Yes — epic tasks 9.23, 9.24.

---

## Summary

Extract the runtime's hardcoded mobile header and footer into two new
`packages/ui` components — **`MobileHeader`** and **`MobileFooter`** —
presentational and prop-driven, each with a small set of parts locked as
immutable (the Sovereign/instance brand mark, the avatar menu, and the
notification bell in the header; the centered "Apps" launcher in the footer)
and a small set exposed as overridable (an optional header title; up to two
additional icons on each side of the footer launcher). The runtime becomes
the first — and for now, only — consumer, swapping its inline markup for
these components with no behavior change. A header title that RFC 0013
described but never actually wired up was wired up during implementation,
then deliberately reverted the same day (see "UI flows" and the Changelog)
— so the shipped result is a like-for-like markup swap.
This is deliberately scoped as groundwork: it does not design the mechanism
by which a plugin might one day render this chrome itself, because that use
case doesn't exist yet.

## Motivation

Plugin developers have no way today to influence the mobile header or
footer beyond RFC 0075's all-or-nothing visibility toggle — there is no
reusable component, so a plugin wanting native-looking mobile chrome would
have to hand-roll it, which is exactly what the DS-first rule
(`docs/architecture-rules.md`) exists to prevent ("reusable UI... is
implemented in `packages/ui`... and consumed by plugins, never implemented
plugin-locally 'to be promoted later'"). Extracting these two pieces of
chrome now, before any concrete override use case is designed, lets the
immutable/overridable boundary be drawn deliberately as a first step rather
than retrofitted under the pressure of a specific plugin's request later.

Along the way, this closes a small existing gap: the mobile header's own
doc comment has said "brand · active-plugin title · bell · avatar menu"
since RFC 0013, but the component that was supposed to render that title
(`ActivePluginTitle.tsx`) is never imported anywhere — dead code describing
a feature that was never actually wired in.

## Current state (what this builds on)

- **Header**, inline at `runtime/app/(platform)/layout.tsx:228-254`: a
  `<Link href="/">` brand (instance logo/monogram + `instanceName`, from
  white-labeling — RFC 0027/0032 — via `InstanceProvider`), followed by a
  right-hand cluster of `<NotificationBell />` and `<AccountMenu
placement="header" .../>`. Both sub-components are also reused by the
  desktop sidebar.
- **`ActivePluginTitle.tsx`** (`runtime/app/(platform)/_components/`) —
  resolves the active plugin's name from the pathname via longest
  `routePrefix` match, meant to render as the header's contextual title per
  the RFC 0013 comment above. Confirmed orphaned: no import anywhere in the
  runtime except its own file.
- **Footer**, `runtime/app/(platform)/_components/MobileNav.tsx:49-83`:
  exactly three `nav` items — Home (left, plain link), the "Apps" launcher
  (center, opens a `Drawer` of installed plugins), Search (right, opens
  `MobileSearch`). One fixed center item, one left, one right — today's
  shape is already the "1 fixed + 1 + 1" case this RFC generalizes.
- **Existing manifest hook is visibility-only**:
  `shellConfig.mobileHeader`/`mobileFooter` booleans (RFC 0075,
  `packages/manifest/src/schema.ts:159-166`), both default `true`. Nothing
  lets a plugin influence header/footer _content_ today; no real plugin
  currently sets either to `false` (confirmed — only test fixtures use it).
- **No layout/shell component exists in `packages/ui`** today. Primitives
  like `PageContainer`, `Drawer`, `NavTabs` exist, but nothing for header or
  footer chrome. `packages/ui/src/stories/MobilePatterns.stories.tsx`
  documents the runtime's header/footer as reference material only (anatomy,
  60px heights, the `--sv-shell-header-height` / `--sv-shell-footer-height`
  / `--sv-dialog-inset-top` tokens) — those token names are already a
  de facto public contract and must not change shape as part of this
  extraction.
- **DS-first rule** (`docs/design-system.md`, `docs/architecture-rules.md`):
  reusable UI/UX capability belongs in `packages/ui` or the runtime shell,
  never plugin-local. This RFC is a direct application of that rule to
  chrome that has, until now, only ever lived in the runtime.

## Proposed design

### `MobileHeader` (`packages/ui`)

- **Locked (always rendered, not overridable):**
  - A brand/logo slot — always renders and always links home. `packages/ui`
    doesn't know about instance identity or white-labeling, so this stays a
    prop (`logo: ReactNode`, `homeHref?: string`), with the runtime
    continuing to supply the resolved `instanceLogoUrl`/`instanceName`
    exactly as it does today.
  - A right-hand cluster that always renders a bell slot and an avatar-menu
    slot (`bell: ReactNode`, `avatarMenu: ReactNode`). `NotificationBell`
    and `AccountMenu` stay runtime-owned client components (they're bound to
    session/notification data) and are passed in as children, not
    reimplemented inside `packages/ui`.
- **Overridable:**
  - `title?: string` — renders next to the brand, absent by default
    (matching today's exact look when unset). The runtime wires this to a
    small hook that ports `ActivePluginTitle`'s existing longest-prefix-match
    logic — this closes the RFC 0013 gap described above using the same
    resolution rule that was already designed and never connected, not new
    design.
  - Deliberately **not** built in this RFC: a search input in the header,
    floated in the original request as a possible future addition. No slot
    is reserved for it structurally — adding one later is additive.

### `MobileFooter` (`packages/ui`)

- **Locked:** one **center** slot, always the "Apps" launcher trigger
  (`onOpenApps: () => void`, `launcherIcon?: ReactNode`). The Drawer of
  installed plugins itself stays runtime-owned (it needs the live plugin
  list); `MobileFooter` renders the button and calls back.
- **Overridable:** `leftIcons` / `rightIcons` props, each accepting **1 or 2**
  `FooterIcon` descriptors (`{ icon: ReactNode; label: string; href?:
string; onClick?: () => void; active?: boolean }`). Symmetric by
  convention — 1+1 reproduces today's Home/Search layout exactly; 2+2 gives
  headroom for a 5-icon layout (3 fixed-shape slots × up to 2 each,
  in line with standard iOS/Android bottom-nav conventions of ≤5 items). The
  launcher stays visually centered regardless of which count is used;
  mismatched left/right counts are flagged with a dev-mode-only
  `console.error` (never thrown), the same non-fatal-guard pattern already
  used by `SwipableMobileCarousel`'s non-`Slide`-children check.

### Runtime wiring

`(platform)/layout.tsx` and `MobileNav.tsx` are refactored to render through
`MobileHeader`/`MobileFooter`, passing exactly today's data through the new
slot props. `ActivePluginTitle.tsx` is deleted; its resolution logic moves
into a small runtime-local hook consumed by `layout.tsx`'s title wiring (it
needs the plugin registry, so it stays in the runtime, not `packages/ui`).
No other behavior changes — this is a refactor plus one bug fix (the title
finally rendering), not a redesign.

### Explicitly out of scope (deferred to a future RFC)

This RFC does **not** design a mechanism for a plugin to opt out of
platform-rendered chrome and render its own equivalent using these
components — that use case has not been introduced yet. Two concrete
questions that mechanism would need to answer are recorded under Open
questions below rather than resolved here, so they aren't reopened
mid-design once a real trigger use case exists but also aren't lost.

## UI flows

**Navigating into any plugin** — the header continues to show only the
instance brand, exactly as before this RFC. The active-plugin-name title
(the RFC 0013 behavior this RFC set out to finally wire up) was implemented
during leg 2 and briefly rendered, then deliberately reverted the same
day — showing the instance brand and plugin name side by side read oddly,
and per-plugin titles turned out not to be the actual goal. The shipped
result is a structurally-identical extraction with no user-visible change.

## Alternatives considered

1. **Wait to extract until the self-render use case is actually designed.**
   Rejected — the DS-first rule already requires this content to live in
   `packages/ui`, not the runtime, once it's meant to be reusable; waiting
   also leaves the header-title dead code sitting unfixed indefinitely.
   Extracting now, while the future use case is still hypothetical, is a
   better moment to draw the immutable/overridable boundary deliberately
   rather than retrofit it under pressure from a specific plugin's ask.
2. **Make `MobileHeader`/`MobileFooter` self-fetching (SDK-aware) now** —
   own their own notification-count/avatar data instead of taking it as
   props. Rejected: no current consumer needs it (the runtime already has
   this data server-side and passes it down), and it would be
   `packages/ui`'s first "smart," data-fetching component — a real
   precedent-setting decision that shouldn't be made speculatively before a
   self-rendering plugin actually exists to validate the shape.
3. **Design the full self-render opt-out mechanism in this RFC** (manifest
   field semantics + data provisioning). Rejected per explicit scoping
   agreed before writing this RFC: there is no concrete trigger use case
   yet, and designing the mechanism now risks getting the manifest shape
   wrong before a real consumer can validate it.
4. **Allow asymmetric footer icon counts** (e.g. two icons on the left, zero
   on the right). Rejected — breaks the one truly fixed visual constraint
   here, that the launcher stays centered.

## Open questions

1. **Semantics of a future self-render opt-out.** When that use case is
   eventually designed: does it reuse `shellConfig.mobileHeader` /
   `mobileFooter: false` (which today means "render nothing") to also mean
   "I will reproduce this myself," or does it need a distinct value/field,
   since the two intents differ (no reserved layout space vs. reproducing
   it pixel-for-pixel)? No real plugin sets `false` today, so there's no
   live migration risk either way — this is purely a naming/semantics
   decision for whoever designs that follow-up.
2. **Data provisioning for a future self-rendering plugin.** Would
   `MobileHeader`/`MobileFooter` need to become self-fetching at that point
   (contradicting Alternative 2's rejection above, but potentially justified
   once a real consumer exists), or would the SDK need new hooks (e.g.
   unread notification count, current user/avatar) so a self-rendering
   plugin can supply the same data as props the way the runtime does today?
   Left open — this RFC keeps both components presentational only.
3. **Header search input.** Explicitly deferred to "another phase" per the
   original request; no structural slot reserved for it here.

## Adoption path

Documentation-first now; scheduled as epic tasks **9.23** (`packages/ui`:
`MobileHeader`/`MobileFooter` components + Storybook coverage) and **9.24**
(runtime: refactor `(platform)/layout.tsx` and `MobileNav.tsx` to consume
them, delete `ActivePluginTitle.tsx`), sequenced by
[Workstream 0007](../workstreams/0007-mobile-header-footer-extraction.md).
`@sovereignfs/ui` takes a **minor** bump (new, additive components); `runtime`
takes a **patch** (internal refactor — the title-rendering fix was
implemented and then reverted before shipping, so no runtime behavior
actually changed). No manifest or SDK change in this RFC, so no
`docs/upgrade.md` migration note is needed. The two Open questions above are the explicit gate for whatever
future RFC introduces the plugin self-render use case — they do not block
this one.

## Changelog

| Version | Date     | Change                                                                                                                                                                                                                                                                                                                                                                                                    |
| ------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0.1     | Aug 2026 | Initial draft                                                                                                                                                                                                                                                                                                                                                                                             |
| 0.2     | Aug 2026 | Leg 1 implemented — `MobileHeader`/`MobileFooter` shipped in `packages/ui` (task 9.23, platform `0.62.0`).                                                                                                                                                                                                                                                                                                |
| 0.3     | Aug 2026 | Leg 2 implemented — runtime consumes both components (task 9.24, platform `0.63.0`, `80f01fb`). The header-title wiring was built (`useActivePluginTitle` + `PlatformMobileHeader`) then deliberately reverted the same day (`1f35a95`) — brand and plugin name side by side read oddly, and per-plugin titles weren't the actual goal. Shipped runtime has no user-visible change. Status → Implemented. |
