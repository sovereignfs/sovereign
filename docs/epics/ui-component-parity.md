# Epic: shadcn Component Parity

> Sizing/rhythm alignment of `@sovereignfs/ui` with shadcn/ui's spec, plus the
> curated set of generic primitive components shadcn has that Sovereign
> doesn't yet.

## Status

📋 Planned

## Overview

This epic tracks the concrete build-out of [RFC 0076](../rfcs/0076-ds-sizing-alignment-and-new-primitives.md),
the first of several RFCs expected from [Research 0004](../research/0004-shadcn-spec-component-expansion.md)
("Reworking `packages/ui` to match shadcn/ui's component spec"). It is
deliberately scoped to RFC 0076's phases 1–2 only — additive, non-breaking
work: a sizing/rhythm audit across existing components, and six batches of
net-new primitive components. It does **not** cover the compound-API rework
of existing components (Tabs, Dialog, Select, etc. — breaking, needs its own
RFC per component/family) or the mobile-adapted Combobox/Input OTP (needs its
own RFC, scoped after this epic's sizing baseline lands) — both tracked as
follow-on epics once those RFCs exist.

Kept as its own epic, separate from the existing [Design System](design-system.md)
epic (9), at the developer's explicit direction — it is not yet scheduled
into `ROADMAP.md`; tasks here are ready to pick up whenever a roadmap slot is
assigned.

## Related RFCs

- [RFC 0076 — Design system sizing alignment and new primitive components](../rfcs/0076-ds-sizing-alignment-and-new-primitives.md)

## Related Research

- [Research 0004 — Reworking `packages/ui` to match shadcn/ui's component spec](../research/0004-shadcn-spec-component-expansion.md)

## Related Docs

- [design-system.md](../design-system.md)
- [plugin-development.md — Token & component usage](../plugin-development.md)

## Tasks

#### 📋 25.1 — Sizing/rhythm alignment audit on existing components

**Goal:** Bring every existing interactive `@sovereignfs/ui` component's
visual sizing in line with shadcn's spec, using `Button` as the reference
implementation of the target pattern rather than inventing a new one.

**Deliverables:**

- Audit `Input`, `Select`, `Checkbox`, `Toggle`, `SegmentedControl`, `Tabs`,
  `Menu` items, `Dialog` padding/radius, and `Card` padding/radius against
  shadcn's published default sizing for the equivalent control. Adjust CSS
  Module values (height, padding, font-size, radius) to match, sourcing all
  values from existing `--sv-space-*`/`--sv-font-size-*`/`--sv-radius-*`
  primitives — no new primitive tokens, no hardcoded literals.
- For every interactive control touched, apply the same hit-area pattern
  `Button.module.css` already uses: visual rendered height matches shadcn,
  `min-height: var(--sv-touch-target-min, 44px)` guarantees the actual tap
  target regardless of visual size.
- Do **not** add new size variants (sm/md/lg) to a component that doesn't
  already expose them — this task aligns sizing within existing variants
  only; adding new variants is a separate, explicitly out-of-scope decision
  per RFC 0076.
- Update the affected components' Storybook stories to reflect any changed
  default dimensions (no new stories needed — existing ones just re-render
  at the corrected size).

**Dependencies:** None — first task in this epic, establishes the baseline
the rest of the epic's tasks size against.

**SRS reference:** [RFC 0076](../rfcs/0076-ds-sizing-alignment-and-new-primitives.md) Part A

**Version impact:** `@sovereignfs/ui` → **minor** (visual-only change, no API
break, but visible enough to a public design system to warrant a bump per
NFR-04's spirit).

**Review checklist:**

- Every audited component's rendered height/padding/font-size matches
  shadcn's documented default for the equivalent control (or a documented,
  deliberate deviation).
- Every interactive control keeps a ≥44px tap target on a 375px viewport,
  verified in Storybook's viewport addon, even where the visual size is
  smaller.
- No new props added to any audited component.
- `pnpm --filter @sovereignfs/ui typecheck`, `pnpm format:check`, `pnpm lint`
  pass; Storybook a11y panel passes on every changed story.

---

#### 📋 25.2 — `Switch` + `RadioGroup` primitives

**Goal:** Add the two most common missing form-control primitives.

**Deliverables:**

- **`Switch`** (`packages/ui/src/components/Switch/`) — on/off control,
  distinct from the existing button-style `Toggle`. Controlled
  `checked`/`onChange` props, `disabled?`, `label?` (for accessible naming
  when not wrapped in `FormField`). Sized per Task 25.1's baseline;
  `min-height`/hit-area follows the same pattern.
- **`RadioGroup`** (`packages/ui/src/components/RadioGroup/`) — same
  controlled-prop shape as `Tabs`: `items: { label: string; value: string
}[]`, `value`, `onChange`, `'aria-label'` (or `name` for use inside a
  native `<form>`). Native `role="radiogroup"` + `role="radio"` semantics,
  arrow-key navigation between options per the WAI-ARIA radio group pattern.
- Storybook stories (default, disabled, error-adjacent via `FormField`
  wrapping) for both; added to `DesignSystemOverview.stories.tsx`'s
  Component Gallery.

**Dependencies:** Task 25.1 (sizing baseline).

**SRS reference:** [RFC 0076](../rfcs/0076-ds-sizing-alignment-and-new-primitives.md) Part B

**Version impact:** `@sovereignfs/ui` → **minor** (additive).

**Review checklist:**

- `Switch` and `RadioGroup` both keyboard-operable (Space to toggle Switch;
  arrow keys to move between RadioGroup options, matching native radio
  behavior).
- Both usable standalone and wrapped in `FormField` with correct
  `aria-describedby` wiring for hint/error text.
- No hardcoded colour/spacing/radius values — `--sv-*` tokens only.
- Stories render without errors; a11y panel passes.

---

#### 📋 25.3 — `Slider` + `Progress` primitives

**Goal:** Add range-input and determinate-progress primitives.

**Deliverables:**

- **`Slider`** (`packages/ui/src/components/Slider/`) — single-thumb range
  input. Controlled `value`, `onChange`, `min`, `max`, `step?`, `label?` /
  `'aria-label'`. Dual-thumb/range selection explicitly out of scope —
  add only if/when a concrete consumer needs it.
- **`Progress`** (`packages/ui/src/components/Progress/`) — determinate bar.
  Props: `value` (0–100), `label?` (accessible name), uses
  `role="progressbar"` with `aria-valuenow`/`aria-valuemin`/`aria-valuemax`.
  Indeterminate variant out of scope for the same reason as Slider's
  dual-thumb.
- Storybook stories for both (default, min/max edges, labeled).

**Dependencies:** Task 25.1 (sizing baseline).

**SRS reference:** [RFC 0076](../rfcs/0076-ds-sizing-alignment-and-new-primitives.md) Part B

**Version impact:** `@sovereignfs/ui` → **minor** (additive).

**Review checklist:**

- `Slider` operable via keyboard (arrow keys adjust by `step`, Home/End jump
  to min/max) and touch drag.
- `Progress` announces its current value to screen readers via ARIA
  progressbar attributes.
- No hardcoded colour/spacing/radius values.
- Stories render without errors; a11y panel passes.

---

#### 📋 25.4 — `Table` + `Alert` primitives

**Goal:** Add a plain semantic table and an inline banner primitive — the
two most-requested-by-implication gaps (every list-heavy plugin screen and
every form validation summary currently hand-rolls one of these).

**Deliverables:**

- **`Table`** (`packages/ui/src/components/Table/`) — thin, styled wrappers
  around native `<table>`/`<thead>`/`<tbody>`/`<tr>`/`<th>`/`<td>`, token-driven
  borders/padding/typography. Explicitly **not** shadcn's Data Table (no
  sort/filter/virtualization/column-definition machinery) — see Research
  0004's "full Data Table — Out" decision. A responsive/mobile fallback
  (horizontal scroll container, matching the existing `NavTabs` masked-overflow
  pattern) for narrow viewports.
- **`Alert`** (`packages/ui/src/components/Alert/`) — inline, non-dismissible
  banner. Props: `variant: 'info' | 'success' | 'warning' | 'error'`,
  `heading?`, `children` (body). Distinct from `Toast` (transient,
  auto-dismissing) and `SystemBanner` (instance-wide); intended for
  form-level errors and "explain an empty/blocked state" contexts per
  `sv-ui-design`'s ActionResult convention. Uses existing
  `--sv-color-{error,success,warning}-*` token sets already established by
  prior tasks (9.4, 9.5 in the Design System epic).
- Storybook stories for both (Table: with/without header, long content,
  narrow viewport; Alert: all four variants, with/without heading).

**Dependencies:** Task 25.1 (sizing baseline).

**SRS reference:** [RFC 0076](../rfcs/0076-ds-sizing-alignment-and-new-primitives.md) Part B

**Version impact:** `@sovereignfs/ui` → **minor** (additive).

**Review checklist:**

- `Table` scrolls horizontally without a visible scrollbar on a 375px
  viewport, matching the existing `NavTabs` mobile pattern.
- `Alert` variants use the correct existing status token sets; `role="alert"`
  (or `role="status"` for non-error variants) set appropriately for screen
  reader announcement.
- No hardcoded colour/spacing/radius values.
- Stories render without errors; a11y panel passes.

---

#### 📋 25.5 — `Breadcrumb` + `Pagination` + `Kbd` primitives

**Goal:** Add the remaining navigation/display primitives from RFC 0076's
curated list.

**Deliverables:**

- **`Breadcrumb`** (`packages/ui/src/components/Breadcrumb/`) — link trail.
  Props: `items: { label: string; href?: string }[]` (last item typically
  has no `href` — current page). Consumes a caller-supplied link renderer
  the same way `NavTabs` was extended to in Task 9.15, so it's usable inside
  overlay-shell plugins without breaking client-side navigation.
- **`Pagination`** (`packages/ui/src/components/Pagination/`) — page-number /
  prev-next control. Controlled `page`, `totalPages`, `onChange`. Keyboard
  and screen-reader accessible (`aria-current="page"` on the active page
  control).
- **`Kbd`** (`packages/ui/src/components/Kbd/`) — inline keyboard-key
  styling (`<kbd>` element, monospace, small token-driven padding/border).
  Trivial; useful once any shortcut or command-palette surface exists.
- Storybook stories for all three.

**Dependencies:** Task 25.1 (sizing baseline). References the link-renderer
pattern established by Task 9.15 (`NavTabs` `Link` support).

**SRS reference:** [RFC 0076](../rfcs/0076-ds-sizing-alignment-and-new-primitives.md) Part B

**Version impact:** `@sovereignfs/ui` → **minor** (additive).

**Review checklist:**

- `Breadcrumb` used inside an overlay-shell plugin performs client-side
  navigation, not a full page reload (same requirement Task 9.15 fixed for
  `NavTabs`).
- `Pagination`'s active page is both visually distinct and exposed via
  `aria-current="page"`.
- `Kbd` renders as a real `<kbd>` element.
- No hardcoded colour/spacing/radius values.
- Stories render without errors; a11y panel passes.

---

#### 📋 25.6 — `Accordion` + `Collapsible` primitives

**Goal:** Add expand/collapse primitives, closing out RFC 0076's curated
component list.

**Deliverables:**

- **`Collapsible`** (`packages/ui/src/components/Collapsible/`) — single
  expand/collapse primitive. Controlled `open`, `onOpenChange`, `trigger`
  (React node), `children` (collapsed content). Independently useful (e.g. a
  "show more" toggle), and composed internally by `Accordion`.
- **`Accordion`** (`packages/ui/src/components/Accordion/`) — one or more
  `Collapsible` sections. Props: `items: { id: string; trigger: ReactNode;
content: ReactNode }[]`, `type: 'single' | 'multiple'` (single closes other
  sections when one opens), controlled `openIds`/`onOpenIdsChange`. Keyboard
  support: Enter/Space toggles the focused trigger — no arrow-key
  requirement, since accordion sections aren't a roving-tabindex widget per
  the WAI-ARIA accordion pattern.
- Storybook stories for both (default, multiple-open, long content,
  keyboard interaction via a `play` function).

**Dependencies:** Task 25.1 (sizing baseline).

**SRS reference:** [RFC 0076](../rfcs/0076-ds-sizing-alignment-and-new-primitives.md) Part B

**Version impact:** `@sovereignfs/ui` → **minor** (additive).

**Review checklist:**

- `Collapsible` and `Accordion` both keyboard-operable (Enter/Space toggles).
- `Accordion` in `type: 'single'` mode closes other sections when one opens;
  in `type: 'multiple'` mode does not.
- Content transition respects `prefers-reduced-motion` (no animated
  height change when reduced motion is requested).
- No hardcoded colour/spacing/radius values.
- Stories render without errors; a11y panel passes.
