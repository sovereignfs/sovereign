---
name: sv-ui-design
description: >-
  Sovereign UI design workflow — use whenever building, changing, or reviewing
  anything a person sees in this repo: pages, components, forms, dialogs, empty
  states, status badges, error handling, navigation, Console or identity
  screens, or user-facing copy. Also use when designing a new screen or feature
  (wireframe first), simplifying an existing UI, translating technical concepts
  into user-facing language, or wiring server-action errors into forms. Covers
  the design-system-first rules (packages/ui tokens/components), keeping the
  established Sovereign UI, plain-language principles, the
  ActionResult/useActionState error convention, and the wireframe-before-build
  process. Trigger even for "small" UI tweaks — copy changes, a new button, an
  error message — not just full features.
---

# Sovereign UI design workflow

Two audiences shape every UI decision in this repo: **app developers** (who
consume `@sovereignfs/ui` as a public contract) and **end users** (often
non-technical, who must never see implementation vocabulary). This skill
encodes how to design and build for both. The authoritative deep references
are `docs/design-system.md`, `docs/architecture-rules.md`, the spec's UI rules
(`docs/specs/core-app.md` §1.3), and the naming convention in your
instruction file (`AGENTS.md`) — this skill tells you when and how to apply
them.

> **Shared skill.** This file is byte-identical in `.claude/skills/` (Claude
> Code) and `.agents/skills/` (Codex); a test enforces it.

For worked examples (a jargon-translation table, copy patterns, error-UX
code shapes), read `references/writer-first-patterns.md` in this skill.

## Order of operations

1. **Know who the screen is for.** Operator screens (the Console) may show
   technical detail; everyday screens (sign-in, launcher, identity pages,
   consent) must not. If one screen serves both, split it rather than mixing.
2. **Start from the established Sovereign UI.** Core's sign-in pages, consent,
   signed-in shell, launcher, Console and identity pages keep the layouts and
   behaviour of their Sovereign predecessors. Match them before inventing.
3. **For new screens or redesigns: wireframe before building** (see below).
   For small changes, skip to 4.
4. **Build DS-first** (rules below).
5. **Wire error UX** for every mutation (convention below).
6. **Verify live** — drive the real UI in a browser (your harness's browser
   or preview tooling; register a throwaway account if needed); check every
   state, not just the happy path.

## Design-system-first rules

Full reference: `docs/design-system.md`. The load-bearing subset:

- **Semantic tokens only** in component and page CSS: `--sv-color-*` semantic
  names (`--sv-color-surface`, `--sv-color-text-primary`,
  `--sv-color-error-text`), never primitive colours (`--sv-grey-500`), never
  hard-coded values. Scale tokens (`--sv-space-*`, `--sv-radius-*`,
  `--sv-font-size-*`) are used directly.
- **Check `packages/ui/src/components/` before writing any control.** Button,
  Card, Input, Select, Checkbox, Dialog, Drawer, EmptyState, FormField,
  NavTabs, PageHeader, SegmentedControl, Spinner, StatusBadge, SystemBanner,
  Tabs, TagInput, Toast, Toggle, Tooltip and more already exist. Rebuilding
  one locally in core is a bug.
- **DS-first placement:** reusable UI/UX capability (interaction hooks,
  overlay surfaces, motion, controls) goes in `packages/ui`, and core consumes
  it. Never implement it locally "to be promoted later".
- **CSS Modules + CSS custom properties.** No Tailwind, no runtime CSS-in-JS.
- **Mobile:** the canonical breakpoint is 768px — use `useIsMobile` /
  `MOBILE_BREAKPOINT_PX` from `@sovereignfs/ui`, never a local number.
  Respect `--sv-touch-target-min` for tap targets.
- **Storybook hygiene** (CI-enforced): touching `packages/ui/src/` means
  updating/adding the matching story and the Component Gallery / TokenGallery
  entries, then `pnpm --filter @sovereignfs/ui typecheck`.

## Plain-language principles

The UI speaks the person's domain, never the implementation's. This is the
same rule as the repo's "app vs client" naming convention, extended to every
technical concept.

- **Maintain a jargon-translation table** for any feature with technical
  internals (OAuth, scopes, tokens, capabilities). Internal terms stay in code
  and schema; people see the translated term. Worked example in
  `references/writer-first-patterns.md`.
- **Status labels explain themselves.** "Invite pending — expires in 3 days"
  beats "Pending". Prefer state names describing consequence over mechanism.
- **Progressive disclosure, not removal.** Technical detail (client IDs, scope
  strings, redirect URIs) moves behind one "Advanced" or technical-settings
  disclosure — available, never ambient.
- **Setup vs. daily use.** Configure-once concerns (registration policy, mail
  settings, app registration, danger zone) live in the Console, not on
  everyday screens.
- **Empty states are invitations** with one clear action, plus a line for the
  person who arrived by invitation rather than setup.
- **Copy mechanics:** sentence case everywhere; verb-first buttons (1–3
  words); no "please", "successfully", "simply"; errors say what happened
  then what to do; auto-generate what can be generated and offer a muted
  "change" escape hatch.

## Error UX convention

Every user-triggerable mutation distinguishes **expected** failures (bad
input, missing precondition, remote rejection — things a person can act on)
from **unexpected** ones (bugs, authorization violations).

- **Expected failures never throw.** A thrown error in a server action
  replaces the whole page with the error boundary — for a wrong code or an
  expired invite, that is a bug. Return the shared result shape instead and
  render it inline with `useActionState`, keeping the person's input intact.
  Exact signatures and markup: `references/writer-first-patterns.md`.
- **Every route segment that can fail ships an `error.tsx`** (client boundary,
  reset button, plain copy) so unexpected errors degrade to a scoped message,
  never a bare 500.
- **Prefer prevention over error:** if an action is knowably unavailable,
  disable the control with a hint nearby — and keep the inline error as
  backstop.
- **Conflicts and degraded modes get their own affordance** — an explanation
  in plain words, not a generic error string.

## States, not pages

A screen is done when all its states are designed, not when the happy path
renders. Check each of: **empty** (first run, and the invited-person
flavour), **populated**, **degraded** (mail not configured, an app
unreachable — show what you can, say what you can't), **error**, **pending**
(button labels flip to "Saving…"), and **all modes**. Two traps: navigation
items that exist but lead nowhere (cut them until they work), and data that
exists but is filtered out of every view (always ask "where does the person
_find_ this again?").

## Wireframe-before-build

For a new screen, feature, or redesign, produce a spec before code:

1. **Inventory the surface**: every screen including both home states, every
   mode, every dialog, and the screens intentionally not redesigned.
2. **Wireframe each screen** as standalone SVGs in
   `.claude/wireframes/<topic>/NN-name.svg` using light neutral fills and real
   copy — placeholder copy hides plain-language problems. Never write these
   under `docs/`.
3. **Write the doc** at `.claude/wireframes/<topic>.md`: problem, direction,
   jargon table, screens with embedded images and per-screen notes,
   engineering notes (new dependencies called out honestly), open questions,
   and a **phased plan where each phase is independently shippable**.
4. Get the developer's sign-off on the doc before implementing; each phase
   then maps to one roadmap task. These files are working artifacts for that
   sign-off conversation, not permanent documentation — delete them once the
   feature ships, the same way `CURRENT_TASK.md` is never kept after a task
   completes.

## Pre-merge checklist

Run this checklist on every task that touches anything a person sees —
regardless of how small the change looks.

- **Design System Gap Check:** did this task need a control, token, or
  interaction pattern that doesn't exist in `@sovereignfs/ui` yet? If so, it
  was added there (DS-first placement) and consumed from core — not
  hand-rolled locally. State explicitly which case applied: "no gap" or "added
  `<X>` to packages/ui."
- The screen matches the established Sovereign UI for its kind of page.
- No primitive/hard-coded colours; components from `@sovereignfs/ui`.
  `pnpm design:tokens:check` passes.
- No internal vocabulary in any user-visible string (check against the
  feature's jargon table); "app", not "client", outside the Console's
  technical settings.
- Every mutation: inline expected-error path + pending label; an `error.tsx`
  boundary exists.
- Empty/degraded/error states render something helpful.
- No nav items or buttons that lead nowhere.
- Storybook updated if `packages/ui` changed.
- Verified live in a real browser, including at 768px-and-below width and in
  both themes.
