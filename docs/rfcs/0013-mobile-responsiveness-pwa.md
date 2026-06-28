# RFC 0013 — Mobile responsiveness & PWA hardening

**Status:** Implemented\
**Date:** June 2026\
**Author:** kasunben\
**Scope:** Runtime shell (`runtime/app/(platform)/`), `packages/ui` (`Dialog` + a new `Drawer` + tokens), runtime PWA config / `runtime/public/manifest.json` / root-layout viewport, `docs/design-system.md`, SRS; builds on RFC 0001 (overlay shell)\
**Incorporated into plan:** Yes — scheduled as roadmap Task 0.5.26; documentation-first. This RFC specifies the design and the end-to-end mobile UI flows; SRS requirement IDs, scheduling, and task allocation are deferred. Wiring the `minimal` shell mode is explicitly out of scope here and handed to a follow-up RFC 0014.

---

## Summary

Harden Sovereign's **mobile** experience and its **PWA** so the installed app
feels native, not like a desktop layout squeezed onto a phone. The work spans the
three shell modes and a set of cross-cutting concerns:

- **Default shell (mobile):** the persistent footer icon strip becomes a thin
  footer bar with a single action button that opens a dismissable **bottom
  Drawer** holding plugin navigation; the header gains an **active-plugin title**;
  Console (admin) moves into the **header avatar menu**.
- **Minimal shell:** the plugin owns the whole viewport — this RFC specifies its
  **responsive expectations** (full `dvh` height, `viewport-fit=cover`, safe-area
  pass-through) but **does not wire the mode** (→ RFC 0014).
- **Overlay shell (mobile):** an open dialog no longer covers the header — a new
  `--sv-dialog-inset-top` (mirror of the existing `--sv-dialog-inset-left`) keeps
  the fixed header **visible and usable** above the sheet, for all sizes.
- **Cross-cutting:** unify the inconsistent hardcoded breakpoints, switch the
  shell to `dvh`, add safe-area handling, enforce 44px touch targets, and polish
  the web app manifest (`display_override`, `shortcuts`, `screenshots`,
  `orientation`, immersive iOS status bar).
- **Design system:** a reusable **`Drawer`** primitive, new tokens
  (`--sv-dialog-inset-top`, `--sv-touch-target-min`), a documented **breakpoint
  convention**, and the first responsive/mobile guidance in
  `docs/design-system.md`.

## Motivation

Sovereign is positioned as an installable PWA (PLT-09, SRS §3.11) and a future
Capacitor shell (SRS §3.12) will load the same instance unchanged — so the web
mobile layout _is_ the mobile app. The chrome is already responsive (PLT-13), but
the experience is unhardened in ways that show immediately on a real phone:

- An open **overlay** plugin (Console, Account) becomes a full-screen sheet that
  **covers the header**, so the user loses branding, title, and any sense of where
  they are.
- **Breakpoints disagree** — the shell flips at `768px`, the Dialog at `640px` —
  producing a band (641–768px) where the shell is in mobile layout but the dialog
  is still a desktop box.
- The shell's `min-height: 100vh` is **clipped by mobile browser UI and the
  virtual keyboard** (the offline page already uses `100dvh`, proving the fix).
- **No safe-area handling** means chrome collides with the notch and the home
  indicator once installed (`display: standalone`).
- **Touch targets** are ~36–40px, below the 44–48px guideline.
- The **manifest** is functional but lacks the polish that makes an install feel
  first-class.
- `docs/design-system.md` gives plugin developers **no** responsive guidance.

These are cheap, high-leverage wins that make the PWA credible and set the
baseline the Capacitor shell will inherit.

## Current state (what this builds on)

- **One shell breakpoint, CSS-only.** `runtime/app/(platform)/shell.module.css`
  defines a desktop grid (`--sv-shell-sidebar-width: 64px`, `:1–9`) and a single
  `@media (max-width: 768px)` block (`:104–138`) that hides the sidebar and shows
  a mobile **header** (branding + avatar menu) and a persistent **footer launcher**
  (plugin icons). No JS viewport watching; all chrome is in the DOM and toggled by
  `display`.
- **The avatar menu** (`runtime/app/(platform)/_components/AccountMenu.tsx`)
  already renders in two placements (`sidebar` opens right, `header` opens
  down-left), with `aria-expanded`, Esc, and click-outside — the natural place to
  add Console for admins.
- **Overlay dialog (RFC 0001).** `packages/ui/src/components/Dialog/Dialog.tsx`
  renders fixed-size boxes (sm/md/lg); the scrim offsets its left edge by
  `--sv-dialog-inset-left` (the shell sets it to the sidebar width on desktop, `0`
  on mobile). On mobile, `Dialog.module.css` `@media (max-width: 640px)` (`:100–118`)
  makes **every size a full-screen sheet** (width/height 100%, no radius, scrim
  padding `0`) — which **covers the header**. Size is resolved per plugin from
  `shellConfig.overlaySize` via `overlaySizeForSegment` (`runtime/src/overlay.ts`).
- **`dvh` precedent.** `runtime/app/offline/page.tsx` uses `min-height: 100dvh`;
  the shell still uses `100vh`.
- **PWA surface.** `runtime/public/manifest.json` has
  `display: "standalone"`, `theme_color`/`background_color` `#09090b`, and
  192/512/maskable icons. `runtime/app/layout.tsx` links the manifest, sets
  `appleWebApp.statusBarStyle: "default"`, and exports `viewport.themeColor` — but
  **no `viewport-fit=cover`** and no safe-area CSS anywhere.
- **Tokens & components.** Plain CSS Modules + global `--sv-*` tokens (primitive +
  semantic tiers, `packages/ui/src/tokens/`), **no Tailwind**, **no breakpoint
  token** (CSS custom properties can't be used in `@media` conditions). The
  shipped component inventory is small — **Button, Input, Dialog**.

## Proposed design

### Shell — `default` (mobile)

```
┌───────────────────────────────────────────┐
│  Sovereign        <Plugin title>     ( ◐ ) │  header: brand · title · avatar menu
│                                            │   (avatar menu: Account · Console* · Log out)
├───────────────────────────────────────────┤
│                                            │
│                content                     │  scrollable, 100dvh-aware
│                                            │
├───────────────────────────────────────────┤
│                 [ ▤ Apps ]                 │  footer bar: one action button
└───────────────────────────────────────────┘
                     │ tap
                     ▼
┌───────────────────────────────────────────┐
│  ░░░░░░░░░░ scrim (header still shows) ░░░░ │
│            ┌───────────────────┐           │
│            │  Plugin navigation │  ← Drawer slides up from the bottom,
│            │  ▦  ▦  ▦  ▦         │     dismiss via scrim tap / Esc / swipe-down
│            └───────────────────┘           │
└───────────────────────────────────────────┘
   * Console row shown to platform:admin only
```

- **Header** = branding + **active-plugin title** + avatar menu. The title is
  resolved by the shell from the registry for the current route — **no new plugin
  API**; a plugin that later wants a _dynamic_ title is an open question.
- **Avatar menu** gains a **Console** row for admins, beside Account and Log out —
  the mobile analog of the desktop sidebar's bottom chrome (where ⚙ Console and the
  avatar already sit together). This keeps the Drawer single-purpose.
- **Footer** = a thin bar with a single action button ("Apps") that opens the
  **Drawer**. The Drawer is hidden by default, holds the **plugin navigation** (the
  launcher icons/list that the desktop sidebar's middle section shows), and is
  dismissable by scrim tap, Esc, or swipe-down. It is focus-trapped and
  safe-area-aware (bottom inset).

### Shell — `minimal` (mobile — responsive expectations only)

`minimal` plugins render **no platform chrome** — the plugin owns the entire
viewport. This RFC specifies what the platform still guarantees on mobile:

- the viewport is `100dvh` (not `100vh`), so the plugin can fill the screen
  without keyboard/browser-UI clipping;
- `viewport-fit=cover` is set and **safe-area insets are made available**
  (`env(safe-area-inset-*)`) so a full-bleed plugin can choose to honour or ignore
  them;
- no header, footer, sidebar, or Drawer is rendered.

**Wiring the `minimal` route group itself is out of scope here** — the generate
script still fails the build on `shell: "minimal"`
(`scripts/generate-registry.ts`). That work, and the rest of minimal's missing
pieces, is handed to **RFC 0014**.

### Shell — `overlay` (mobile)

Today a mobile overlay covers everything. Instead, mirror the existing desktop
left-inset pattern on the vertical axis:

- Add **`--sv-dialog-inset-top`** (default `0`), consumed by the `Dialog` scrim
  exactly as `--sv-dialog-inset-left` is.
- On mobile the shell sets `--sv-dialog-inset-top` to the **header height** (and,
  as today, `--sv-dialog-inset-left: 0`). The fixed header stays painted and
  interactive **above** the sheet; the scrim and panel begin **below** it.
- All sizes (sm/md/lg) become a full-width sheet filling the **remaining** height
  below the header on mobile (unchanged desktop behaviour). The unified breakpoint
  (below) replaces the Dialog's separate `640px` query.
- **Layering:** the header's `z-index` must be `≥` the scrim's (`100`) so it stays
  clickable while the dialog is open. Intra-overlay `<Link replace>` navigation and
  `router.back()` dismissal (RFC 0001) are unchanged.

### Cross-cutting hardening

- **Breakpoint convention.** Unify on a **single mobile breakpoint — `768px`** —
  and migrate the Dialog from `640px` to it so the shell and the dialog flip
  together (eliminating the 641–768px mismatch band). Because CSS custom
  properties **cannot** be referenced inside `@media` conditions, the breakpoint is
  a **documented constant** (a future option is a PostCSS `@custom-media` token if
  build tooling is added) — _not_ a `--sv-*` variable. Documented in
  `docs/design-system.md`.
- **Dynamic viewport height.** Shell `min-height: 100vh` → `100dvh` with a `100vh`
  fallback line for older engines.
- **Safe areas.** Add `viewport-fit=cover` to the `viewport` export
  (`runtime/app/layout.tsx`) and apply `env(safe-area-inset-*)` to the header
  (top), the footer bar / Drawer (bottom), and full-screen surfaces, so chrome
  clears the notch and home indicator in standalone mode.
- **Touch targets.** Minimum **44px** hit area for icon-only controls (header
  avatar, footer button, Drawer/sidebar icons). Introduce
  **`--sv-touch-target-min: 44px`** and apply it in the chrome and design-system
  components.
- **Manifest polish** (`runtime/public/manifest.json`): add
  `display_override: ["standalone", "minimal-ui"]`, `categories: ["productivity"]`,
  `orientation` (value is an open question — `any` vs `portrait`), `shortcuts`
  (e.g. Launcher, Account), and `screenshots` (richer install dialog). In
  `runtime/app/layout.tsx`, switch `appleWebApp.statusBarStyle` to
  `"black-translucent"` for an immersive top, paired with the safe-area top inset.

### Design-system additions (`packages/ui`)

- **`Drawer`** — a reusable bottom-sheet primitive: scrim + panel that slides up
  from the bottom, a `maxHeight`/size prop, focus trap, dismissal by Esc / scrim
  tap / swipe-down, and safe-area-aware bottom padding. Reuses `--sv-color-scrim`
  and `--sv-shadow-overlay`; shares the dismissal/focus conventions of `Dialog`.
  Additive — a **minor** `@sovereignfs/ui` bump.
- **New tokens** — `--sv-dialog-inset-top` and `--sv-touch-target-min` (additive).
- **`docs/design-system.md`** gains its first **Responsive & mobile** section:
  the breakpoint convention, touch-target minimum, safe-area usage, `dvh`, and when
  to reach for `Dialog` vs `Drawer` — guidance plugin developers currently lack.

## UI flows

**Navigate via the Drawer** — mobile default shell → tap the footer **Apps**
button → Drawer slides up over a scrim (header still visible) → tap a plugin → route
changes and the Drawer dismisses; or dismiss with scrim tap / Esc / swipe-down with
no navigation.

**Open an overlay plugin on mobile** — tap Account (header avatar menu) or, for
admins, Console → the overlay sheet rises **below the fixed header**, which stays
showing branding + title → interact, switch tabs (`replace` nav) → Esc / scrim tap
above the sheet / back gesture dismisses via `router.back()`.

**Admin reaches Console** — open the header avatar menu → **Console** row (shown to
`platform:admin` only) → Console opens as the top-inset overlay.

**Minimal plugin, edge to edge** — a `minimal` plugin renders full-bleed across
`100dvh` with no chrome; it reads `env(safe-area-inset-*)` if it wants to keep
controls clear of the notch/home indicator. (Mode wiring lands in RFC 0014.)

**Install & launch standalone** — install from the browser → launch from the home
screen → splash uses `background_color` → app opens in `standalone` with the header
padded below the status bar (safe-area top) and the footer bar above the home
indicator (safe-area bottom).

## Alternatives considered

1. **Keep the persistent footer icon strip.** Rejected — it clutters a small
   viewport, leaves no room for a header title, and grows unusable as the installed
   plugin count rises. A dismissable Drawer scales and declutters.
2. **Overlay as a bottom sheet on mobile** (instead of top-inset). More
   "mobile-native", but it introduces an interaction model that diverges from the
   desktop overlay. Top-inset reuses the existing `--sv-dialog-inset-*` pattern and
   keeps desktop/mobile consistent — chosen.
3. **Console in the bottom Drawer.** Workable, and the user's initial instinct, but
   it mixes personal/admin chrome with app navigation. Putting Console in the header
   menu mirrors the desktop bottom chrome and keeps the Drawer single-purpose.
   Recorded as the alternative.
4. **Per-component breakpoints.** The current 640/768 split _is_ the bug; a single
   documented breakpoint prevents drift.
5. **JS viewport watcher / container queries everywhere.** Rejected for the shell —
   CSS media queries keep SSR/RSC clean with no layout shift on resize. (Container
   queries remain fair game inside individual components later.)

## Open questions

1. **`orientation`** — lock to `portrait`, or leave `any` (tablets/landscape)?
2. **Drawer variant** — should the Drawer also offer a richer launcher-_grid_
   variant (name + icon tiles), or stay a compact nav list?
3. **Dynamic header title** — route-derived plugin name covers the common case; do
   we need a plugin-set dynamic title (Next metadata vs a small SDK hook), and when?
4. **`share_target`** — add "Share to Sovereign" to the manifest as a later
   enhancement?
5. **Minimal × safe-area** — exactly how minimal's safe-area guarantees interact
   with RFC 0014's route-group wiring.
6. **Requirement IDs** — proposed new PLT-/NFR- entries (mobile shell + PWA
   polish) are **not** assigned in the SRS until this RFC is accepted.

## Adoption path

1. **Documentation-first (this RFC).** Design + UI flows captured; no code, no
   manifest/CSS changes, no SRS edits, no scheduling.
2. **When accepted & scheduled** (a runtime + `packages/ui` change): the `Drawer`
   primitive + new tokens (additive **minor** UI bump), the default-shell
   header/footer/Drawer rework, the overlay top-inset, and the cross-cutting
   hardening (breakpoint unification, `dvh`, safe-area, touch targets, manifest
   polish). The `docs/design-system.md` responsive section ships in the same change.
3. **RFC 0014 — Minimal shell mode** follows immediately: wire the chrome-free
   route group and the rest of minimal's missing pieces, honouring the responsive
   expectations specified here.

## Changelog

| Version | Date     | Change                                                                                                                                                                                                                                 |
| ------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0.1     | Jun 2026 | Initial draft; mobile hardening across the three shell modes + PWA polish; bottom `Drawer`, top-inset overlay, unified breakpoint, safe-area/`dvh`/touch-target tokens; documentation-first, minimal-mode wiring deferred to RFC 0014. |
| 0.2     | Jun 2026 | Accepted; scheduled in the roadmap as Task 0.5.26.                                                                                                                                                                                     |
