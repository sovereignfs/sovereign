# Epic: Accessibility

> WCAG 2.1 AA compliance for all platform-owned UI, automated a11y linting baked into CI, and a clear plugin developer accessibility contract.

## Status

⏳ In Progress

## Overview

Task 0.5.29 established the full a11y baseline: `eslint-plugin-jsx-a11y` (recommended) runs in CI on all packages; every semantic color pair in the design system meets 4.5:1 text contrast and 3:1 UI-component contrast; `prefers-reduced-motion` is applied to animated components; focus-visible ring tokens are codified. The audit covered the runtime shell chrome, auth login/registration, Console, Launcher, and Account. Plugin developers get a dedicated "Accessibility" section in `docs/plugin-development.md`.

## Related RFCs

- [RFC 0025 — Accessibility](../rfcs/0025-accessibility.md)

## Related Docs

- [design-system.md — Contrast commitment, focus-visible](../design-system.md)
- [plugin-development.md — Accessibility section](../plugin-development.md)

## Tasks

#### ✅ 10.1 — Accessibility audit & a11y contract (RFC 0025)

**Goal:** Reach WCAG 2.1 AA on all platform-owned UI, add automated a11y linting,
and deliver the plugin developer a11y contract per RFC 0025.

**Deliverables:**

- `eslint-plugin-jsx-a11y` (recommended ruleset) added to `eslint.config.ts`;
  applied to `runtime/`, `apps/auth/`, `packages/ui/`, and `plugins/`; `pnpm lint`
  and the CI `lint` job pass with no suppressions
- `packages/ui`: four new semantic tokens (`--sv-color-error`, `--sv-color-error-text`,
  `--sv-color-success`, `--sv-color-success-text`) paired with icon/text convention;
  `prefers-reduced-motion` applied to animated components (Dialog, future Drawer/Toast);
  `:focus-visible` outline via `--sv-color-focus-ring` codified on all interactive
  components (`@sovereignfs/ui` **minor** bump)
- Audit + fix: runtime shell chrome, `apps/auth` login/registration, Console,
  Launcher, and Account against WCAG 2.1 AA — roles, labels, keyboard interactions,
  focus order, color contrast
- `docs/design-system.md`: contrast commitment table (4.5:1 text, 3:1 UI components)
  for all semantic color pairs; focus-visible token guidance; per-component a11y
  spec (roles, keyboard table, ARIA attributes, focus order)
- `docs/plugin-development.md`: new "Accessibility" section (semantic HTML, form
  labels, icon `aria-hidden`/`aria-label` convention, color independence, keyboard
  operability, custom widget ARIA patterns, live regions, `prefers-reduced-motion`)
- `docs/sovereign-proposal-plan-srs.md`: NFR-11 — WCAG 2.1 AA for platform-owned UI

**Dependencies:** Task 0.5.17 (Icon a11y convention), Task 0.5.25 (touch targets)

**SRS reference:** RFC 0025, NFR-11

**Review checklist:**

- `pnpm lint` passes with `eslint-plugin-jsx-a11y` enabled; no inline suppressions
- Keyboard-only navigation covers: log in, open and close an overlay plugin, navigate
  Console user list, change a setting in Account
- Every semantic color pair documented in `docs/design-system.md` meets 4.5:1 text
  contrast and 3:1 UI-component contrast
- Plugin dev guide "Accessibility" section covers all items from RFC 0025

---

#### ✅ 10.2 — In-app text-size control (pinch-zoom compensation)

**Status (2026-08):** Shipped. `--sv-text-size-scale` primitive
(`packages/ui/src/tokens/primitives.css`) scales the root font size —
`default` / `large` (+12.5%) / `larger` (+25%) — via `[data-text-size]` on
`<html>`, applied pre-paint by `runtime/src/theme-script.ts` from the
`sv-text-size` cookie (same mechanism as `[data-theme]`; CSP hash
recomputed). Persisted server-side in `account_prefs.text_size` and surfaced
as `TextSizeControl` (Account → Preferences → Appearance), mirroring
`ThemeControl`. `runtime/app/layout.tsx`'s `userScalable: false` is kept —
the comment there now records this control as the discharging replacement
rather than open debt. `@sovereignfs/ui` bumped to `0.52.0` (new token, no
breaking change).

**Goal:** Give users a way to enlarge text without pinch-zoom, discharging the
accessibility debt incurred when pinch-zoom was disabled app-wide. Required before
the first native app store submission, where a disabled-zoom-with-no-alternative
state is an accessibility-guideline risk rather than merely known debt.

**Background:** `runtime/app/layout.tsx`'s `viewport` export sets
`maximumScale: 1, userScalable: false`. `docs/research/0011-ios-pwa-inspection-findings.md`
records this as a deliberate tradeoff **explicitly conditioned** on "shipping a
compensating in-app text-size control (tracked as a follow-up)" — that follow-up is
this task. The original finding also warns against suppressing zoom as a fix for
input focus-zoom, precisely because it removes a low-vision affordance.

**Deliverables:**

- A per-user text-size preference (at minimum three steps, e.g. default / large /
  larger), persisted server-side with the other account preferences.
- `packages/ui`: root-level type scaling. Every `--sv-font-size-*` token in
  `packages/ui/src/tokens/primitives.css` is already `rem`-based, so scaling the
  root font size scales the whole type system without per-component changes —
  prefer that over touching individual tokens or components.
- Applied **pre-paint**, following the theme precedent, so there is no
  flash-then-reflow on load; updated live from the control, the way
  `plugins/account`'s `ThemeControl` updates the theme.
- Control surfaced in the Account plugin alongside the existing theme control.
- Storybook coverage for the scaled type scale; `@sovereignfs/ui` version bump per
  NFR-04 (no breaking change in a patch).
- Re-evaluate whether `userScalable: false` is still warranted now that a control
  exists, and record the decision either way.
- `docs/design-system.md` documents the scaling mechanism so plugin authors know
  their `rem`-based type inherits it and hardcoded `px` type does not.

**Load-bearing constraint:** if the pre-paint inline script changes,
**`THEME_SCRIPT_CSP_HASH` in `runtime/src/security.ts` must be recomputed** — the
CSP is nonce-based with a hash for that one inline script, and this exact trap is
recorded as having been hit before in the iOS findings doc.

**Dependencies:** Task 10.1. Blocks workstream 0002 leg 5 (store submission).

**SRS reference:** NFR-11, RFC 0025

**Review checklist:**

- Changing the text-size preference visibly scales type across the shell, Console,
  Launcher, Account, and at least one product plugin.
- The preference survives a reload and applies before first paint — no flash at the
  previous size, no reflow.
- Live change from the control takes effect without a reload.
- CSP is intact after any pre-paint script change; `THEME_SCRIPT_CSP_HASH` matches.
- Text remains legible and layout un-broken at the largest step at 390px width.
- `pnpm --filter @sovereignfs/ui typecheck` passes; Storybook builds.
- The `userScalable` decision is recorded, not left implicit.

---
