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
- [Responsive & mobile](#responsive--mobile)

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
| Icon size     | `--sv-icon-size-sm` (16px), `-md` (20px), `-lg` (24px)                       |

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
| `--sv-color-scrim`          | composed rgba   | composed rgba   | Dialog backdrop overlay    |
| `--sv-shadow-card`          | composed shadow | composed shadow | Card elevation             |
| `--sv-shadow-overlay`       | composed shadow | composed shadow | Dialog / overlay elevation |

### Status colours

A minimal warning (amber) and success (green) palette for banners, badges, and inline validation. Always reference these tokens — never hardcode amber or green hex in a component or plugin.

| Token                        | Light     | Dark      | Role                              |
| ---------------------------- | --------- | --------- | --------------------------------- |
| `--sv-color-warning-surface` | amber-100 | amber-900 | Warning banner / badge background |
| `--sv-color-warning-text`    | amber-800 | amber-200 | Text on warning surface           |
| `--sv-color-warning-border`  | amber-200 | amber-800 | Warning surface border            |
| `--sv-color-success-surface` | green-100 | green-900 | Success banner / badge background |
| `--sv-color-success-text`    | green-800 | green-200 | Text on success surface           |
| `--sv-color-success-border`  | green-200 | green-800 | Success surface border            |

These tokens are backed by `--sv-amber-*` and `--sv-green-*` primitive swatches defined in `primitives.css`. The primitives are fixed across themes; only the semantic mapping changes.

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

## Icon system (RFC 0011)

The design system ships a curated set of **[Lucide](https://lucide.dev)** icons as
inline, RSC-safe SVG components. `lucide` is a build-time devDependency only — the
published `@sovereignfs/ui` package carries zero runtime or peer icon dependencies.

### `<Icon>` component

```tsx
import { Icon } from '@sovereignfs/ui';

// Decorative — described by surrounding text; hidden from screen readers.
<Icon name="house" size="lg" aria-hidden />

// Meaningful — standalone affordance; announced by screen readers.
<Icon name="log-out" size="md" aria-label="Sign out" />
```

**Props:**

| Prop          | Type                   | Default  | Description                                                   |
| ------------- | ---------------------- | -------- | ------------------------------------------------------------- |
| `name`        | `IconName`             | required | Name from the curated icon set                                |
| `size`        | `"sm" \| "md" \| "lg"` | `"md"`   | Binds to `--sv-icon-size-*` tokens (16 / 20 / 24px)           |
| `className`   | `string`               | —        | Additional CSS class on the SVG                               |
| `aria-hidden` | `true`                 | —        | Decorative use — provide one of `aria-hidden` or `aria-label` |
| `aria-label`  | `string`               | —        | Meaningful use — adds `role="img"` automatically              |

**Color** follows `currentColor` — an icon inherits the text color of its container
and recolors with theme changes automatically. No extra CSS required.

### Token binding

Icons use the `--sv-icon-size-*` primitive scale tokens:

| Token               | Value | Use                           |
| ------------------- | ----- | ----------------------------- |
| `--sv-icon-size-sm` | 16px  | Inline with body text         |
| `--sv-icon-size-md` | 20px  | Standard affordance (default) |
| `--sv-icon-size-lg` | 24px  | Prominent / standalone        |

### Curated icon set

The icon list lives in `scripts/icon-list.ts`. To add an icon:

1. Add the Lucide kebab-case name to the list.
2. Run `pnpm generate:icons`.
3. Commit the new file in `packages/ui/src/components/Icon/icons/` alongside the
   updated `index.ts`.

The set is intentionally small — add only icons the platform chrome or plugin
ecosystem actively uses.

**Current icons:** `house`, `settings`, `log-out`, `chevron-right/left/down/up`,
`x`, `check`, `plus`, `trash-2`, `pencil`, `rotate-ccw`, `search`, `user`,
`shield`, `lock`, `eye`, `eye-off`, `mail`, `bell`, `activity`, `package`,
`grid-2x2`, `info`, `alert-triangle`.

### Plugin-identity icons vs UI-affordance icons

There is an explicit split between two kinds of icons:

- **UI-affordance icons** (home, settings, close, …) — use `<Icon name="…">`.
- **Plugin-identity icons** — the author-supplied `icon.svg` in the plugin's root
  directory, wired into the Launcher tile and sidebar via
  `<img src="/plugin-icons/<id>.svg" alt="">`. **Never** injected with
  `dangerouslySetInnerHTML` — SVG from third-party plugins is untrusted markup
  (RFC 0008 §4). The monogram is the fallback when a plugin ships no `icon.svg`.

Plugin icons are copied to `runtime/public/plugin-icons/` by the generate script
at dev startup and build time, served statically at `/plugin-icons/<id>.svg`
without a session gate.

### Lucide license

Lucide is ISC-licensed. The attribution is in `packages/ui/NOTICE`, which ships
with the published package.

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

---

## Responsive & mobile

This section covers the design-system conventions for building mobile-responsive
UI — the breakpoint constant, the `Drawer` primitive, touch-target sizing, safe
areas, and dynamic viewport height. (RFC 0013.)

### Breakpoint convention

Sovereign uses a **single mobile breakpoint: `768px`**.

```css
@media (max-width: 768px) {
  /* mobile styles */
}
```

All shell components (sidebar/header/footer, `Dialog` mobile sheet, `Drawer`)
flip at `768px`. Because CSS custom properties **cannot be used inside `@media`
conditions**, this value is a documented constant rather than a `--sv-*` token —
reference this doc, not a magic number. Per-component custom breakpoints are
rejected in design-system code reviews; a single documented threshold prevents
the 641–768px mismatch band that previously existed between the shell (`768px`)
and the `Dialog` (`640px`).

### Dynamic viewport height

Use `100dvh` (with a `100vh` fallback) instead of `100vh` for full-screen
surfaces. Mobile browser UI (address bar, tab strip) and the virtual keyboard
shrink `100vh`; `dvh` tracks the actual available height:

```css
.fullBleed {
  min-height: 100vh; /* fallback for older engines */
  min-height: 100dvh;
}
```

The shell already uses this convention; follow it in full-screen plugin UI.

### Safe-area insets

In standalone/fullscreen PWA mode, `viewport-fit=cover` extends content into the
notch and home-indicator areas. Apply `env(safe-area-inset-*)` to elements that
would otherwise collide with hardware:

```css
.header {
  padding-top: max(var(--sv-space-3), env(safe-area-inset-top));
}

.footer {
  padding-bottom: max(var(--sv-space-2), env(safe-area-inset-bottom));
}
```

Using `max(...)` means the inset only applies when it is larger than the base
padding — the element keeps its minimum spacing on devices without notches.

### Touch targets — `--sv-touch-target-min`

The primitive token `--sv-touch-target-min: 44px` is the minimum hit-area
dimension for icon-only interactive controls (avatar button, footer actions,
Drawer nav items). 44px matches the Apple HIG / Material Design / WCAG 2.5.5
guideline for reliable tap without precision pointing:

```css
.iconButton {
  min-width: var(--sv-touch-target-min, 44px);
  min-height: var(--sv-touch-target-min, 44px);
}
```

This applies on mobile. Desktop icon-only controls (sidebar icons) can be
smaller because mouse interaction is more precise.

### `Dialog` vs `Drawer`

|                | `Dialog`                                         | `Drawer`                                            |
| -------------- | ------------------------------------------------ | --------------------------------------------------- |
| Position       | Centered on desktop, full-screen sheet on mobile | Always a bottom sheet                               |
| Use when       | Modal: the user must act before continuing       | Navigation or options revealed by tapping a trigger |
| Dismiss        | Esc, scrim click, close button                   | Esc, scrim click                                    |
| Platform usage | Overlay-shell plugins (Console, Account)         | Mobile plugin-navigation (Apps button)              |

The `Drawer` is the right choice for panels the user **slides into**, not dialogs
that **block** a workflow. Both share the same `--sv-color-scrim` and
`--sv-shadow-overlay` tokens and the same focus-trap / Esc / scrim-click
dismissal convention.

### `Drawer` component

```tsx
import { Drawer } from '@sovereignfs/ui';

<Drawer open={open} onClose={() => setOpen(false)} aria-label="App navigation">
  {/* any content — lists, grids, etc. */}
</Drawer>;
```

The `Drawer` panel sizes to its content (capped at `80dvh`), is safe-area-aware
on the bottom (`env(safe-area-inset-bottom)` padding), and is focus-trapped.
The scrim covers the full viewport so it works in any shell context.

### `--sv-dialog-inset-top`

Mirrors `--sv-dialog-inset-left` on the vertical axis. The runtime shell sets it
to the mobile header height (`--sv-shell-header-height`) so an open `Dialog` or
overlay-sheet begins **below** the sticky header — the header stays visible and
interactive. Defaults to `0` (full-viewport scrim) for standalone use:

```css
/* Shell sets this on mobile: */
.shell {
  --sv-dialog-inset-top: var(--sv-shell-header-height);
}
```

Plugin code does not need to set this; it is a platform-level concern wired by
the shell.
