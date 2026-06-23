# Epic: Accessibility

> WCAG 2.1 AA compliance for all platform-owned UI, automated a11y linting baked into CI, and a clear plugin developer accessibility contract.

## Status

✅ Complete

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
