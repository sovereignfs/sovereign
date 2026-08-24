# RFC 0094 — Design-system theme presets

**Status:** Implemented\
**Date:** August 2026\
**Author:** Claude Code\
**Scope:** `packages/ui` only (tokens, component CSS Modules, Storybook). Builds on the token architecture in `docs/design-system.md`, the delivery precedent in [RFC 0077](0077-instance-radius-control.md) (instance radius control), and [research 0018](../research/0018-design-system-level-theming-neobrutalism.md). Companion RFC [0095](0095-instance-theme-preset-selection.md) covers making a preset operator-selectable — deliberately out of scope here.\
**Incorporated into plan:** Yes — shipped in the same change as this RFC's own draft (design and implementation done together in one session, per explicit developer direction, rather than staged). Every item in Proposed design and Adoption path landed: `theme-presets.ts`, the generator script, both new token tiers, the `Button` internal change, the border-width migration, and the Storybook toolbar — verified via `pnpm design:tokens:check`/`typecheck`/`lint`/full test suite/`build-storybook`, plus a live visual check in Storybook confirming both light and dark neobrutalism render correctly.

---

## Summary

Add a small, closed set of named **theme presets** to `@sovereignfs/ui` —
`'default'` (today's look, byte-identical) and `'neobrutalism'` (the first
new one) — each a bundle of semantic-token overrides (border width, shadow
shape, corner radius, a restrained set of colour/typography tweaks) selected
by a new, independent CSS selector that composes with, rather than replaces,
the existing `[data-theme='dark']` light/dark switch. This generalizes the
exact mechanism [RFC 0077](0077-instance-radius-control.md) already proved
for one dimension (corner radius) into a mechanism that can carry a whole
visual identity, while keeping every one of that RFC's guarantees: no
component API changes, no `runtime/` changes, additive and non-breaking.

Presets are **closed and built-in** — shipped as `packages/ui` releases, not
operator-authored — a deliberate scope decision (see Alternatives
considered) to avoid the security and versioning surface an open
custom-theme-authoring feature would introduce.

## Motivation

[Research 0018](../research/0018-design-system-level-theming-neobrutalism.md)
explored whether Sovereign could support a strongly distinct alternate visual
identity (neobrutalism was the worked example) purely at the design-system
level, and found the answer is yes for most of it, with two real gaps: border
width is a hardcoded literal, not a token, almost everywhere, and `Button` has
no tactile press interaction. That research also warned against chasing an
"authentic," multi-colour neobrutalism, since it fights the design system's
stated monochrome-minimal identity at a philosophical level, not just a token
level — this RFC deliberately stays inside the existing one-accent-colour
model.

The follow-up decision (this RFC's actual trigger) was to stop treating
neobrutalism as a one-off and instead build the **general mechanism** — so
that a second, third, or fourth theme later is "add one more entry to a
lookup table," the same way RFC 0077 made every future radius preset trivial
once the scale-factor mechanism existed.

## Current state (what this builds on)

- **Two-tier token architecture.** `packages/ui/src/tokens/primitives.css`
  (fixed) → `packages/ui/src/tokens/semantic.css` (the theming surface).
  Every component references semantic tokens by name
  (`docs/design-system.md:57-101`).
- **Three existing precedents for "override semantic tokens at a selector,
  zero component changes":** dark mode (`semantic.css:102-141`,
  `[data-theme='dark']`), tenant accent colour (RFC 0027/0032, delivered via
  `runtime/src/instance-style.ts`), and instance corner-radius (RFC 0077,
  `--sv-radius-scale` in `primitives.css:106-117`).
- **`data-theme` is reserved for light/dark and cannot be reused.**
  `runtime/src/theme-script.ts`'s pre-paint script unconditionally sets
  `document.documentElement.dataset.theme = dark ? 'dark' : 'light'` on every
  load, and the script's exact string is pinned by a CSP hash
  (`THEME_SCRIPT_CSP_HASH`). A third value written anywhere else would be
  overwritten before paint. A theme preset needs its **own** selector.
- **Real gaps identified in research 0018:** border width is a hardcoded
  `1px` literal across ~29 component CSS Modules (e.g. `Card.module.css:9`,
  `Button.module.css:6`), documented as an intentional exception to "every
  value is a token" (`docs/design-system.md:274-278`, exempt from
  `pnpm design:tokens:check`). `Button`'s `:active` states only
  `color-mix()`-darken the background (`Button.module.css:104-105, 120-121,
135-136, 151-152`) — no shadow, no transform, and `Button` consumes no
  `--sv-shadow-*` token at all today.
- **`pnpm design:tokens:check`** (`scripts/design-tokens-check.ts`) fails on
  undefined `var()` references and hardcoded colour literals; it does not
  restrict adding new token definitions.
- **Storybook's Themes toolbar** already toggles `data-theme` on the canvas
  root (`docs/design-system.md:1675-1679`) — the existing pattern to extend
  for a second, independent toggle.

## Proposed design

### 1. Single source of truth: a plain TS object, not raw CSS

`packages/ui/src/tokens/theme-presets.ts`:

```ts
export type ThemePresetName = 'default' | 'neobrutalism';

interface ThemePresetTokens {
  light: Record<string, string>; // sparse — only tokens this preset overrides
  dark: Record<string, string>;
}

export const THEME_PRESETS: Record<ThemePresetName, ThemePresetTokens> = {
  default: { light: {}, dark: {} }, // empty — guarantees byte-identical output
  neobrutalism: {
    light: {
      '--sv-radius-scale': '0',
      '--sv-border-width-hairline': '2px',
      '--sv-shadow-card': '4px 4px 0 0 var(--sv-color-border-strong)',
      '--sv-shadow-hover': '6px 6px 0 0 var(--sv-color-border-strong)',
      '--sv-shadow-popover': '4px 4px 0 0 var(--sv-color-border-strong)',
      '--sv-shadow-overlay': '8px 8px 0 0 var(--sv-color-border-strong)',
      '--sv-button-shadow': '4px 4px 0 0 var(--sv-color-border-strong)',
      '--sv-button-press-x': '4px',
      '--sv-button-press-y': '4px',
    },
    dark: {/* same shape, dark-appropriate shadow colour */},
  },
};
```

This is the **only** place preset token values are authored. It is
deliberately plain data (no CSS-in-JS, no build tooling dependency) so it can
be imported two ways with zero duplication:

- A small generation step (mirrors `scripts/icon-list.ts` → `pnpm
generate:icons`'s existing pattern of "TS list generates a committed
  artifact") emits `packages/ui/src/tokens/theme-presets.css` — static CSS
  for Storybook and standalone (non-runtime) consumers.
- RFC 0095 imports `THEME_PRESETS` **directly as a TS object** into
  `runtime/src/instance-style.ts` — no CSS parsing, no second copy of the
  values to drift out of sync.

Rejected alternative: hand-writing the CSS directly and leaving RFC 0095 to
duplicate the values in a separate TS lookup (the way `RADIUS_SCALE` is
today). See Alternatives considered.

### 2. Selector: independent of `data-theme`, composes with it

Generated CSS shape:

```css
[data-theme-preset='neobrutalism'] {
  /* ...light tokens... */
}

[data-theme-preset='neobrutalism'][data-theme='dark'] {
  /* ...dark tokens... */
}
```

The combined selector for the dark variant has specificity `(0,0,2,0)` —
strictly higher than either single-attribute selector alone — so it
correctly wins regardless of source order in the compiled stylesheet. No
attribute is ever set on `<html>` for the `'default'` preset; absence of the
attribute is the default state, matching today's behaviour exactly.

**Correctness constraint, found during implementation: this selector must
always match the document root element (`<html>`), never a nested/scoped
wrapper.** `--sv-radius-scale` is the root of a `calc()` chain —
`--sv-radius-sm` through `-3xl` are each `calc(var(--sv-radius-scale) * ...)`,
declared exactly once, at `:root`, in `primitives.css`. A custom property
referenced inside another custom property's `calc()` is resolved using the
value cascaded **at the element where the outer property is declared** — not
re-resolved per descendant. Since `--sv-radius-sm` etc. are only ever
declared at `:root`, overriding `--sv-radius-scale` on some element that
isn't `:root` (e.g. a plugin's own root `<div>`, or a `Dialog`'s content
region) has no effect on them — they keep inheriting whatever `--sv-radius-scale`
resolved to at `:root`. This is the same constraint `.storybook/preview.ts`'s
pre-existing `withRadius` decorator comment already documents, discovered
independently while building RFC 0077's own Token Gallery preset demo — this
RFC hits the identical issue because the `neobrutalism` preset also overrides
`--sv-radius-scale`. In practice this means: `data-theme-preset` must be set
on `<html>` specifically (exactly where `data-theme` is already required to
be set), never on a descendant — Storybook's activation decorator, RFC 0095's
production delivery (which sidesteps the whole selector question by injecting
flat `:root { }` lines directly, see that RFC), and any future standalone
consumer must all honour this. The other new tokens this RFC adds (border
width, button-shadow, button-press-x/-y) are leaf tokens with no dependent
`calc()` chain, so they don't share this constraint — they'd resolve
correctly at any nesting level. Only `--sv-radius-scale` (and any future
preset token that composes into another token via `calc()`) is affected.

### 3. New tokens, both default to a no-op

- `--sv-border-width-hairline: 1px` (primitive, `primitives.css`) — every
  component switches its literal `border: 1px solid ...` to `border:
var(--sv-border-width-hairline) solid ...`. Default value is unchanged from
  today; this is a mechanical, behaviour-preserving migration across the ~29
  files research 0018 identified.
- `--sv-button-shadow: none`, `--sv-button-press-x: 0`, `--sv-button-press-y:
0` (semantic, `semantic.css`) — `Button.module.css` gains, unconditionally:

  ```css
  .button {
    box-shadow: var(--sv-button-shadow);
    transition: /* existing transitions */
      ,
      transform 0.1s ease,
      box-shadow 0.1s ease;
  }
  .button:active:not(:disabled) {
    transform: translate(var(--sv-button-press-x), var(--sv-button-press-y));
    box-shadow: none;
  }
  ```

  With the default tokens (`none`/`0`/`0`), this is inert — `.button:active`
  already had no visible shadow and `translate(0, 0)` is a no-op. The rule
  exists unconditionally in the compiled CSS (no per-theme conditional
  component logic), but is only visible once a preset sets non-zero values.
  This is the one genuinely new interaction Sovereign ships as a result of
  this RFC — see Open questions on whether it should be preset-gated forever
  or eventually offered as a general opt-in.

### 4. Storybook activation (this RFC's own validation path)

A second toolbar control, alongside the existing Themes (light/dark) addon,
setting `data-theme-preset` on the canvas root (`document.documentElement`,
per the correctness constraint in §2). This is the **only** activation path
this RFC delivers — nothing in `runtime/` sets this attribute; a live
Sovereign instance cannot show this preset until RFC 0095 (or some other
activation) ships. That's intentional: this RFC is fully buildable, testable,
and revertable without touching platform code.

**A second correctness issue found during implementation:** the existing
`withRadius` decorator (`.storybook/preview.ts`) sets `--sv-radius-scale` via
an **inline style** (`document.documentElement.style.setProperty(...)`). An
inline style always wins over any stylesheet rule for the same property,
regardless of selector specificity — so if `withRadius` ran unconditionally,
it would permanently shadow the `neobrutalism` preset's own
`--sv-radius-scale` override, and the Radius toolbar's last value would
silently win instead, even while previewing a preset that's supposed to
control it. Fixed by making `withRadius` check whether the active theme
preset owns `--sv-radius-scale` (reading `THEME_PRESETS` directly — no
duplicated lookup) and, if so, clear its own inline override instead of
setting one, so the preset's stylesheet rule actually applies. The Radius
toolbar becomes advisory while a preset that defines its own radius is
active — a deliberate choice: Storybook's job here is to show what the
preset actually looks like, not a half-preset/half-manual hybrid.

### 5. Per repo convention (Storybook hygiene)

New/renamed tokens go in `TokenGallery.stories.tsx`; the neobrutalism preset
gets a row in `DesignSystemOverview.stories.tsx`'s design-rules section.

## Alternatives considered

- **Reuse `[data-theme]` for the preset too** (e.g. `data-theme="neobrutalism-dark"`).
  Rejected — collides with the CSP-hash-pinned pre-paint script (see Current
  state); light/dark and "brand skin" are orthogonal axes, not one enum.
- **Open, operator-authored themes** (raw token values via Console, no code
  release needed). Rejected for now, per explicit decision during this
  RFC's scoping — real security surface (arbitrary CSS-like values need
  validation/sanitization), a storage format, and versioning risk as
  `packages/ui`'s own token set evolves across upgrades. Revisit only if
  closed built-in presets prove insufficient.
- **A full multi-colour palette for neobrutalism** (distinct colours per
  surface, the way neobrutalism.com itself does it). Rejected — fights the
  design system's monochrome-plus-one-accent identity at a philosophical
  level; the preset stays inside the existing `--sv-color-accent` model.
- **Hand-write the CSS and let RFC 0095 re-derive a separate TS lookup**
  (mirroring how `RADIUS_SCALE` exists only in `runtime/src/instance-style.ts`
  today). Rejected — two representations of the same values is a drift risk
  that gets worse with every future preset; a single TS source generating
  both consumption paths costs little extra and removes the risk entirely.

## Open questions

1. **Exact neobrutalism values are illustrative, not final** — same caveat
   RFC 0077 flagged for its own scale factors: needs a visual QA pass across
   `Button`, `Card`, `Input`, `Dialog`, and the rest of the component catalog
   in Storybook before being considered final.
2. **Should the `Button` press-interaction tokens be considered
   neobrutalism-specific, or a generally available enhancement** any future
   theme (or even the default theme, eventually) could opt into? Leaning
   toward "generally available, just currently only set by one preset,"
   since the tokens themselves are inert by default either way.
3. **No automated visual-regression tooling exists yet** (`Card.module.css`
   notes this directly, epic task 9.14 not landed as of this writing) —
   verifying the `'default'` preset stays pixel-identical after the
   border-width migration relies on manual review, not a CI guarantee.
4. Whether the border-width migration across ~29 files ships as one PR or is
   staged — an adoption-sequencing question, not a design one.

## Adoption path

Single PR is feasible — every change is additive and mechanical (new tokens,
a new generated stylesheet, a systematic literal-to-token swap, one
Storybook addon, one `Button` internal change). Suggested order: `theme-presets.ts`
data module → generation script → `primitives.css`/`semantic.css` new tokens
→ border-width migration across components → `Button` internal change →
Storybook toolbar + Token Gallery/Overview updates.

**Semver:** additive only — no existing token is renamed or removed, no
component prop changes. Ships as a `packages/ui` minor bump per NFR-04, same
conclusion RFC 0077 reached for the identical shape of change.

## Changelog

| Version | Date        | Change                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0.1     | August 2026 | Initial draft                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 0.2     | August 2026 | Implemented. Found and documented two correctness constraints during implementation, both now fixed in code: (1) `--sv-radius-scale` overrides must land on the actual `:root` element (§2), not a scoped wrapper — added to Proposed design. (2) Storybook's pre-existing `withRadius` decorator's inline-style override was silently shadowing the preset's own stylesheet-based radius override — fixed by making it defer to the active preset when one owns `--sv-radius-scale` (§4). No change to the design's public shape (token names, selector, `THEME_PRESETS` structure all as originally proposed). |
