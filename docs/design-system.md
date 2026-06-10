# Sovereign Design System

`@sovereignfs/ui` is the Sovereign Design System: design tokens and React
components shared by the runtime shell, the Console plugin, and every
third-party plugin. It is a **public contract** — token names and component APIs
are versioned with the same discipline as the SDK (NFR-04). Renaming a token or
changing a component API is a breaking change.

This document is for **contributors** to the design system and for understanding
how theming works. The plugin-developer consumption guide (how to use components
and tokens inside a plugin) lives in `docs/plugin-development.md` (from v0.5).

## Contents

- [Design principles](#design-principles)
- [Token architecture](#token-architecture)
- [Token reference](#token-reference)
- [Building a component](#building-a-component)
- [Theming](#theming)

---

## Design principles

- **Monochrome and minimal.** The identity is a neutral grey scale with a single
  near-black/near-white accent — restraint over decoration. Colour is something a
  tenant adds, not something the system imposes.
- **Tokens, never literals.** Components reference `--sv-*` tokens only. A
  hardcoded colour, space, or radius in a component is a bug — it can't be themed
  and it drifts from the scale.
- **RSC-safe by default.** Components are presentational and hold no state unless
  they genuinely need interactivity, so they render in both Server and Client
  Components.
- **Accessible by default.** Visible focus states, correct semantics, and
  keyboard operability are part of "done," not a later pass.
- **No framework lock-in for tokens.** Tokens are plain CSS custom properties —
  consumable from any CSS, no JS import required.

## Token architecture

Two tiers, all prefixed `--sv-*` (short, tied to the `sv` CLI identity; never
abbreviated after the prefix):

```
primitives.css   raw, context-free scales — the palette, spacing, type, radii
  --sv-grey-50 … --sv-grey-950 · --sv-space-1 … --sv-space-16
  --sv-font-size-xs … --sv-font-size-2xl · --sv-radius-sm/md/lg
        │  mapped by
        ▼
semantic.css     contextual roles — what components and plugins reference
  --sv-color-surface · --sv-color-text-primary · --sv-color-border
  --sv-color-accent · --sv-shadow-card …
```

- **Primitives** are fixed. Theming never overrides them.
- **Semantic tokens** are the **theming surface**. Dark mode and tenant theming
  override these values (at `:root` or under `[data-theme]`) — and because
  components only reference semantic tokens, nothing else changes.
- **Reference semantic colour tokens, not primitive colours**, in components and
  plugin CSS. The scale tokens (`--sv-space-*`, `--sv-radius-*`,
  `--sv-font-size-*`) are theme-stable and used directly — they have no separate
  semantic layer because they don't change per theme.

The tokens ship as plain `.css` files. The runtime shell loads them once
(`@sovereignfs/ui/tokens.css`, which imports primitives then semantic) so the
variables are available globally to every plugin.

## Token reference

### Primitive tokens (`src/tokens/primitives.css`)

| Group         | Tokens                                                                       |
| ------------- | ---------------------------------------------------------------------------- |
| Palette       | `--sv-white`, `--sv-black`, `--sv-grey-50` … `--sv-grey-950`                 |
| Spacing (4px) | `--sv-space-1` (4px) … `--sv-space-16` (64px) — steps 1,2,3,4,5,6,8,10,12,16 |
| Font family   | `--sv-font-family`, `--sv-font-family-mono`                                  |
| Font size     | `--sv-font-size-xs`, `-sm`, `-md`, `-lg`, `-xl`, `-2xl`                      |
| Font weight   | `--sv-font-weight-regular` (400), `-medium` (500), `-semibold` (600)         |
| Radius        | `--sv-radius-sm`, `-md`, `-lg`, `-full`                                      |

### Semantic tokens (`src/tokens/semantic.css`)

| Token                       | Light           | Dark            | Role                       |
| --------------------------- | --------------- | --------------- | -------------------------- |
| `--sv-color-surface`        | white           | grey-950        | Default background         |
| `--sv-color-surface-sunken` | grey-50         | grey-900        | Recessed areas             |
| `--sv-color-surface-raised` | white           | grey-900        | Cards, popovers            |
| `--sv-color-text-primary`   | grey-950        | grey-50         | Primary text               |
| `--sv-color-text-muted`     | grey-500        | grey-400        | Secondary text             |
| `--sv-color-text-on-accent` | white           | grey-950        | Text on accent fills       |
| `--sv-color-border`         | grey-200        | grey-800        | Hairline borders           |
| `--sv-color-border-strong`  | grey-300        | grey-700        | Emphasised borders         |
| `--sv-color-accent`         | grey-900        | grey-50         | Brand / interaction colour |
| `--sv-color-accent-hover`   | grey-700        | grey-200        | Accent hover state         |
| `--sv-color-focus-ring`     | grey-900        | grey-100        | Focus outline              |
| `--sv-shadow-card`          | composed shadow | composed shadow | Card elevation             |

## Building a component

1. **Location:** `src/components/<Name>/<Name>.tsx` with a co-located
   `<Name>.module.css` and `<Name>.test.tsx`.
2. **CSS Modules only.** Style with a `.module.css` file; no inline styles, no
   CSS-in-JS, no Tailwind.
3. **Tokens only.** Every colour, space, radius, and font value must be a
   `--sv-*` token reference. No literals (hairline borders and focus-ring widths
   in fixed `px` are the only exception — they are sub-scale control details).
4. **RSC-safe.** Keep components presentational and prop-forwarding. Add
   `'use client'` only when the component genuinely needs hooks or browser state.
5. **Accessibility.** Use the correct element/role, a visible `:focus-visible`
   state, and a `:disabled` treatment. Components must be keyboard-operable.
6. **Export** the component and its prop types from `src/index.ts`.
7. **Test** with Vitest + Testing Library. Component tests start with
   `// @vitest-environment jsdom`. At minimum, assert the component renders and
   exposes its key props.

`Button` is the reference implementation of all of the above.

## Theming

Theming swaps **semantic** token values; components never change.

**Dark mode** ships in `semantic.css` as a `[data-theme='dark']` block. Set the
attribute on a root element to switch:

```html
<html data-theme="dark">
  …
</html>
```

**Tenant theming** (CON-08) works the same way: a tenant overrides semantic
tokens at `:root` (for example, giving Sovereign a brand colour by setting
`--sv-color-accent`). Primitives stay fixed; only the semantic layer is
overridden. Because every component references the semantic layer, a theme is
purely a set of CSS variable values — no component or build changes required.
