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
- **DS-first: plugins are consumers.** Reusable UI/UX capability — interaction
  hooks, overlay surfaces, secondary headers, motion, controls (pickers,
  calendars) — ships from `@sovereignfs/ui`, or from the runtime shell when it
  is shell chrome. It is never implemented plugin-locally: when a gap or defect
  is discovered while working in a plugin, the fix is designed as a
  design-system addition that the plugin then consumes — not built in the
  plugin "to be promoted later". Plugin repositories keep only consumption
  code and genuinely plugin-specific logic.

## Token architecture

Two tiers, all prefixed `--sv-*` (short, tied to the `sv` CLI identity; never
abbreviated after the prefix):

```
primitives.css   raw, context-free scales — the palette, spacing, type, radii
  --sv-grey-50 … --sv-grey-950 · --sv-blue-* · --sv-space-1 … --sv-space-16
  --sv-font-size-label/xs/caption/sm … --sv-font-size-2xl · --sv-font-weight-bold
  --sv-radius-sm/md/lg/xl/2xl/3xl/full
        │  mapped by
        ▼
semantic.css     contextual roles — what components and plugins reference
  --sv-color-surface · --sv-color-text-primary · --sv-color-border
  --sv-color-accent · --sv-color-info-* · --sv-shadow-card/hover/popover …
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

| Group         | Tokens                                                                                                                                |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Palette       | `--sv-white`, `--sv-black`, `--sv-grey-50` … `--sv-grey-950`                                                                          |
| Status/info   | `--sv-red-*`, `--sv-amber-*`, `--sv-green-*`, `--sv-blue-*` — see semantic layer for use                                              |
| Spacing (4px) | `--sv-space-1` (4px) … `--sv-space-16` (64px) — steps 1,2,3,4,5,6,8,10,12,16                                                          |
| Font family   | `--sv-font-family` (Hanken Grotesk → system-ui), `--sv-font-family-mono` (JetBrains Mono → ui-monospace)                              |
| Font size     | `--sv-font-size-label` (11px), `-xs` (12px), `-caption` (13px), `-sm` (14px), `-md` (16px), `-lg` (18px), `-xl` (20px), `-2xl` (24px) |
| Font weight   | `--sv-font-weight-regular` (400), `-medium` (500), `-semibold` (600), `-bold` (700)                                                   |
| Radius        | `--sv-radius-sm` (6px), `-md` (8px), `-lg` (11px), `-xl` (12px), `-2xl` (14px), `-3xl` (20px), `-full`                                |
| Icon size     | `--sv-icon-size-xs` (12px), `-sm` (16px), `-md` (20px), `-lg` (24px)                                                                  |

**Font families:** `--sv-font-family` names Hanken Grotesk as the preferred body font
with a full system-font fallback stack; `--sv-font-family-mono` names JetBrains Mono.
The web fonts are **not loaded by the design system** — operators must supply a `<link>`
or `@font-face` via their instance CSS. The system fallback applies automatically when
the fonts are absent.

**Typography hierarchy — chrome vs. content:** the persistent app chrome (the
instance brand name in the sidebar / mobile header) and a page or overlay's
own `<h1>` deliberately sit on different steps of the type scale. This is a
design decision, not an oversight — don't "fix" it by making them match.

| Element                              | Token                       | Why                                                                               |
| ------------------------------------ | --------------------------- | --------------------------------------------------------------------------------- |
| Brand name (sidebar / mobile header) | `--sv-font-size-md` (16px)  | Wayfinding, not content — present and recognisable, never competing for attention |
| Page / overlay title (`<h1>`)        | `--sv-font-size-2xl` (24px) | The primary thing on the screen — carries the strongest visual weight             |

Persistent chrome should never be the largest text on a page. If a change
makes the brand name the same size as (or larger than) a page title, that's a
hierarchy regression, not a fix.

**Radius scale guidance:**

| Token              | Value  | Use                               |
| ------------------ | ------ | --------------------------------- |
| `--sv-radius-sm`   | 6px    | badge, tag                        |
| `--sv-radius-md`   | 8px    | button, input                     |
| `--sv-radius-lg`   | 11px   | sidebar icon, small card          |
| `--sv-radius-xl`   | 12px   | card, panel                       |
| `--sv-radius-2xl`  | 14px   | popover                           |
| `--sv-radius-3xl`  | 20px   | bottom sheet (Drawer top corners) |
| `--sv-radius-full` | 9999px | pill, avatar                      |

### Semantic tokens (`src/tokens/semantic.css`)

| Token                       | Light                  | Dark                   | Role                                                                      |
| --------------------------- | ---------------------- | ---------------------- | ------------------------------------------------------------------------- |
| `--sv-color-surface`        | white                  | grey-950               | Default background                                                        |
| `--sv-color-surface-sunken` | grey-50                | grey-900               | Recessed areas                                                            |
| `--sv-color-surface-raised` | white                  | grey-900               | Cards, popovers                                                           |
| `--sv-color-text-primary`   | grey-950               | grey-50                | Primary text                                                              |
| `--sv-color-text-muted`     | grey-500               | grey-400               | Secondary text                                                            |
| `--sv-color-text-subtle`    | grey-400               | grey-600               | Tertiary / de-emphasised text                                             |
| `--sv-color-text-on-accent` | white                  | grey-950               | Text on accent fills                                                      |
| `--sv-color-border`         | grey-200               | grey-800               | Hairline borders                                                          |
| `--sv-color-border-strong`  | grey-300               | grey-700               | Emphasised borders                                                        |
| `--sv-color-accent`         | grey-900               | grey-50                | Brand / interaction colour                                                |
| `--sv-color-accent-hover`   | grey-700               | grey-200               | Accent hover state                                                        |
| `--sv-color-accent-subtle`  | color-mix (accent 12%) | color-mix (accent 12%) | Tinted background paired with `--sv-color-accent` text, e.g. badges/chips |
| `--sv-color-focus-ring`     | grey-900               | grey-100               | Focus outline                                                             |
| `--sv-color-scrim`          | composed rgba          | composed rgba          | Dialog backdrop overlay                                                   |
| `--sv-shadow-card`          | composed shadow        | composed shadow        | Card elevation                                                            |
| `--sv-shadow-hover`         | composed shadow        | composed shadow        | Card hover lift (e1)                                                      |
| `--sv-shadow-popover`       | composed shadow        | composed shadow        | Floating panels (e2)                                                      |
| `--sv-shadow-overlay`       | composed shadow        | composed shadow        | Dialog / overlay elevation                                                |
| `--sv-shadow-control`       | composed shadow        | composed shadow        | Small interactive-control shadows, e.g. Toggle thumb                      |

### Status colours

A minimal error (red), warning (amber), and success (green) palette for banners, badges, and inline validation. Always reference these tokens — never hardcode colour hex in a component or plugin.

| Token                        | Light     | Dark      | Role                              |
| ---------------------------- | --------- | --------- | --------------------------------- |
| `--sv-color-error-surface`   | red-100   | red-900   | Error banner / badge background   |
| `--sv-color-error-text`      | red-800   | red-200   | Text on error surface             |
| `--sv-color-error-border`    | red-200   | red-700   | Error surface border              |
| `--sv-color-warning-surface` | amber-100 | amber-900 | Warning banner / badge background |
| `--sv-color-warning-text`    | amber-800 | amber-200 | Text on warning surface           |
| `--sv-color-warning-border`  | amber-200 | amber-800 | Warning surface border            |
| `--sv-color-success-surface` | green-100 | green-900 | Success banner / badge background |
| `--sv-color-success-text`    | green-800 | green-200 | Text on success surface           |
| `--sv-color-success-border`  | green-200 | green-800 | Success surface border            |
| `--sv-color-info-surface`    | blue-100  | blue-900  | Info banner / badge background    |
| `--sv-color-info-text`       | blue-800  | blue-100  | Text on info surface              |
| `--sv-color-info-border`     | blue-200  | blue-800  | Info surface border               |

These tokens are backed by `--sv-red-*`, `--sv-amber-*`, `--sv-green-*`, and `--sv-blue-*` primitive swatches defined in `primitives.css`. The primitives are fixed across themes; only the semantic mapping changes.

**WCAG 2.1 AA contrast commitment:** every status colour pair satisfies the minimum contrast requirements — 4.5:1 for text (≥18px bold or ≥24px regular), 3:1 for UI components and graphical objects. Test with the `--sv-color-*-text` token over its matching `--sv-color-*-surface`.

### Accessibility

#### Focus visible

Every interactive component in `@sovereignfs/ui` exposes a `:focus-visible` outline referencing `--sv-color-focus-ring`. Third-party plugins must do the same — never suppress the focus ring with `outline: none` without providing an equivalent visible indicator.

```css
/* Reference implementation (used in Button, Input, etc.): */
:focus-visible {
  outline: 2px solid var(--sv-color-focus-ring);
  outline-offset: 2px;
}
```

#### Reduced motion

Animated components honour `prefers-reduced-motion: reduce`. The `OfflineBanner` slide-in animation is suppressed when the user has requested reduced motion. Any new animated component must follow the same pattern:

```css
@media (prefers-reduced-motion: reduce) {
  .myComponent {
    animation: none;
    transition: none;
  }
}
```

#### Per-component a11y contract

| Component      | Role / element                    | Keyboard                                                                            | ARIA                                                                                                   | Focus order                               |
| -------------- | --------------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ----------------------------------------- |
| `Button`       | `<button>`                        | Enter / Space activate                                                              | `disabled` attribute                                                                                   | Natural                                   |
| `Input`        | `<input>`                         | Standard field editing                                                              | `type`, `required`, `aria-invalid` via parent                                                          | Natural; label via `htmlFor`+`id`         |
| `Textarea`     | `<textarea>`                      | Standard field editing                                                              | `required`, `aria-invalid` via parent                                                                  | Natural; label via `htmlFor`+`id`         |
| `CodeTextarea` | `<textarea>`                      | Standard field editing; preserves whitespace                                        | `required`, `aria-invalid` via parent                                                                  | Natural; label via `htmlFor`+`id`         |
| `TagInput`     | `<input>` + chip buttons          | Enter/comma add; Backspace removes last chip when empty; chip buttons remove values | `aria-describedby`/`aria-invalid` forwarded to the inner input; validation messages use `role="alert"` | Natural through input and chip buttons    |
| `StatusBadge`  | `<span>`                          | N/A                                                                                 | Optional `aria-label` for abbreviated visible labels                                                   | N/A                                       |
| `SplitPane`    | `<section>` panes + resize button | Drag resize button; ArrowLeft/ArrowRight resize; Home/End min/max                   | Pane labels; resize button label includes the current primary-pane percentage                          | Resize button participates when resizable |
| `FormField`    | `<label>` + `<div>` wrapper       | N/A (delegates to its `children` control)                                           | Generates `id`/`aria-describedby`/`aria-invalid`, passed to the control via the render-prop `children` | Natural                                   |
| `Dialog`       | `role="dialog"`                   | Esc close, Tab/Shift-Tab trap                                                       | `aria-modal="true"`, `aria-label` required                                                             | First focusable on open; restore on close |
| `Drawer`       | `role="dialog"`                   | Esc close, Tab/Shift-Tab trap                                                       | `aria-modal="true"`, `aria-label` required                                                             | First focusable on open; restore on close |
| `Icon`         | SVG                               | Not focusable                                                                       | `aria-hidden` (decorative) or `aria-label`+`role="img"` (meaningful)                                   | N/A                                       |

**Label association:** prefer `FormField` — it generates the `id` (via `useId()` if none is given) and passes `{ id, 'aria-describedby', 'aria-invalid', required }` to the control through its render-prop `children`, so the label, hint, and error stay correctly wired without any manual `htmlFor` bookkeeping:

```tsx
<FormField label="Email" hint="We'll never share this.">
  {(field) => <Input {...field} type="email" />}
</FormField>
```

For a bare control outside `FormField` (e.g. `Input` used standalone), pair it with an explicit `htmlFor` on the label — `jsx-a11y` cannot trace through the custom wrapper to verify implicit association:

```tsx
<label htmlFor="user-email">
  Email
  <Input id="user-email" type="email" />
</label>
```

## Building a component

1. **Location:** `src/components/<Name>/<Name>.tsx` with a co-located
   `<Name>.module.css` and `<Name>.test.tsx`.
2. **CSS Modules only.** Style with a `.module.css` file; no inline styles, no
   CSS-in-JS, no Tailwind.
3. **Tokens only.** Every colour, space, and radius value must be a `--sv-*`
   token reference. `pnpm design:tokens:check` (below) enforces this in CI.
   Documented exceptions — fixed `px` values that are legitimately below the
   scale or describe a control's own geometry, not a design value:
   - hairline borders (`border: 1px solid …`) and focus-ring widths/offsets
     (`outline-width`, `outline-offset`);
   - fixed affordance dimensions (checkbox/toggle/avatar/icon sizes, e.g.
     `width: 18px` for a toggle thumb);
   - alignment micro-adjustments (`left: 2px`, `margin-top: -1px`) that
     position a control detail relative to its own border;
   - animation transform distances (`translateX(16px)`) computed from the
     component's own fixed dimensions, not a design token.

   Anything else — a colour, a spacing gap, a border-radius — must be a
   token. `pnpm design:tokens:check` also fails on hardcoded hex/`rgb()`
   colour literals in `packages/ui/src/components`.

4. **RSC-safe.** Keep components presentational and prop-forwarding. Add
   `'use client'` only when the component genuinely needs hooks or browser state.
5. **Accessibility.** Use the correct element/role, a visible `:focus-visible`
   state, and a `:disabled` treatment. Components must be keyboard-operable.
6. **Export** the component and its prop types from `src/index.ts`.
7. **Test** with Vitest + Testing Library. Component tests start with
   `// @vitest-environment jsdom`. At minimum, assert the component renders and
   exposes its key props.

`Button` is the reference implementation of all of the above.

### Token validation

`pnpm design:tokens:check` (`scripts/design-tokens-check.ts`) scans every
`var(--sv-...)` reference in `packages/ui/src`, `runtime/app`, and
`plugins/*/app` and fails if it doesn't resolve to a token actually defined in
`packages/ui/src/tokens/{primitives,semantic}.css` (plus the runtime-shell
layout namespace — `--sv-shell-*` / `--sv-dialog-inset-*` — defined in
`runtime/app/globals.css` and `shell.module.css`; see
[`--sv-dialog-inset-top`](#--sv-dialog-inset-top) below). It also fails on
hardcoded hex/`rgb()`/`rgba()` colour literals inside
`packages/ui/src/components`, since third-party plugins inherit whatever
ships there. Runs in CI (`design-tokens` job) after typecheck, and as part of
`pnpm verify:push` (the pre-push hook).

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

| Prop          | Type                           | Default  | Description                                                   |
| ------------- | ------------------------------ | -------- | ------------------------------------------------------------- |
| `name`        | `IconName`                     | required | Name from the curated icon set                                |
| `size`        | `"xs" \| "sm" \| "md" \| "lg"` | `"md"`   | Binds to `--sv-icon-size-*` tokens (12 / 16 / 20 / 24px)      |
| `className`   | `string`                       | —        | Additional CSS class on the SVG                               |
| `aria-hidden` | `true`                         | —        | Decorative use — provide one of `aria-hidden` or `aria-label` |
| `aria-label`  | `string`                       | —        | Meaningful use — adds `role="img"` automatically              |

**Color** follows `currentColor` — an icon inherits the text color of its container
and recolors with theme changes automatically. No extra CSS required.

### Token binding

Icons use the `--sv-icon-size-*` primitive scale tokens:

| Token               | Value | Use                                     |
| ------------------- | ----- | --------------------------------------- |
| `--sv-icon-size-xs` | 12px  | Inline metadata (e.g. a due-date badge) |
| `--sv-icon-size-sm` | 16px  | Inline with body text                   |
| `--sv-icon-size-md` | 20px  | Standard affordance (default)           |
| `--sv-icon-size-lg` | 24px  | Prominent / standalone                  |

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
`grid-2x2`, `info`, `alert-triangle`, `calendar`, `sliders-horizontal`,
`ellipsis-vertical`.

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

## Instance identity tokens (RFC 0027 / RFC 0032)

The `--sv-instance-*` namespace is a separate tier from `--sv-color-*`. Instance
tokens hold **URLs** (logo and favicon paths), not colours. They are set once
by the operator at deploy time or via Console → Settings → Instance identity — they do
not change with dark mode or user preferences.

```css
:root {
  --sv-instance-logo: none; /* URL of the light-theme logo */
  --sv-instance-logo-dark: none; /* URL of the dark-theme logo (falls back to --sv-instance-logo) */
  --sv-instance-favicon: none; /* URL of the favicon */
}
```

`InstanceProvider` (a runtime server component) sets these at `:root` from the
`instance_config` table, merged over `INSTANCE_*` env-var defaults. Plugins
running inside the shell receive the values automatically — no import required.

### Why a separate namespace?

| Property    | `--sv-color-*`        | `--sv-instance-*` |
| ----------- | --------------------- | ----------------- |
| Value type  | Colour (`#hex`, HSL)  | URL (`url(…)`)    |
| Changes on  | Dark mode, user prefs | Operator deploy   |
| Theming use | Dynamic swap          | Static identity   |

Mixing URL values into the colour namespace would conflate two concerns and
confuse plugin developers — a colour picker returns `#hex`, not a `url()`.

### Using instance tokens in plugin CSS

```css
/* In your plugin's CSS module */
.logo {
  background-image: var(--sv-instance-logo);
  background-size: contain;
  width: 36px;
  height: 36px;
}
```

> **Note:** `--sv-instance-logo` is a CSS `url()` value, so it works in
> `background-image` but not in `src` attributes directly. Use the API routes
> (`/api/instance/logo`, `/api/instance/favicon`) in HTML `<img>` tags, or use
> `sdk.platform.getConfig()` which returns `instanceName` as a string prop.

### Instance name

**The instance name is a React prop, not a CSS custom property.** CSS custom
properties cannot supply rendered text content for HTML elements — they only
work with `content:` on pseudo-elements, which is too narrow for the shell
chrome. `InstanceProvider` passes `instanceName` as a render-prop to the layout.

Plugin developers read it from `sdk.platform.getConfig()`:

```ts
const config = await sdk.platform.getConfig();
// config.instanceName — the operator-configured display name
// config.instancePrimaryColor — validated hex or undefined
```

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

### Interaction hooks

Touch gesture handling is deceptively easy to get wrong — a naive long-press
timer or a hand-rolled `matchMedia` check reliably misfires in ways that read
as "the app feels janky." These hooks carry the fixes so no plugin has to
rediscover them. Per the DS-first principle (see "Design principles" above),
build touch gesture handling here, not in a plugin.

```tsx
import {
  useLongPress,
  useDoubleTapHandler,
  useSingleOrDoubleTap,
  useIsMobile,
} from '@sovereignfs/ui';
```

**`useLongPress({ onLongPress, delay?, moveTolerance?, suppressClickMs?, vibrate?, disabled? })`**
Returns a props object to spread onto the target element
(`onPointerDown`/`onPointerMove`/`onPointerUp`/`onPointerCancel`/`onPointerLeave`/
`onContextMenu`/`onClick`/`style`). Handles the failure modes a bare
`setTimeout` misses:

- **Movement tolerance** (`moveTolerance`, default 10px): a real finger jitters
  a few px even holding still — cancelling on _any_ movement makes the gesture
  misfire constantly.
- **`pointercancel`**, not just `pointerup`/`pointermove`/`pointerleave`: when
  the browser converts the touch into a scroll, the timer is cleared instead
  of firing mid-scroll.
- **OS callout suppression**: `onContextMenu` preempts Android's link/image
  context menu; the returned `style` sets `-webkit-touch-callout: none` (iOS
  link-preview), `user-select: none`, and `touch-action: manipulation` — but
  only when the device's primary pointer is coarse (`(pointer: coarse)`), so
  desktop mouse text-selection is never disabled by a hook that only matters
  for touch.
- **Time-boxed click suppression** (`suppressClickMs`, default 700ms): the
  click that may or may not follow a fired long-press is swallowed for a
  bounded window, not indefinitely — iOS often sends no click at all after a
  long hold, so a flag that only clears "on the next click" stays armed and
  silently eats the user's next unrelated tap.

```tsx
function Row({ onSelect }: { onSelect: () => void }) {
  const longPress = useLongPress({ onLongPress: onSelect });
  return <div {...longPress}>Hold to select</div>;
}
```

**`useDoubleTapHandler(onDoubleTap)`** / **`useSingleOrDoubleTap(onSingle, onDouble)`**
Desktop double-clicks report `e.detail === 2` natively; touch has no
equivalent signal, so double-tap is detected by timing two taps within 350ms.
Use `useDoubleTapHandler` when the single tap has no default action to cancel
(e.g. a colour swatch). Use `useSingleOrDoubleTap` when it does (e.g.
navigation) — it defers the single action by the double-tap window so a
following second tap can still preempt it; this means every single tap through
it incurs that latency, so reach for it only where the preemption is genuinely
needed.

**`useIsMobile(breakpointPx?)`** and **`MOBILE_BREAKPOINT_PX` (768)**
SSR-safe viewport check — defaults to `false` (desktop) until the client mounts
and reads the real viewport, matching every other SSR-safe hook in this
system. Defaults to the platform's single documented breakpoint (768px, see
above); pass a different value only when a layout genuinely needs its own
threshold.

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

---

## Component stories (Storybook)

Every `@sovereignfs/ui` component has a Storybook story. The Storybook instance
is the living design reference for component authors, plugin developers, and
designers — each component is rendered in isolation with every meaningful
variant, both light and dark themes, and responsive viewports.

**Hosted:** [sovereignfs.github.io/storybook](https://sovereignfs.github.io/storybook/)
— deployed by pushing a `sb-v*` tag (e.g. `git tag sb-v0.11.0 && git push origin sb-v0.11.0`),
via `.github/workflows/storybook-deploy.yml`.
The built static site is published to
[`sovereignfs/storybook`](https://github.com/sovereignfs/storybook); source
stories live in this repository. See [Sovereign repositories](repositories.md)
for the full support-repository map.

### Running locally

```bash
# From the monorepo root:
pnpm storybook        # starts dev server at http://localhost:6006

# Or directly from the package:
pnpm --filter @sovereignfs/ui storybook
```

The dev server hot-reloads on source changes to both components and CSS tokens.

### Story organisation

Stories live under two roots inside `packages/ui/src/`:

| Root                 | Purpose                                                                |
| -------------------- | ---------------------------------------------------------------------- |
| `stories/`           | Cross-cutting reference docs: Overview, Token Gallery, Mobile Patterns |
| `components/<Name>/` | Per-component story file co-located with the component                 |

### What's covered

#### Overview & reference (`src/stories/`)

| Story file                         | What it documents                                                                                                                                                                                                                   |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DesignSystemOverview.stories.tsx` | Full component gallery with live demos and import lines; colour palette; type scale; shadow scale; design rules                                                                                                                     |
| `TokenGallery.stories.tsx`         | Live gallery of every `--sv-*` token tier — colours, space, typography, radius, icon sizes, shadows — read from computed styles                                                                                                     |
| `MobilePatterns.stories.tsx`       | Mobile layout reference: breakpoints (640/768 px), constrained column, auto-adapting components, shell chrome anatomy (header/footer/drawer/search overlay), touch targets, safe-area insets, typography scale, readiness checklist |

#### Components (`src/components/<Name>/`)

| Story file                     | Key variants and notes                                                                                                                                          |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Avatar.stories.tsx`           | Initials fallback; image src; sm/md/lg sizes                                                                                                                    |
| `Badge.stories.tsx`            | All status variants; subtle vs filled                                                                                                                           |
| `Button.stories.tsx`           | All `variant` × `size` combinations; disabled; icon-leading; icon-only; `AllVariants` grid                                                                      |
| `Card.stories.tsx`             | sm/md/lg padding; interactive hover; semantic element variants                                                                                                  |
| `CodeTextarea.stories.tsx`     | Default; `FormField` integration; error; disabled; long content; mobile viewport                                                                                |
| `Dialog.stories.tsx`           | sm/md/lg/full sizes; closed state; `play` function opens and asserts visibility                                                                                 |
| `Drawer.stories.tsx`           | Mobile viewport default; closed; `play` function opens and asserts panel visible                                                                                |
| `EmptyState.stories.tsx`       | Heading only; with icon; with action                                                                                                                            |
| `FormField.stories.tsx`        | Default; with hint; with error (role="alert"); render-prop `children` wires field props (`id`, `aria-describedby`, `aria-invalid`, `required`) onto the control |
| `Icon.stories.tsx`             | Decorative vs meaningful a11y variants; all three sizes; `AllIcons` full grid                                                                                   |
| `Input.stories.tsx`            | Text/email/password; disabled; error state with `aria-invalid`                                                                                                  |
| `NavTabs.stories.tsx`          | Default; active tab; mobile horizontal-scroll viewport                                                                                                          |
| `PageHeader.stories.tsx`       | Title only; with description; with action slot                                                                                                                  |
| `Popover.stories.tsx`          | Four placements; trigger + content                                                                                                                              |
| `SegmentedControl.stories.tsx` | Two and three options; controlled selection                                                                                                                     |
| `Select.stories.tsx`           | Default; disabled; with placeholder                                                                                                                             |
| `Spinner.stories.tsx`          | sm/md/lg sizes; reduced-motion note                                                                                                                             |
| `SplitPane.stories.tsx`        | Resizable editor/preview; fixed panes; keyboard resizing; long content; mobile single-column fallback                                                           |
| `StatusBadge.stories.tsx`      | All editor status states; accessible abbreviated label; long content; mobile wrapping                                                                           |
| `SystemBanner.stories.tsx`     | All four categories (info/success/warning/error); dismissible                                                                                                   |
| `Tabs.stories.tsx`             | Controlled tabs; default selected; keyboard navigation                                                                                                          |
| `TagInput.stories.tsx`         | Controlled tags; `FormField` integration; error; disabled; keyboard behavior; long content; mobile viewport                                                     |
| `Textarea.stories.tsx`         | Default; with value; custom `rows`; disabled                                                                                                                    |
| `Toast.stories.tsx`            | All six categories triggered imperatively via `useToast`                                                                                                        |
| `Toggle.stories.tsx`           | On/off; disabled; label association                                                                                                                             |
| `Tooltip.stories.tsx`          | Four placement variants; hover and focus triggers                                                                                                               |

### Themes toolbar

The **Themes** toolbar addon (top-right in the canvas) toggles `data-theme="dark"` on
the canvas root. Since all component styles reference semantic tokens, switching
themes re-renders correctly without touching any component code.

### A11y panel

Every story runs `@storybook/addon-a11y` automatically. The **Accessibility** panel
(bottom of the canvas) reports WCAG 2.1 violations. Violations are treated as build
errors in CI — `storybook build` fails if any story has an a11y issue.

### Adding a story for a new component

1. Create `packages/ui/src/components/<Name>/<Name>.stories.tsx`.
2. Use `satisfies Meta<typeof YourComponent>` (not `Meta<typeof YourComponent>` alone)
   so TypeScript infers arg types.
3. Add the component to the **Component Gallery** section of
   `DesignSystemOverview.stories.tsx` — both the import and a `<ComponentCard>` entry.
4. Always pair `<Input>` and similar bare elements with a `<label>` in stories — the
   a11y addon flags unlabelled controls as errors.
5. Use `aria-hidden` for decorative icons and `aria-label` for meaningful ones.
6. Run `pnpm storybook` locally and confirm the a11y panel shows no violations.
7. Run `pnpm --filter @sovereignfs/ui typecheck` to confirm the stories are type-correct.

### Building and deploying

```bash
pnpm build-storybook          # static output → packages/ui/storybook-static/
pnpm --filter @sovereignfs/ui build-storybook  # same, scoped
```

**CI (`storybook-build` job):** runs `build-storybook` on every non-draft PR and
uploads the static output as a workflow artifact (7-day retention) — download
`storybook-static` from the Actions run to review the PR's stories without a live
hosting service.

**Hosted deploy (`.github/workflows/storybook-deploy.yml`):** pushes the static
build to the `gh-pages` branch of `sovereignfs/storybook`. Triggered by pushing a
`sb-v*` tag — the tag does not need to match a package version, just mark the point
you want live. Can also be triggered manually via **Actions → Deploy Storybook →
Run workflow**.

```bash
git tag sb-v0.11.0
git push origin sb-v0.11.0
```
