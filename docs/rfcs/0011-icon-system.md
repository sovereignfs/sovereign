# RFC 0011 — Icon system (Lucide)

**Status:** Accepted\
**Date:** June 2026\
**Author:** kasunben\
**Scope:** Design system (`packages/ui`) — a new `Icon` component + a generated SVG set; runtime chrome; `PluginTile`/sidebar plugin-icon wiring; `docs/design-system.md` + `docs/plugin-development.md`\
**Incorporated into plan:** Yes — **Task 0.5.17** (decision-log row in SRS §6). The `<Icon>` component, the generated zero-dependency SVG set, and the chrome adoption + plugin-icon wiring land in that task.

---

## Summary

Adopt **Lucide** (lucide.dev) as Sovereign's icon language. Rather than depend on
`lucide-react` at runtime, **generate a curated set of inline SVG React
components from Lucide into the design system** and expose them behind a
Sovereign **`<Icon>`** component. The published package ships plain SVGs + the
wrapper — **zero runtime or peer dependency**. The ad-hoc monograms/emoji in the
chrome are replaced with `<Icon>`, and the plugin manifest `icon.svg` (plugin
_identity_) is finally wired into the UI.

## Motivation

There is **no icon system** today. UI-affordance icons are improvised:

- the home link renders the monogram `"S"`;
- Console renders the **`⚙` emoji** (which looks different on every OS);
- plugin tiles render a two-letter **monogram**; and
- there is **no icon dependency** anywhere in the repo.

Tellingly, the platform's own hand-drawn plugin icon
(`plugins/launcher/icon.svg`) is already `viewBox="0 0 24 24" fill="none"
stroke="currentColor" stroke-width="2"` — **Lucide's exact convention**. Adopting
Lucide formalizes an aesthetic the project is already hand-rolling, and the
manifest `icon` field (currently parsed but rendered as a monogram in
`PluginTile`) finally gets used.

## Why Lucide

- **License:** ISC (permissive) — compatible with the AGPL core, and **bundled**
  (no CDN/external fetch), so it respects NFR-02 (no external dependency for
  core) and the no-telemetry stance.
- **Aesthetic:** stroke-based `24×24` `currentColor` icons match the **monochrome
  v1 identity** and inherit `--sv-` color tokens for free (`currentColor` →
  `--sv-color-text-*`).
- **Coverage & upkeep:** ~1,500 consistent, actively maintained icons (the
  Feather successor).

## Current state (what this builds on)

- **No icon library** in any `package.json` or the pnpm catalog.
- Chrome glyphs live in `runtime/app/(platform)/layout.tsx` (monogram `S`, `⚙`
  emoji, two-letter monograms).
- The manifest `icon` field is validated; `PluginTile`
  (`runtime/app/(platform)/(plugins)/launcher/_components/PluginTile.tsx`) parses
  but does not render it (monogram fallback).
- **Design-system constraints** (CLAUDE.md, `docs/design-system.md`): "React +
  CSS Modules — **zero extra dependencies**"; "No Tailwind, no third-party
  component framework"; monochrome identity; components reference `--sv-*` tokens
  only; RSC-safe; the package is the published contract.
- PWA install icons (`runtime/public/icons/`) are a separate concern, untouched.

## Proposed design (deferred — this RFC settles the contract)

### 1. Vendored/generated subset — zero runtime dependency

Lucide is the **source of truth**, not a runtime dependency. A curated **name
list** feeds a small **generation script** (a `pnpm` script) that emits inline,
RSC-safe SVG React components from Lucide into the design system
(`src/components/Icon/icons/`). `lucide` is a **devDependency** used only by that
script; the **published package ships the generated SVGs + the `<Icon>` wrapper**
— no runtime or peer dependency. This honors the "zero extra dependencies"
principle and minimizes supply-chain surface (consistent with RFC 0008's
hardening ethos). A `NOTICE` retains Lucide's ISC attribution.

Adding an icon = add a name to the list and regenerate. A chrome/console UI needs
**dozens**, not 1,500 — so the set stays small and intentional.

### 2. The `<Icon>` component

Proposed API (final shape is an open question):

```tsx
<Icon name="home" size="md" aria-label="Home" />
<Icon name="settings" aria-hidden /> // decorative
```

- `name` is a **typed union** of the curated icon names (tree-shakeable; unknown
  names fail typecheck).
- Size and color bind to `--sv-` tokens — a default size token
  (e.g. `--sv-icon-size-*`) and `currentColor` for color, so an icon recolors
  with its surrounding text token and themes for free.
- **Accessibility:** decorative icons set `aria-hidden`; meaningful icons require
  `aria-label`.
- **RSC-safe** — pure presentational SVG, no client JS, no hardcoded values
  (tokens only, per the design-system rule).

### 3. Affordance vs identity — an explicit split

- **UI-affordance icons** (home, settings/gear, chevron, close, menu, …) →
  Lucide `<Icon>`.
- **Plugin-identity icons** → the **author-supplied manifest `icon.svg`**, wired
  into `PluginTile` and the sidebar, with the monogram as the fallback when a
  plugin ships no icon. Guidance (not enforced): plugin authors should draw
  Lucide-style `24×24` stroke icons so third-party plugins sit visually with the
  platform.

### 4. Security — plugin SVGs are untrusted

A plugin's `icon.svg` is third-party content. It must be rendered via
`<img src>` (or sanitized) — **never** injected with `dangerouslySetInnerHTML`,
which would be an SVG/XSS vector. This ties into RFC 0008 (the platform must not
execute untrusted markup).

### 5. Adoption in the chrome (this RFC's first use)

Replace the `S` home monogram and the `⚙` Console emoji (and other chrome
glyphs) with `<Icon>`; keep the account avatar's image/monogram (that is
identity, not an affordance). Then wire plugin `icon.svg` into `PluginTile`/
sidebar.

## Impact when accepted (deferred)

| Where                         | Change                                                                                                                                          |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Design system (`packages/ui`) | New `Icon` component + generated icons dir + generation script + `lucide` **devDependency** + ISC `NOTICE`; `src/index` export; **minor** bump. |
| Runtime chrome                | `runtime/app/(platform)/layout.tsx` — replace `S` / `⚙` with `<Icon>`.                                                                          |
| Launcher / sidebar            | `PluginTile` + sidebar render the plugin `icon.svg` (monogram fallback).                                                                        |
| Docs                          | `docs/design-system.md` (Icon section + token binding) and `docs/plugin-development.md` (Icon usage + plugin-icon guidance).                    |

Not a manifest field, permission, SDK surface, or env var → `docs-parity.test.ts`
is unaffected.

## Alternatives considered

1. **`lucide-react` as a peer dependency + wrapper.** Full set on tap and
   tree-shakeable, but adds a dependency to the **published contract** that every
   consumer must install. Rejected in favour of zero-dep vendoring (the
   design-system principle + the maintainer's preference for plain SVGs).
2. **`lucide-react` bundled as a hard runtime dependency.** Same objection, and
   worse (bundled into the contract).
3. **Lucide in the runtime only (not the design system).** No shared `<Icon>`
   primitive for plugin developers; icon usage fragments. Rejected.
4. **Keep monograms/emoji.** Inconsistent and OS-dependent. Rejected.
5. **Other icon sets** (Heroicons, Phosphor, Feather). Lucide chosen for the
   aesthetic match to the existing `icon.svg`, active maintenance, and the ISC
   license.

## Open questions

1. **`<Icon>` API** — single `name` union (proposed) vs per-icon named exports
   (`<HomeIcon/>`) vs both.
2. **Initial curated icon list** — the starting set for the chrome + Console.
3. **Plugin `icon.svg` rendering** — `<img>` vs sanitized inline (security).
4. **Offer the curated set to plugin devs?** Or is `<Icon>` chrome/Console-only.
5. **Size token** — introduce `--sv-icon-size-*`, or reuse spacing/font tokens.
6. **Generation tooling location** — `scripts/` vs inside the design-system
   package.

## Changelog

| Version | Date     | Change                                                                           |
| ------- | -------- | -------------------------------------------------------------------------------- |
| 0.1     | Jun 2026 | Initial draft; Lucide via a generated zero-dependency SVG set behind `<Icon>`.   |
| 1.0     | Jun 2026 | Accepted; incorporated into the build plan (Task 0.5.17) and a decision-log row. |
