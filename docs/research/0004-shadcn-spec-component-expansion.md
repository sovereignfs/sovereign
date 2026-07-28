# Research 0004 — Reworking `packages/ui` to match shadcn/ui's component spec

**Status:** Decided\
**Date:** July 2026\
**Author:** Claude Code\
**Scope:** `packages/ui` (all components, tokens, Storybook), `docs/design-system.md`,
`docs/upgrade.md` (if breaking changes proceed)\
**Related:** none yet — first Design System–scoped research doc

---

## Question

Should Sovereign's design system be reworked so its components match shadcn/ui's
spec — sizing/scale, compound composition API, and most of its 70+ component
catalog — while staying mobile-first, PWA-ready, and free of third-party
component-framework dependencies (per CLAUDE.md)?

Decision inputs already given by the developer:

1. **Spec fidelity:** sizing/visuals only, not full interaction-behavior parity.
2. **Existing component APIs:** rework to shadcn's compound pattern
   (`TabsList`/`TabsTrigger`/`TabsContent`-style), accepting this is a breaking
   change.
3. **Catalog scope:** most of shadcn's 70+ components, not just the curated
   generic subset.

## Findings

### Current inventory

`packages/ui/src/components/` has 43 components. Of shadcn's list, direct
equivalents already exist for: Avatar, Badge, Button, Calendar, Card, Checkbox,
Date Picker, Dialog, Drawer, Dropdown Menu → `Menu`, Empty → `EmptyState`,
Field → `FormField`, Input, Popover, Select, Sheet, Spinner, Tabs, Textarea,
Toggle, Tooltip, Alert Dialog → `ConfirmDialog`. The remainder of our inventory
is product-specific (`CurrencyInput`, `SplitPane`, `TagInput`, `IconPicker`,
`MemberMultiSelect`, `SegmentedControl`, `SystemBanner`, `BalanceChip`, `StatusBadge`,
shell chrome like `OverlayHeader`/`PageHeader`/`NavTabs`) with no shadcn
counterpart, and stay out of scope for this rework.

Every existing component uses a **flat, controlled-prop API** — one component,
data passed as props/arrays, caller owns state (e.g. [`Tabs.tsx`](../../packages/ui/src/components/Tabs/Tabs.tsx):
`items` + controlled `value`/`onChange`, no subcomponents). None currently
expose a compound/slot API.

### Architecture constraints that bound this work

- **No third-party component framework** (CLAUDE.md). shadcn is not a
  standalone library — it's a thin CSS layer copy-pasted on top of **Base UI**
  (Radix's successor), which supplies all the actual interaction logic:
  keyboard nav, roving tabindex, focus trapping, portal + collision-aware
  positioning, typeahead. We cannot import Base UI; any behavior shadcn gets
  "for free" from it, we'd have to hand-build in vanilla React + CSS Modules.
- **`@sovereignfs/ui` is a published, versioned public contract** (NFR-04):
  patch releases must never contain breaking changes; a breaking change needs
  at minimum a minor bump **and** a migration note in `docs/upgrade.md`. A
  compound-API rework of an existing component (Tabs, Dialog, Select, Sheet,
  Popover, Menu, Drawer — the ones with real internal structure) breaks every
  plugin currently importing it, including in-repo consumers (Console,
  Launcher, Account, Splitify, etc.).
- **Two-tier token architecture already exists** (primitive → semantic,
  `docs/design-system.md`). Sizing changes should flow through
  `--sv-space-*`/`--sv-font-size-*`/`--sv-radius-*` primitives, not
  per-component magic numbers, to stay consistent with how the DS already
  works.
- **Storybook hygiene is enforced per-PR** on anything touching
  `packages/ui/src/` (CLAUDE.md) — every new/changed component or token needs
  a story update in the same PR, which multiplies per-component effort
  slightly but is already a known, budgeted cost.
- **DS-first mobile interaction primitives already exist** — long-press,
  double-tap, `useIsMobile` (CLAUDE.md's "DS-first" rule) — built because
  shadcn/Base UI has no equivalent; their components assume a mouse cursor.

### The fidelity/scope combination has an internal tension

"Sizing/visuals only" and "most of the catalog" pull against each other for
one sub-group of components. For simple, mostly-static components (Switch,
Radio Group, Slider, Progress, Separator, Skeleton, Table, Alert, Breadcrumb,
Pagination, Kbd, Accordion, Collapsible), sizing-only **is** basically the
whole job — they have little or no interaction logic worth reimplementing.

But for the desktop-cursor-shaped, behavior-heavy components in the catalog —
Command (⌘K palette), Context Menu, Hover Card, Navigation Menu, Menubar,
Data Table, Carousel, Combobox, Input OTP, Resizable — **the entire value of
the component is its interaction logic**, not its sizing. A "sizing/visuals
only" Context Menu or Combobox is not a usable component; there is no way to
ship them without building full custom behavior in-house (since Base UI is
off the table), which is a much larger undertaking per component than a
visual port — closer to designing and building a new interactive primitive
from scratch than "reworking to match spec." Several of them also don't have
a mobile/touch equivalent to match in the first place — see below.

### Mobile/PWA-readiness conflicts, not just gaps

- **Touch target size.** shadcn's default control heights (its `h-8`/`h-9`
  Tailwind scale, ~32–36px) are tuned for a mouse cursor and sit below the
  44px (iOS HIG) / 48dp (Material) minimum recommended touch target.
  Literally matching shadcn's pixel values would read fine on desktop but be
  borderline-small on mobile — this directly conflicts with the "mobile
  ready" requirement and needs an explicit decision (see Open questions).
- **No touch equivalent for cursor-only affordances.** Hover Card
  (hover-to-reveal) and Context Menu (right-click) have no direct touch
  analog — "match spec" doesn't apply because the input model they're built
  for doesn't exist on mobile. Navigation Menu/Menubar's hover-triggered
  flyouts have the same problem. These need original mobile interaction
  design (e.g. long-press for context menu, tap-to-expand for hover card),
  not a port.
- Sovereign already solves this class of problem once, generically, via the
  DS-first primitives named above — new components should build on those
  rather than re-deriving touch behavior per component.

## Options considered

### A. One blanket rework across the whole catalog

Do sizing + compound-API + all ~30 unmapped components in one continuous
effort. Rejected as a shape: it conflates a low-risk, fast, additive change
(sizing on existing flat components) with a high-risk breaking change
(compound API rework) and a large greenfield-design effort (behavior-heavy
mobile components), with no natural checkpoint for review or for shipping
value incrementally. `ROADMAP.md`'s task model (one task = one branch = one
PR) doesn't fit a single undifferentiated rework of this size either.

### B. Phase by risk/effort tier (recommended)

Split into four phases with different risk profiles, each independently
schedulable as `ROADMAP.md` tasks:

1. **Sizing/scale alignment on existing components** — port shadcn's scale
   onto current flat components via token changes. Additive/visual only, no
   API change, no version-bump-worthy break by itself (though visual changes
   to a public DS are still worth a minor bump + a design-system.md/changelog
   note for consumers, per NFR-04's spirit even if not its letter).
2. **New curated generic primitives** — Switch, Radio Group, Slider,
   Progress, Separator, Skeleton, Table, Alert, Breadcrumb, Pagination, Kbd,
   Accordion, Collapsible. Net-new, so zero breaking risk; matches sizing
   from phase 1 by construction.
3. **Compound-API rework of existing components** — Tabs, Dialog, Select,
   Sheet, Popover, Menu, Drawer. Each is its own breaking change: own minor
   bump, own `docs/upgrade.md` migration note, own pass through every in-repo
   plugin consumer. Scoped and sequenced individually, not as one wave.
4. **Behavior-heavy / desktop-shaped components** — Command, Context Menu,
   Hover Card, Navigation Menu, Menubar, Data Table, Carousel, Combobox,
   Input OTP, Resizable. Each needs its own mobile-interaction design (not a
   spec port) before it's buildable — closer to a mini-RFC per component than
   a rework task.

This lets phases 1–2 ship fast and low-risk while phases 3–4 get the
individual design scrutiny a breaking public-API change and a from-scratch
interaction design each deserve.

### C. Keep flat API, size-match only, skip behavior-heavy components entirely

Smallest-scope option — phases 1–2 only, defer 3–4 indefinitely. Would satisfy
"sizes should be the same" and "most components" (numerically, phases 1–2
already cover ~20 of the ~30 gap) without touching the breaking-change or
novel-interaction-design risk at all. Not chosen as _the_ recommendation
because the developer has already indicated the compound-API rework and full
catalog are wanted — but flagged as the lower-risk fallback if phases 3–4
prove too costly once scoped.

## Recommendation

Adopt **Option B** (phased). Sequence phases 1 and 2 first — they deliver the
literal "sizes should be the same" ask immediately, are additive, and
de-risk nothing else. Treat phase 3 (compound-API rework) as a separate
per-component decision each requiring its own RFC once phase 1–2 land and the
resulting token/sizing baseline is stable to design against. Treat phase 4
(behavior-heavy components) as requiring a **mobile interaction design pass
per component** before any sizing work is meaningful — "match spec" doesn't
resolve the core question for these, which is "what does this even do on
touch," so scope them last and expect their timeline per component to look
more like a new feature than a component port.

## Decisions

The developer delegated the two blocking open questions; resolved as follows.

### Touch target sizing — decided

Not actually a new decision — extend an existing shipped convention rather
than invent one. [`Button.module.css:36`](../../packages/ui/src/components/Button/Button.module.css)
already sets `min-height: var(--sv-touch-target-min, 44px)` on a button whose
_visual_ rendered height is 24/30/36px per size ([line 40's comment](../../packages/ui/src/components/Button/Button.module.css)),
backed by a dedicated primitive token, [`--sv-touch-target-min: 44px`](../../packages/ui/src/tokens/primitives.css).
Font-size and radius primitives already track Tailwind's (and therefore
shadcn's) numbers closely (14px body text, 8px `md` radius, etc.) with no
touch-target implication at all.

**Decision:** match shadcn's visual scale literally where there's no
touch-target concern (font-size, radius, spacing rhythm). For every
interactive control, keep the visual size matched to shadcn but require the
same `min-height`/hit-area pattern Button already has. No literal-vs-mobile
tradeoff — apply the existing convention everywhere instead of inventing a
new one.

### Phase-4 component scope — decided

| Component                | Decision | Why                                                                                                                                         |
| ------------------------ | -------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Combobox                 | In       | Real use case (searchable select); rebuild as a mobile-first bottom sheet (search input + list), not a desktop floating popover             |
| Input OTP                | In       | Concrete consumer exists — email verification and MFA reset flows; no hover/cursor dependency                                               |
| Command palette          | Out      | No entry point exists anywhere in the product yet — revisit only if one is proposed                                                         |
| Context Menu             | Out      | Superseded by the existing DS-first long-press primitive                                                                                    |
| Hover Card               | Out      | No touch equivalent, no consumer                                                                                                            |
| Navigation Menu, Menubar | Out      | Duplicate existing shell chrome (`OverlayHeader`/`NavTabs`/`PageHeader`)                                                                    |
| Carousel                 | Out      | No consumer; build with native scroll-snap + existing swipe primitives if one appears                                                       |
| Resizable                | Out      | Desktop pointer-drag pattern, no mobile equivalent; `SplitPane` already covers Splitify's specific need                                     |
| full Data Table          | Out      | Phase 2's plain `Table` covers the real need; TanStack-style sort/virtualization is a data-grid feature, build only against a real consumer |

## Open questions

- **Phase 3 sequencing:** which existing components are worth the breaking
  rework at all — does `Tabs`/`NavTabs`'s current split still make sense once
  a compound API exists, or does compound `Tabs` absorb `NavTabs`'s use case?
- **Version-bump cadence:** one minor bump per phase-3 component as it lands,
  or a single coordinated `@sovereignfs/ui` minor version covering a whole
  migration wave with one combined `docs/upgrade.md` entry?

## Next steps

1. **RFC — DS sizing/scale alignment + new primitive components** (phases
   1–2). Low risk, ready to scope now.
2. **RFC — Combobox + Input OTP** (the decided-in phase-4 components),
   scoped after phase 1–2's sizing baseline lands.
3. **RFC(s) — compound-API rework, one per existing component or small
   related group** (phase 3), each with its own migration note. Sequencing
   still open above.
