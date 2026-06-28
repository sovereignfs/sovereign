# RFC 0025 — Accessibility (WCAG 2.1 AA)

**Status:** Implemented\
**Date:** June 2026\
**Author:** kasunben\
**Scope:** `packages/ui`, `docs/design-system.md`, `docs/plugin-development.md`, `eslint.config.ts`, SRS; builds on RFC 0001 (Dialog focus trap), RFC 0011 (Icon aria-hidden), RFC 0013 (touch targets)\
**Incorporated into plan:** Yes — Task 0.5.29. SRS NFR ID assigned during the implementation task.

---

## Summary

Establish **WCAG 2.1 AA** as the explicit compliance target for all platform-owned
UI, add automated a11y linting to the CI pipeline, and give plugin developers a
clear a11y contract so third-party plugins don't accidentally ship inaccessible
experiences.

The work lands in three axes — design system contract, ESLint enforcement, and
plugin developer guidance — and is delivered in one implementation task (0.5.28)
after this RFC is accepted. No production behaviour changes in this RFC; it is
strategy and specification.

## Motivation

Sovereign is positioned as a self-hosted, privacy-first workspace. That
positioning actively attracts users who rely on assistive technology: screen
readers, switch access, keyboard-only navigation, and display adaptations. A
platform that can't be used by AT users contradicts its own principles.

The published `@sovereignfs/ui` design system is a public contract for plugin
developers. Without an explicit a11y guarantee, that contract is incomplete: a
plugin author using `<Button>` or `<Dialog>` can't know whether the components
they ship are accessible. The ecosystem inherits any gap.

The current state has scattered a11y primitives but no formal commitment:

- `packages/ui/src/components/Dialog/Dialog.tsx` has a full focus trap, `role="dialog"`,
  `aria-modal="true"`, Esc dismissal, and focus restoration — but this is
  undocumented as a contract.
- `runtime/app/(platform)/_components/AccountMenu.tsx` uses `aria-expanded` and
  Esc/click-outside — also undocumented.
- `--sv-color-focus-ring` exists in the token set but its use on interactive
  elements is not codified.
- RFC 0013 sets 44px touch targets and `prefers-color-scheme` theming, but
  `prefers-reduced-motion` is not handled.
- No linting catches new violations automatically.
- `docs/plugin-development.md` has no accessibility section.

The gap between "has some a11y" and "has a verified, documented, enforced a11y
baseline" is exactly what ships broken keyboard flows and screen-reader
experiences in production.

## Current state (what this builds on)

- **Dialog component** — `packages/ui/src/components/Dialog/Dialog.tsx`: `role="dialog"`,
  `aria-modal`, `aria-label`, focus trap (`FOCUSABLE` selector on open), focus
  restoration to `previouslyFocused` on close, Esc via `onKeyDown`, close button
  `aria-label="Close"`. The implementation is correct; the spec is absent.
- **AccountMenu** — `runtime/app/(platform)/_components/AccountMenu.tsx`: popover
  menu with `aria-expanded`, Esc, click-outside, keyboard-accessible trigger.
- **Semantic tokens** — `packages/ui/src/tokens/semantic.css`: `--sv-color-focus-ring`
  exists; no rule mandates its use on interactive elements.
- **Icon** — RFC 0011 (Task 0.5.18, unimplemented): specifies `aria-hidden` for
  decorative icons and `aria-label` for functional ones. This RFC depends on that
  convention being established.
- **Touch targets** — RFC 0013 (Task 0.5.26, unimplemented): sets
  `--sv-touch-target-min: 44px` and enforces it on interactive elements. The a11y
  audit in Task 0.5.29 should run after 0.5.25.
- **ESLint** — `eslint.config.ts` (root, flat config, Task 0.3.3): `typescript-eslint`
  recommended + strict, `eslint-config-prettier`. Adding `eslint-plugin-jsx-a11y`
  follows this pattern without structural change.

## Proposed design

### Compliance target

**WCAG 2.1 AA** for all platform-owned UI (shell chrome, auth UI, Console,
Launcher, Account, and all `packages/ui` components). This is the legal baseline
in most jurisdictions, the standard tested by common tooling (`axe`, `jsx-a11y`),
and the one most AT users cite. WCAG 2.2 AA is additive and treated as a future
upgrade path, not a blocker.

The target applies to the platform. Plugin developers are _expected_ to follow
the plugin a11y contract (see Axis C below); `@sovereignfs/ui` components are
_guaranteed_ to meet it.

### Axis A — Design system a11y contract (`packages/ui`)

#### Focus visible

Every interactive `packages/ui` component (Button, Input, any future Select,
Checkbox, etc.) exposes a `:focus-visible` outline referencing `--sv-color-focus-ring`.
This is already true in practice for Button; it becomes an explicit contract.
`docs/design-system.md` adds a "Focus visible" section documenting the token and
the rule.

#### New semantic tokens

Status signals must never rely on color alone (WCAG 1.4.1). The existing semantic
color set lacks error and success tones. Four tokens are added:

```
--sv-color-error           background / border for error states
--sv-color-error-text      text on a neutral surface indicating an error
--sv-color-success         background / border for success states
--sv-color-success-text    text on a neutral surface indicating success
```

These always appear paired with an icon or text label — never as the sole
differentiator. The v1 identity is monochrome; these are near-semantic values
(error = a desaturated red-adjacent tone, success = desaturated green-adjacent)
that do not break the monochrome character but satisfy color-independence.
`@sovereignfs/ui` gets a **minor** bump for the new tokens (additive).

#### Contrast commitment

All semantic text/background pairs must meet:

- **4.5:1** for body text (WCAG 1.4.3 AA)
- **3:1** for large text and UI component boundaries (WCAG 1.4.11 AA)

The implementation task (0.5.28) audits the existing color pairs, adjusts any
that fall short, and documents the ratios in `docs/design-system.md` as a
permanent reference. Values are verified at authoring time (manual or a token
test); runtime contrast is not asserted in CI for now.

#### `prefers-reduced-motion`

Animated `packages/ui` components (Dialog entrance/exit, future Drawer, future
Toast) suppress or reduce their transitions when `@media (prefers-reduced-motion:
reduce)` is active. The existing Dialog has no CSS transition today; the RFC
documents the rule so it is applied before animations are added.

#### Per-component a11y spec

`docs/design-system.md` gains an a11y subsection for each component shipping in
or before Task 0.5.29. Format: a small table covering role/element semantics,
keyboard interactions, ARIA attributes, focus order, and any `aria-live` usage.

| Component | Role / element  | Keyboard              | ARIA                               | Focus order             |
| --------- | --------------- | --------------------- | ---------------------------------- | ----------------------- |
| Button    | `<button>`      | Enter/Space activates | `disabled` propagated              | Natural DOM order       |
| Input     | `<input>`       | Standard              | `aria-invalid`, `aria-describedby` | Natural DOM order       |
| Dialog    | `role="dialog"` | Esc closes, Tab traps | `aria-modal`, `aria-label`         | First focusable on open |

The implementation task fills in all rows for the v1 component set.

### Axis B — ESLint a11y linting

`eslint-plugin-jsx-a11y` (recommended ruleset) is added to `eslint.config.ts`
and applied to all JSX/TSX files in the monorepo: `runtime/`, `apps/auth/`,
`packages/ui/`, and `plugins/`. The recommended ruleset is chosen over strict
because plugin authors using the starter template (RFC 0017) should not hit
false-positive noise; violations from the recommended set are unambiguous errors.

`pnpm lint` and the CI `lint` job enforce this from the moment the task lands.
The implementation task must clean up any existing violations before enabling the
rule — a red CI is not acceptable to merge on.

No new devDependency beyond the plugin. It follows the exact flat-config pattern
established in Task 0.3.3.

### Axis C — Plugin developer a11y contract (`docs/plugin-development.md`)

A new **"Accessibility"** section, positioned after the existing "Testing" section
and before any future appendices. It covers:

1. **Semantic HTML first.** Use the element that matches the role (`<button>` not
   `<div onClick>`; `<nav>`, `<main>`, `<header>` for landmarks; `<h1>`–`<h6>`
   hierarchy that makes sense without visual styling).

2. **Form label pairing.** Every `<input>`, `<select>`, and `<textarea>` must have
   a visible `<label>` associated via `for`/`id`, or an `aria-label` when a
   visible label is impractical. Never use `placeholder` as the only label.

3. **Icon convention.** Decorative icons (purely visual reinforcement of adjacent
   text) carry `aria-hidden="true"`. Functional icons (standalone clickable or
   meaningful without surrounding text) carry `aria-label`. This follows the
   convention RFC 0011 establishes for the `<Icon>` component and applies equally
   to custom SVG usage.

4. **Color independence.** Never use color as the sole way to convey status,
   state, or meaning (WCAG 1.4.1). Always pair a color change with an icon, text
   label, or pattern change. Use `--sv-color-error-text` / `--sv-color-success-text`
   with a companion icon.

5. **Keyboard operability.** Every interactive element a mouse user can activate,
   a keyboard user must be able to activate. No `focus: none` on focusable
   elements. Tab order must follow the visual reading order. Modal dialogs use a
   focus trap (the `<Dialog>` primitive already provides this). Traps outside
   modals are forbidden.

6. **Custom widget ARIA patterns.** When building a combobox, menu, tabs, tree, or
   other composite widget, follow the [WAI-ARIA Authoring Practices Guide](https://www.w3.org/WAI/ARIA/apg/)
   pattern for that widget. The APG patterns cover keyboard contract and required
   ARIA roles/properties.

7. **Live regions for async feedback.** When content changes without a page reload
   in response to user action (search results, form submission outcome, item
   deletion), announce the change via an `aria-live` region (`polite` for
   non-urgent, `assertive` sparingly for errors). Never update only the visual
   presentation and leave AT users without feedback.

8. **`prefers-reduced-motion`.** Suppress or reduce any animation or transition
   your plugin introduces when the user has requested reduced motion.

### SRS addition

A new NFR (number assigned during the implementation task) is added to
`docs/sovereign-proposal-plan-srs.md` §4.2 (Non-Functional Requirements):

> **NFR-11 — Accessibility.** All platform-owned UI (shell chrome, auth UI,
> Console, Launcher, Account, `@sovereignfs/ui` components) shall conform to
> WCAG 2.1 Level AA. Plugin developers are expected to follow the accessibility
> contract in `docs/plugin-development.md`; `@sovereignfs/ui` components are
> guaranteed to satisfy it.

## Alternatives considered

**WCAG 2.2 AA from the start.** WCAG 2.2 adds nine new success criteria over 2.1.
Most are already satisfied by the existing shell (2.4.11 Focus Appearance, 2.5.3
Label in Name, 2.5.7 Dragging Movements). Adopting 2.1 now commits us to a
well-tooled, well-understood baseline; the few 2.2 additions that require work
(e.g. 2.4.12 Focus Appearance for all interactive elements) can be incorporated
during the 0.5.28 audit without being blocked by the standard. The RFC is written
to be 2.2-compatible.

**Axe-core / Playwright a11y automation in CI.** End-to-end a11y assertions (e.g.
`@axe-core/playwright` in the e2e tier) would catch rendered violations that
static linting misses. This is the right long-term posture but heavyweight for
Task 0.5.29 alongside the audit and documentation work. Deferred to a follow-up
or the e2e tier when RFC 0019's test infrastructure is in place.

**Linting only — no design-system spec or plugin guidance.** Linting catches
authoring errors (missing labels, wrong roles) but does not establish a contract
for component consumers or plugin authors. The published `@sovereignfs/ui` package
needs documented behaviour, not just clean lint output, before v1.

**Post-v1.** The design system is a public contract at v1.0; an undocumented,
unlinted a11y posture is not a v1-quality contract. Deferring would mean shipping
a published package that makes no guarantees about the accessibility of the
components it provides.

## Open questions

1. **Contrast automation.** Should semantic color token contrast ratios be verified
   in a Vitest test (computed at build time against known values) or left as a
   manual authoring commitment documented in `docs/design-system.md`? A test is
   more reliable but requires tooling for color-pair lookup.

2. **jsx-a11y recommended vs strict.** The recommended ruleset is unambiguous but
   misses some nuance that strict catches. Should the platform packages (`packages/ui`,
   `runtime/`, `apps/auth/`) use strict while plugins (which use the starter
   template) get recommended? Or one ruleset everywhere for consistency?

3. **`prefers-contrast: more` (high-contrast mode).** Should the Task 0.5.29 scope
   include a `prefers-contrast` media query layer on the semantic token set, or is
   that deferred as a follow-up?

4. **APCA for dark mode.** The WCAG relative-luminance contrast formula is known
   to be inaccurate for small text on dark backgrounds. Should the dark-mode color
   pairs target APCA (Advanced Perceptual Contrast Algorithm) ratios alongside WCAG
   ratios as an advisory metric?

## Adoption path

- **This RFC** lands in `docs/rfcs/` as a Draft. No code changes. Reviewed and
  either accepted or iterated on before the implementation task begins.
- **Task 0.5.29** implements the three axes: audit + fix shell/chrome/auth UI
  against WCAG 2.1 AA, add `eslint-plugin-jsx-a11y`, add semantic tokens, write
  component a11y specs in `docs/design-system.md`, write the "Accessibility"
  section in `docs/plugin-development.md`, add NFR-11 to the SRS.
- **Semver:** `@sovereignfs/ui` **minor** bump for the four new tokens. No breaking
  changes. No `@sovereignfs/sdk` change.
- **Dependencies:** Task 0.5.18 (Icon `aria-hidden`/`aria-label` convention should
  be established before the a11y spec references it); Task 0.5.26 (touch targets
  in place before the audit runs).

## Changelog

| Version | Date      | Change        |
| ------- | --------- | ------------- |
| 0.1     | June 2026 | Initial draft |
