# Sovereign Design System — specification

|            |                                  |
| ---------- | -------------------------------- |
| **Status** | Draft                            |
| **Covers** | `packages/ui`, `@sovereignfs/ui` |

This document is the single source of truth for what the design system promises. Where code, another document or an issue
disagrees with it, this document wins until it is changed.

[`docs/design-system.md`](../design-system.md) is the guide: how to use and build with it. This document says only what is
binding. A component's props are defined by its TypeScript types and shown in Storybook, and are not repeated here.

The key words **MUST**, **MUST NOT**, **SHOULD**, **SHOULD NOT** and **MAY** are used as described in RFC 2119.

---

## 1. What it is

`@sovereignfs/ui` is the design tokens and React components shared by core's own pages and by any app, Sovereign's or not.
It is the one package this repository publishes for others to depend on, so a change to it is a change to their apps.

## 2. The public surface

These, and nothing else, are the public surface:

- every name exported from the package's root (`packages/ui/src/index.ts`), components, hooks, constants and types alike;
- the stylesheets `@sovereignfs/ui/tokens.css`, `/tokens/primitives.css`, `/tokens/semantic.css` and
  `/tokens/theme-presets.css`;
- every `--sv-*` token defined in those stylesheets;
- the attributes an app sets to choose a theme: `data-theme`, `data-text-size` and `data-theme-preset`.

An app MUST NOT rely on anything else: a deep import, a CSS Modules class name, or a component's internal DOM. Those MAY change
in any release, except where a component's accessibility depends on them (§6.2).

## 3. Stability

Every export is in one of two tiers.

**Stable.** Exactly these:

- components: `Button`, `Card`, `FormField`, `Icon`, `Input`, `StatusBadge`;
- hooks: `useCommitOnEnterOrBlur`, `useDoubleTapHandler`, `useIsMobile`, `useIsOffline`, `useLongPress`;
- the constant `MOBILE_BREAKPOINT_PX`;
- each of these exports' own types;
- every token, of both tiers (§5).

**Experimental.** Everything else. An export is experimental unless it is listed above, so a new one starts here. It MAY be used,
and works, but it carries less of a promise (§4), and it MAY be removed.

An export becomes stable by being added to the list in a task of its own, once it has been checked against §6 and §7 and used by
at least one app or by core. Taking one off the list is a breaking change.

## 4. Versioning

The package follows semver, with the version in `packages/ui/package.json` and its own `ui-vX.Y.Z` tag
([`docs/releasing.md`](../releasing.md)).

| Change                                  | While `0.x`                  | From `1.0.0`                 |
| --------------------------------------- | ---------------------------- | ---------------------------- |
| A fix that breaks nothing               | Patch                        | Patch                        |
| Something added                         | Minor                        | Minor                        |
| Breaking something stable, or any token | Minor, with a migration note | Major, with a migration note |
| Breaking something experimental         | Minor, with a migration note | Minor, with a migration note |

A patch MUST NOT break anything, in any tier. A migration note goes in [`docs/upgrade.md`](../upgrade.md), and says what changed
and what an app must do.

These are breaking:

- removing or renaming an export, a token or a stylesheet;
- removing a prop, or a value of one, or changing a default;
- adding a required prop;
- requiring a provider that was not required before (§6.3);
- raising a peer dependency's minimum, or adding a required one;
- changing a token so that a page built to it looks wrong, such as giving it a different kind of value;
- removing a keyboard interaction, role or label a person relies on (§6.2).

## 5. Tokens

- A token's name MUST begin `--sv-`, and MUST NOT be abbreviated after that.
- There are two tiers: **primitives**, the raw scales, and **semantic** tokens, the roles built on them. Theming overrides the
  semantic tier, and MUST NOT override a primitive colour.
- Components, and pages built on them, MUST use semantic colour tokens, and MUST NOT use a primitive colour or a colour literal.
- The scale tokens (`--sv-space-*`, `--sv-radius-*`, `--sv-font-size-*`) have no semantic tier and MUST be used directly.
- `--sv-radius-scale` and `--sv-text-size-scale` are set at `:root` only, and MUST NOT be read by a component.
- A colour, a space or a radius in a component MUST be a token. The only exceptions are the fixed geometry of a control itself:
  hairline borders and focus rings, a control's own dimensions, and alignment inside it.
- `--sv-instance-*` tokens hold addresses, not colours. They are set by the instance and do not change with the theme.
- Every token MUST work in both the light and dark themes. Dark mode MUST need no change to a component.

Every token is covered by §4 as if stable, because an app can reference any of them.

## 6. Components

### 6.1 How they are built

- A component MUST be React, styled with CSS Modules. Tailwind, runtime CSS-in-JS and third-party component frameworks MUST NOT
  be used.
- A component MUST work in a Server Component unless it needs state or a browser API, in which case it says `'use client'`.
- A client component MUST NOT read a browser global in a `useState` initializer or in render.
- A component MUST NOT fetch anything, or depend on an asset at a path of the app's.
- There is one mobile breakpoint, `768px`, `MOBILE_BREAKPOINT_PX`. A component MUST NOT use another.

### 6.2 What every component does

- **Keyboard.** Everything that can be done with a pointer MUST be possible with a keyboard.
- **Focus.** Every interactive element MUST show `:focus-visible` with `--sv-color-focus-ring`.
- **Semantics.** It MUST use the right element or role, and a control MUST be able to carry a label. A modal overlay (`Dialog`,
  `Drawer`, `Sheet`, `ConfirmDialog`) MUST move focus into itself on opening, trap it, and return it on closing. A non-modal one
  (`Popover`, and what is built on it) takes no focus and traps none, and closes on Escape.
- **Motion.** Animation MUST stop under `prefers-reduced-motion: reduce`.
- **Touch.** An icon-only control MUST offer a target of at least `--sv-touch-target-min` on mobile, and a hover style MUST sit
  behind `@media (hover: hover)`.
- **Themes.** It MUST be right in both themes.
- **Disabled.** A control that can be disabled MUST look it and MUST NOT act.

### 6.3 What using one needs

- A component MUST work with nothing mounted above it, and with only `tokens.css` loaded. The one exception is `useToast`, which
  needs a `ToastProvider`.
- No other provider may be added without a breaking change (§4).
- Context a component shares with its own parts is not a provider, and an app MUST NOT need to know of it.

### 6.4 What ships with one

Every component MUST have a story, and tests of what it does. Every component and token MUST appear in Storybook's galleries.

## 7. Dependencies

- The package MUST have no runtime `dependencies`.
- It MUST depend on no other Sovereign package, on no framework such as Next.js, and MUST work in any React app.
- Its peer dependencies are `react` and `react-dom` at version 19. Anything else MUST be an optional peer, needed only by the
  components that use it, as `@dnd-kit` is for reordering.
- It ships its own typeface and icons, and MUST NOT request anything from another site. Icon data is in the bundle.

## 8. What belongs here

Reusable UI goes here first, whoever needs it: controls, overlays, interaction hooks, motion. It MUST NOT be built in core or an
app to be moved here later. Core and apps keep what is specific to them, composed of these parts.

A component that makes sense for only one app does not belong here. A new export SHOULD be general enough that a second app
could use it unchanged.

## 9. How this is held

| Rule                                                                                                           | Held by                                            |
| -------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| Tokens resolve, and no colour literals                                                                         | `pnpm design:tokens:check`                         |
| What a tarball holds, and its entry points                                                                     | `pnpm packages:check`                              |
| The stable list exists; providers, dependencies and imports (§3, §6.3, §7)                                     | `scripts/__tests__/design-system-spec.test.ts`     |
| One breakpoint (§6.1)                                                                                          | `scripts/__tests__/design-system-audit.test.ts`    |
| Focus rings, reduced motion, hover behind `(hover: hover)`, a story and tests for every component (§6.2, §6.4) | `scripts/__tests__/design-system-audit.test.ts`    |
| A modal overlay takes focus and returns it (§6.2)                                                              | `packages/ui/src/__tests__/overlay-focus.test.tsx` |
| Accessibility of what stories show                                                                             | Storybook's a11y checks                            |
| Stories bundle                                                                                                 | `pnpm build-storybook`, in CI                      |
| Versioning (§4), §5's rules on use, and §6                                                                     | Review                                             |

A rule held only by review is still a rule. It SHOULD gain a check when one is practical.

## 10. Where the package falls short

Nothing the checks in §9 can read from the files. The audit test fails for a new component that has no story or tests, shows no
focus ring, animates without a reduced-motion rule, puts a hover outside `@media (hover: hover)`, or uses another breakpoint; and
it fails for a gap that has been closed but is still listed. One exception is written there with its reason: `ButtonLink` draws
with `Button`'s own stylesheet, which shows the focus ring.

What the files cannot show is held by review (§9): that a keyboard can do everything a pointer can, that every component is right
in both themes, and that a control looks and acts disabled.

Three exports make sense for sharing expenses and for little else: `BalanceChip`, `CurrencyInput` and `SplitMethodSelector`. They
stay experimental, which means they MAY be removed (§3), and an app SHOULD NOT start to depend on them. Removing one is breaking
and comes with a migration note in [`docs/upgrade.md`](../upgrade.md). No other export is promoted to stable here: an export
becomes stable when core or an app uses it and a task of its own lists it (§3), and none has been put forward.

## Changelog

| Date       | Change                                                                                                                                                                                                                                                                 |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-10-30 | First draft. Breaking changes are a minor bump until `1.0.0`, and everything is experimental unless listed as stable.                                                                                                                                                  |
| 2026-10-30 | §6.2: focus is trapped and returned by a modal overlay, and a non-modal one takes none. §9: the audit test. §10: nothing the checks can read is left, the three exports that look specific to one app are named, and `NavTabs` and `SplitPane` use the one breakpoint. |
