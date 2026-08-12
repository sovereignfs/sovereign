# RFC 0079 — Mobile PWA layout, overlay, and gesture consistency

**Status:** Implemented\
**Date:** July 2026\
**Author:** Claude Code\
**Scope:** `packages/ui` (new `PageContainer` component, internal refactor of `Dialog`/`Drawer`/`Sheet`/`ConfirmDialog`, new `useSwipeReveal`/`useSnapCarousel` hooks), `plugins/account`, `plugins/console` (the only plugins that live in this monorepo), `docs/design-system.md`, `docs/plugin-development.md`, `docs/architecture-rules.md`. Builds on RFC 0013 (mobile responsiveness & PWA), RFC 0075 (mobile chrome toggle), RFC 0076 (DS sizing alignment), and the `docs/design-system-stabilization-proposal.md` review.\
**Cross-repo note:** `sovereign-tasks`, `sovereign-shopper`, and `sovereign-plainwrite` are externally-maintained plugins, each in its own repository and excluded from this monorepo by `.gitignore` (only `account/`, `console/`, `launcher/` are tracked here). This RFC's `packages/ui` deliverables (the hooks and the ConfirmDialog consolidation) are fully in scope and shippable from here; the plugin-side migrations onto them are out of scope for any branch in this repo and require separate PRs in each plugin's own repository once a new `@sovereignfs/ui` version ships.\
**Incorporated into plan:** Yes — epic tasks 9.18, 9.19, 9.20.

---

## Summary

Three independent, non-breaking additions to `@sovereignfs/ui` to close gaps
found in a design-system consistency review, each addressing a different
symptom of the same root cause (reusable UI/UX capability implemented
ad hoc per plugin instead of once in the design system):

1. A `PageContainer` primitive that gives first-party plugins one documented
   way to constrain and pad their own main content, composing predictably
   with the shell's existing auto-padding instead of stacking on top of it.
2. An internal refactor consolidating `Dialog`, `Drawer`, and `Sheet`'s
   duplicated scrim/focus-trap/Escape/scroll-lock code onto one shared
   internal primitive, with no public API change, plus migrating
   `sovereign-plainwrite`'s stray local `ConfirmDialog` onto the shared one.
3. Two new gesture hooks, `useSwipeReveal` and `useSnapCarousel`, extracted
   from `sovereign-tasks`'s and `sovereign-shopper`'s independent, duplicated
   swipe-to-reveal and carousel-settle-detection implementations.

None of these change a single existing public prop, token, or manifest field.
All three are additive `packages/ui` exports plus first-party plugin
migrations onto them.

## Motivation

A design-system review (this session, see current-state citations below)
found the same pattern three times: a capability that should live once in
`packages/ui` instead exists as multiple independent, drifting
implementations in plugin code or in supposedly-shared components. This
directly contradicts the DS-first rule already written into
`docs/architecture-rules.md` ("Reusable UI/UX capability... is implemented in
`packages/ui`... and consumed by plugins, never implemented plugin-locally
'to be promoted later'"), and `sovereign-tasks/CLAUDE.md` confirms this rule
was already enforced once before for other primitives (an older local
overlay/double-tap implementation was removed in favor of DS `Sheet`/
`useDoubleTap`) — the three items below are the same enforcement gap
recurring in three new places.

Concretely, the developer-facing symptoms are:

- Plugin main-content padding/margin/max-width is different in every
  first-party plugin, with no documented convention for what a plugin should
  add on top of the shell's own padding — some plugins end up double-padded,
  some have none of their own, values range across five different max-widths
  and four different padding combinations.
- `Dialog`, `Drawer`, and `Sheet` each hand-roll their own scrim, focus trap,
  Escape handling, and scroll-lock wiring, with comments in the source
  acknowledging the duplication (e.g. "see Dialog.tsx's identical comment for
  why"). This isn't visibly broken today, but it's the kind of duplication
  that drifts: a fix to one's focus-trap edge case doesn't propagate to the
  other two.
- Mobile swipe interaction has no shared hook, so `sovereign-tasks` has two
  separate hand-rolled swipe-to-reveal implementations in the same plugin,
  and `sovereign-tasks`/`sovereign-shopper` each independently reimplement
  the same scroll-snap carousel settle-detection.

## Current state (what this builds on)

### Layout

- The runtime shell already auto-applies outer content padding to every
  plugin: `runtime/app/(platform)/shell.module.css:144-154` —
  `.content { padding: var(--sv-space-8); }`, zeroed via
  `.content:has([data-plugin-fullbleed]) { padding: 0; }`; mobile override at
  `shell.module.css:270-278` drops this to `var(--sv-space-4)` plus a
  footer-height-aware `padding-bottom`.
- No plugin imports a shared page-container component — every plugin layout
  (`plugins/*/app/layout.tsx` + its CSS module) is ad hoc local CSS. Observed
  values: 960px max-width + `var(--sv-space-8) var(--sv-space-6)` padding
  (ledger, wallet, healthlog — inconsistent on `margin: 0 auto`, wallet lacks
  it); 640px max-width (tritext); 1040px max-width stacked on top of the
  shell's own padding plus a second local padding layer (plainwrite —
  double-padded); no max-width, `var(--sv-space-6)` padding only (docs,
  sheets.local); no padding or max-width at all, relying entirely on shell
  padding (account, console, tally); a hardcoded `28rem` instead of a
  `--sv-space-*` token (sheets.local's inline form).
- `PageHeader` (`packages/ui/src/components/PageHeader/PageHeader.tsx`) only
  lays out a title/description/action row (`margin-bottom` only); it is not,
  and was never meant to be, a page wrapper. No `PageContainer`/`AppShell`/
  `ContentLayout`-shaped component exists in `packages/ui` today (confirmed
  via directory listing and repo-wide grep).
- Two plugins (`sovereign-tasks`, `sovereign-shopper`) opt out of shell
  padding entirely via `data-plugin-fullbleed` and manage their own
  full-bleed shell/sidebar/content grid — this mechanism is intentional and
  out of scope here; `PageContainer` is for the common case of a plugin that
  wants shell padding plus a readable content width, not for fullbleed
  plugins.

### Overlays

- `docs/design-system.md`'s existing "Overlay surfaces" decision table
  (documented already, ~line 889) correctly assigns Dialog / ConfirmDialog /
  Drawer / Sheet / Menu to their jobs — this RFC does not change that table
  or any component's public API, only what happens inside each component.
- `Dialog` (`packages/ui/src/components/Dialog/Dialog.tsx`), `Drawer`
  (`.../Drawer/Drawer.tsx`), and `Sheet` (`.../Sheet/Sheet.tsx`) each
  independently implement: an in-tree (non-portal) scrim/panel, manual
  Tab/Shift-Tab focus-trap cycling with restore-on-close, a `keydown`
  Escape handler, and `lockBodyScroll`/`unlockBodyScroll`
  (`packages/ui/src/scroll-lock.ts`) inside an identical `useEffect` keyed on
  a `mounted` flag (to cover the exit-animation window). The three
  implementations are functionally equivalent but textually separate.
- `ConfirmDialog` (`.../ConfirmDialog/ConfirmDialog.tsx`) is deliberately
  built on the native `<dialog>` element instead (`showModal()`/`.close()`)
  and is explicitly out of scope for consolidation — native `<dialog>`
  already provides backdrop, top-layer stacking, and focus-trap for free,
  and its doc comment already explains why it isn't built on `Dialog`. It
  does not currently participate in the shared `scroll-lock.ts` ref-counter,
  which is consistent with relying on the browser's own modal semantics
  rather than a gap to close.
- `sovereign-plainwrite` has its own local
  `plugins/sovereign-plainwrite/app/_components/ConfirmDialog.tsx` — a
  hand-rolled native-`<dialog>` component with a different prop shape
  (`onCancel` instead of `onClose`, no `destructive`/`pending`/`error`
  props). Its own doc comment says it exists "matching the pattern used
  elsewhere in the platform... until the design system ships a
  ConfirmDialog component" — that component (`@sovereignfs/ui`'s
  `ConfirmDialog`, exported from `packages/ui/src/index.ts:42`) has since
  shipped (Task 9.12), so this is an unmigrated leftover, not a deliberate
  divergence. All ~20 other `ConfirmDialog` call sites across first-party
  plugins already use the shared component consistently.

### Gestures

- `packages/ui/src/hooks/` has `useDoubleTap.ts`, `useLongPress.ts`,
  `useIsMobile.ts`, `useCommitOnEnterOrBlur.ts` — all consumed correctly
  everywhere they're used (`ContextMenu.tsx:6,46`, `Combobox.tsx:57`,
  `DatePicker.tsx:47`, plus first-party plugins). There is no shared swipe
  hook.
- `plugins/sovereign-tasks/app/_components/TaskItem.tsx:178-210` (swipe
  reveal on task rows, `SWIPE_REVEAL_WIDTH=128px`) and
  `plugins/sovereign-tasks/app/ListSidebar.tsx:544-589` (swipe reveal on
  list rows, `SWIPE_REVEAL_WIDTH=72px`) are two separate, hand-written
  pointer-swipe implementations in the same plugin — identical axis-lock and
  open/close-at-half-width math, not shared even locally.
- `plugins/sovereign-tasks/app/_components/MobileTasksCarousel.tsx` and
  `plugins/sovereign-shopper/app/_components/MobileShopperCarousel.tsx` each
  independently implement the same debounced-`scroll`-event "settled slide"
  detection over a native `scroll-snap-type: x` carousel, with near-identical
  comments citing the same iOS `scrollend`-support rationale.
- Every other first-party plugin (ledger, plainwrite, tritext, healthlog,
  docs, wallet, tally, console, launcher) has zero gesture code of its own —
  this RFC's gesture scope is exactly `sovereign-tasks` and
  `sovereign-shopper`, not a platform-wide rollout.
- `docs/architecture-rules.md`'s existing `touch-action` rule (nested
  `pan-x`/`pan-y` intersection) and DS-first rule are already in place and
  unchanged by this RFC — the new hooks are additive implementations of
  rules the docs already state.

## Proposed design

### 1. `PageContainer` (`packages/ui`)

A single new primitive that a plugin's `app/layout.tsx` (or top-level page)
wraps its own content in, replacing local CSS-module container rules:

```tsx
<PageContainer maxWidth="md">{children}</PageContainer>
```

- `maxWidth`: `'sm' | 'md' | 'lg' | 'full'`, mapping to a small fixed set of
  documented pixel values (not a new token tier — reuses existing
  `--sv-space-*`/breakpoint conventions for the internal implementation).
  `'full'` applies no max-width (for plugins like `docs`/`sheets.local` that
  want full shell width). Default `'md'`.
- `PageContainer` does **not** add its own padding — the shell already pads
  every non-fullbleed plugin (`--sv-space-8` desktop / `--sv-space-4`
  mobile). It only centers (`margin-inline: auto`) and constrains width.
  This is the fix for plainwrite's double-padding: a plugin composing
  `PageContainer` should stop adding its own `padding` in a wrapping layout
  div.
- Fullbleed plugins (`sovereign-tasks`, `sovereign-shopper`) are unaffected —
  `PageContainer` is opt-in per plugin, not a replacement for
  `data-plugin-fullbleed`.
- `docs/design-system.md` and `docs/plugin-development.md` gain a short
  "Page layout" section documenting: the shell already pads your content;
  use `PageContainer` to additionally constrain width; do not add your own
  outer `padding`/`max-width` in plugin-local CSS.

This does not touch `runtime/app/(platform)/shell.module.css` — the shell's
padding behavior is unchanged, only documented more explicitly and now has a
composable component sitting inside it.

### 2. Overlay internal consolidation

Extract the scrim + focus-trap + Escape + scroll-lock logic shared by
`Dialog`, `Drawer`, and `Sheet` into one internal (non-exported) hook/helper
inside `packages/ui/src/components` — e.g. `useOverlayShell({ open, onClose,
lockScroll })` returning the ref, keydown handling, and mount/exit-animation
bookkeeping each component currently duplicates. `Dialog`, `Drawer`, and
`Sheet` call it internally; their public props (`open`, `onClose`, `size`,
`snapHeight`, `slideFrom`, `title`, etc.) are unchanged. `ConfirmDialog`
stays on native `<dialog>` and is explicitly not migrated onto this helper —
consolidating three duplicated implementations into one is the goal here,
not forcing a fourth, already-working approach to match.

Separately, migrate `sovereign-plainwrite`'s local `ConfirmDialog`
(`plugins/sovereign-plainwrite/app/_components/ConfirmDialog.tsx`) and its
three call sites (`MarkdownEditor.tsx`, `NewPostDialog.tsx`,
`NewProjectDialog.tsx`) onto `@sovereignfs/ui`'s `ConfirmDialog`, then delete
the local component. This is a plugin-local change with no `packages/ui`
API impact — it's included here because it's the concrete, actionable
instance of the "adoption is inconsistent" finding, not because it needs new
design-system work.

### 3. Shared gesture hooks

- **`useSwipeReveal({ revealWidth, onReveal?, disabled? })`** — extracted
  from `TaskItem.tsx`'s and `ListSidebar.tsx`'s existing pointer-swipe
  implementations (same axis-lock tolerance, same open/close-at-half-width
  behavior), parameterized by `revealWidth` so both call sites (128px and
  72px today) configure the same hook instead of hand-rolling it twice.
  Returns pointer handlers plus the current reveal offset for the caller to
  apply as a transform.
- **`useSnapCarousel({ itemCount, onSettle? })`** — extracted from
  `MobileTasksCarousel.tsx`'s and `MobileShopperCarousel.tsx`'s existing
  debounced-scroll settle-detection over a `scroll-snap-type: x` container.
  Returns the active index and a ref to attach to the scroll container.
- Both plugins migrate their existing call sites onto the new hooks; no
  behavior change from the user's perspective (same thresholds, same
  timing) — this is a duplication removal, not a UX change.
- `touch-action` usage in `ListSidebar.module.css`, `TaskItem.module.css`,
  and `ItemRow.module.css` is unchanged — the existing
  `docs/architecture-rules.md` guidance on nested `pan-x`/`pan-y` still
  applies and isn't affected by moving the JS into a shared hook.

### Non-goals

- No new overlay component and no change to the Dialog/Drawer/Sheet/
  ConfirmDialog decision table.
- No swipe-to-reveal or carousel gestures added to any plugin that doesn't
  already have them — this is consolidation of existing gestures, not new
  gesture rollout.
- No change to `data-plugin-fullbleed`, `shellConfig.mobileHeader`/
  `mobileFooter` (RFC 0075), or any manifest field.
- No cross-plugin (app-switching) swipe navigation — confirmed not to exist
  today, and not proposed here.

## Alternatives considered

- **A single `AppShell`/`ContentLayout` component owning both padding and
  max-width** (rather than `PageContainer` composing with the shell's
  existing padding): rejected — the shell already owns padding correctly
  today; duplicating that responsibility in a `packages/ui` component would
  create exactly the double-padding bug this RFC fixes for plainwrite, just
  moved one level.
- **Unify Dialog/Drawer/Sheet into one component with a `variant` prop**:
  rejected — breaking change to a public contract plugin developers already
  use via three distinct, already-documented semantic components; the
  existing decision table exists precisely so callers pick the right one by
  name. Internal code-sharing gets the deduplication benefit without the
  breakage.
- **Migrate `ConfirmDialog` onto the shared overlay helper too**: rejected
  for now — it works today via native `<dialog>` semantics, and forcing it
  onto the manual focus-trap path used by the other three would be a
  regression (native focus-trapping is more reliable), not a consolidation.
- **Leave gesture duplication alone (it isn't visibly broken)**: rejected —
  it's the direct, current-code instance of a rule already written into
  `docs/architecture-rules.md`, and `sovereign-tasks/CLAUDE.md` shows this
  same class of debt was worth paying down once already.
- **Do all three as one combined task**: rejected in favor of three separate
  epic tasks — they touch different files, have different risk profiles
  (layout is additive/net-new, overlay is an internal refactor, gestures are
  a plugin migration), and reviewing them together would obscure which
  regression, if any, came from which change.

## Open questions

- Exact pixel values for `PageContainer`'s `sm`/`md`/`lg` max-widths — the
  implementing task should reconcile the five values currently observed
  (960px, 1040px, 640px, plus `account`'s local 680px section width) rather
  than inventing new numbers; likely `sm` ≈ 640px, `md` ≈ 960px, `lg` ≈
  1040–1200px, but this is a decision for Task 9.18, not fixed here.
- Whether `sovereign-tasks`/`sovereign-shopper`'s existing
  `SWIPE_REVEAL_WIDTH` constants (128px, 72px) should be normalized to one
  shared default once both go through `useSwipeReveal`, or remain
  per-call-site configuration. Leaning toward keeping them
  per-call-site-configurable (the hook takes `revealWidth` as a prop) since
  the two rows have legitimately different content widths.

## Adoption path

Three separate epic tasks, each independently shippable and independently
reviewable:

- **Task 9.18** — `PageContainer` + docs + first-party plugin migration.
- **Task 9.19** — Overlay internal consolidation + `sovereign-plainwrite`
  `ConfirmDialog` migration.
- **Task 9.20** — `useSwipeReveal`/`useSnapCarousel` + `sovereign-tasks`/
  `sovereign-shopper` migration.

All three are additive to `@sovereignfs/ui`'s public surface (new exports
only, no existing prop/token removed or renamed) — per NFR-04 this ships as
a **minor** version bump of `@sovereignfs/ui`, not a major one, whichever
task lands first.

## Changelog

| Version | Date      | Change        |
| ------- | --------- | ------------- |
| 0.1     | July 2026 | Initial draft |
