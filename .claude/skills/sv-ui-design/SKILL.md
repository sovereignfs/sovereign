---
name: sv-ui-design
description: >-
  Sovereign UI design workflow — use whenever building, changing, or reviewing
  anything a user sees in this repo: pages, components, forms, dialogs, empty
  states, status badges, error handling, navigation, plugin screens, or
  user-facing copy. Also use when designing a new screen or feature (wireframe
  first), simplifying an existing UI, translating technical concepts into
  user-facing language, or wiring server-action errors into forms. Covers the
  design-system-first rules (packages/ui tokens/components), plain-language
  principles, the ActionResult/useActionState error convention, and the
  wireframe-before-build process. Trigger even for "small" UI tweaks — copy
  changes, a new button, an error message — not just full features.
---

# Sovereign UI design workflow

Two audiences shape every UI decision in this repo: **plugin developers** (who
consume `@sovereignfs/ui` as a public contract) and **end users** (often
non-technical, who must never see implementation vocabulary). This skill
encodes how to design and build for both. The authoritative deep references
are `docs/design-system.md`, `docs/architecture-rules.md`, and the naming
table in `CLAUDE.md` — this skill tells you when and how to apply them.

For worked examples (a full jargon-translation table, copy patterns, error-UX
code shapes), read `references/writer-first-patterns.md` in this skill.

## Order of operations

1. **Know who the screen is for.** Owner/admin screens may show technical
   detail; daily-use screens for members/writers must not. If one screen
   serves both, split it (settings vs. daily surface) rather than mixing.
2. **For new screens or redesigns: wireframe before building** (see below).
   For small changes, skip to 3.
3. **Build DS-first** (rules below).
4. **Wire error UX** for every mutation (convention below).
5. **Verify live** — drive the real UI with the preview tools (register a
   throwaway account if needed); check every state, not just the happy path.

## Design-system-first rules

Full reference: `docs/design-system.md`. The load-bearing subset:

- **Semantic tokens only** in component/plugin CSS: `--sv-color-*` semantic
  names (`--sv-color-surface`, `--sv-color-text-primary`,
  `--sv-color-error-text`), never primitive colours (`--sv-grey-500`), never
  hardcoded values. Scale tokens (`--sv-space-*`, `--sv-radius-*`,
  `--sv-font-size-*`) are used directly.
- **Check `packages/ui/src/components/` before writing any control.** Button,
  Card, Input, Select, Checkbox, Dialog, Drawer, EmptyState, FormField,
  NavTabs, PageHeader, SegmentedControl, Spinner, StatusBadge, SystemBanner,
  Tabs, TagInput, Toast, Toggle, Tooltip and more already exist. Rebuilding
  one plugin-locally is a bug.
- **DS-first placement:** reusable UI/UX capability (interaction hooks,
  overlay surfaces, motion, controls) goes in `packages/ui` — or the runtime
  shell for shell chrome — and plugins consume it. Never implement it
  plugin-locally "to be promoted later".
- **CSS Modules + CSS custom properties.** No Tailwind, no runtime CSS-in-JS.
- **Mobile:** the canonical breakpoint is 768px — use `useIsMobile` /
  `MOBILE_BREAKPOINT_PX` from `@sovereignfs/ui`, never a plugin-local number.
  Respect `--sv-touch-target-min` for tap targets.
- **Storybook hygiene** (CI-enforced): touching `packages/ui/src/` means
  updating/adding the matching story and the Component Gallery / TokenGallery
  entries, then `pnpm --filter @sovereignfs/ui typecheck`.

## Plain-language principles

The UI speaks the user's domain, never the implementation's. This is the
same rule as the repo's "plugin vs app" naming convention, extended to every
technical concept.

- **Maintain a jargon-translation table** for any feature with technical
  internals (git, sync, credentials, schemas). Internal terms stay in code
  and schema; users see the translated term. Worked example in
  `references/writer-first-patterns.md`.
- **Status labels explain themselves.** "Draft — only you see this" beats
  "Draft". Prefer state names describing consequence ("Live on site") over
  mechanism ("committed").
- **Progressive disclosure, not removal.** Technical detail (raw YAML, file
  paths, revision ids, generated commit messages) moves behind one
  "Advanced" disclosure — available, never ambient.
- **Setup vs. daily use.** Configure-once concerns (connections, credentials,
  schemas, danger zone) live in an owner-only settings area, not on the
  daily surface. First-run setup should read as a short wizard with
  auto-detected suggestions to confirm, not a form of blanks to fill.
- **Empty states are invitations** with one clear action, plus a line for the
  user who arrived by invitation rather than setup.
- **Show pipelines as pipelines.** If the data model has a state machine
  users care about (draft → ready → published), surface it as named stages
  (tabs, columns, counts) rather than hiding it in per-row badges.
- **Copy mechanics:** sentence case everywhere; verb-first buttons (1–3
  words); no "please", "successfully", "simply"; errors say what happened
  then what to do; auto-generate what can be generated (filenames from
  titles, commit messages from actions) and offer a muted "change" escape
  hatch.

## Error UX convention

Every user-triggerable mutation distinguishes **expected** failures (bad
input, missing precondition, remote rejection — things a user can act on)
from **unexpected** ones (bugs, authorization violations).

- **Expected failures never throw.** A thrown error in a server action
  replaces the whole page with the 500 boundary — for a wrong branch name or
  a missing token, that is a bug. Return the shared result shape instead and
  render it inline with `useActionState`, keeping the user's input intact.
  Exact signatures and markup: `references/writer-first-patterns.md`.
- **Every plugin ships `app/error.tsx`** (client boundary, reset button,
  plain copy) so unexpected errors degrade to a plugin-scoped message, never
  the bare platform 500.
- **Prefer prevention over error:** if an action is knowably unavailable
  (nothing to publish, no credential), disable the control with a hint
  nearby — and keep the inline error as backstop.
- **Conflicts and degraded modes get their own affordance** — a comparison
  or explanatory fallback in plain words ("This post changed on your site
  while you were editing"), not a generic error string.

## States, not pages

A screen is done when all its states are designed, not when the happy path
renders. Check each of: **empty** (first run, both "no data yet" and
"invited user" flavours), **populated**, **degraded** (missing credential,
failed background refresh — show what you can, say what you can't),
**error**, **pending** (button labels flip to "Saving…"), and **all modes**
(e.g. an editor's write/source/preview). Two specific traps this repo has
hit: navigation items that exist but lead nowhere (dead placeholders — cut
them until they work), and data that exists but is filtered out of every
view (local drafts invisible on a gated dashboard — always ask "where does
the user _find_ this again?").

## Wireframe-before-build

For a new screen, feature, or redesign, produce a spec before code:

1. **Inventory the surface**: every screen including both home states, every
   mode, every dialog, and the "pages intentionally not redesigned".
2. **Wireframe each screen** as standalone SVGs in
   `docs/adhoc/<topic>/NN-name.svg` (they render on GitHub and in editors)
   using light neutral fills and real copy — placeholder copy hides
   plain-language problems.
3. **Write the doc** at `docs/adhoc/<topic>.md`: problem, direction, jargon
   table, screens with embedded images and per-screen notes, engineering
   notes (new dependencies called out honestly), open questions, and a
   **phased plan where each phase is independently shippable** — a copy pass
   is usually phase 1 and delivers outsized value.
4. Get the developer's sign-off on the doc before implementing; each phase
   then maps to one roadmap task.

## Pre-merge checklist

- No primitive/hardcoded colours; components from `@sovereignfs/ui`.
- No internal vocabulary in any user-visible string (check against the
  feature's jargon table).
- Every mutation: inline expected-error path + pending label; `error.tsx`
  boundary exists.
- Empty/degraded/error states render something helpful.
- No nav items or buttons that lead nowhere.
- Storybook updated if `packages/ui` changed.
- Verified live in the preview browser, including at 768px-and-below width.
