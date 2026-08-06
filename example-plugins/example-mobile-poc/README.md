# Example: Mobile Nav POC

A proof-of-concept plugin evaluating the stability of `@sovereignfs/ui`'s
mobile layout system, forked from `example-plugins/example-mobile`. Originally
placed directly under `plugins/` (so it composed as a real installed plugin
during `pnpm dev` with no `SOVEREIGN_EXAMPLES_ENABLED` needed) — that left it
gitignored and untracked, invisible outside the machine it was written on.
Relocated into `example-plugins/` as `example-mobile-poc` (task 12.5,
`docs/epics/example-plugins.md`); set `SOVEREIGN_EXAMPLES_ENABLED=1` before
`pnpm dev` to compose it now.

Deliberately mirrors **sovereign-tasks**' navigation _structure_ only — a
sidebar/index of sections on desktop, a swipeable section index + per-item
carousel on mobile — with none of its data layer, database, or plugin
functionality. Every page renders a static dummy message. The goal is to
exercise navigation and UI events through the newest layout primitives, not
to ship a feature.

## What it composes

- **`useIsMobile`** — forks the whole shell (`ExampleMobileShell.tsx`) between
  a desktop tree (sidebar + content) and a mobile tree, same
  fork-a-different-component-tree pattern as sovereign-tasks'
  `MobileAwareShell`.
- **`SwipableMobileCarousel`** — slide 0 is a "Sections" index (mirrors
  sovereign-tasks' Lists index slide); slides 1..n are one dummy page per
  section. Synced to the URL via `useCarouselRouteSync`.
- **`MobileHeader`** / **`MobileFooter`** — normally shell-owned chrome
  (RFC 0088); mounted directly inside this plugin's own mobile tree here so
  the components can be exercised standalone. A real plugin never renders
  these itself — the runtime shell already does, which is why this POC shows
  two header/footer bars stacked on mobile (see Observations).

## Running it locally

From the platform monorepo root:

```bash
SOVEREIGN_EXAMPLES_ENABLED=1 pnpm dev   # runtime on :3000; routes at /example-mobile-poc
```

Resize the browser below 768px (or open on a real device) to see the mobile
shell; desktop shows a sidebar + content layout instead.

## Observations (2026-08-05 stability pass)

Manual testing against a local `pnpm dev` instance, driven through an
automated browser (Claude's Browser pane), surfaced the following. These are
findings about `@sovereignfs/ui`'s mobile primitives, not bugs in this POC's
own code — worth a closer look, ideally re-verified on a real device before
filing anything against `packages/ui`, since synthetic scroll/click events in
an automated browser aren't a perfect proxy for real touch gestures.

- **Desktop shell works correctly**: sidebar navigation, active-row
  highlighting, and the per-section content pane (including the "Dummy
  action" button's local state) all behaved exactly as expected across every
  section.
- **Fresh/full page loads on mobile always render correctly.** Loading
  `/example-mobile-poc`, or any `/example-mobile-poc/<section>` URL directly,
  correctly lands the carousel on the right slide with full content, header
  title, and dot indicator in sync.
- **Programmatic "jump" navigation (tapping a `MobileFooter` icon, a
  `SwipableMobileCarouselDots` dot, or a link inside the Apps `Drawer`) was
  unreliable once already mounted.** Repeatedly, the header title, active dot,
  and footer active-state all updated correctly to the target section, but
  the carousel's visible slide did not scroll to match — sometimes staying on
  the previous slide's content, sometimes landing on a completely blank
  region between slides that didn't resolve even after waiting several
  seconds. This reproduced across all three jump triggers (footer icon, dots,
  Drawer link), suggesting the shared mechanism — an external `activeIndex`
  change driving `SwipableMobileCarousel`'s own `scrollToIndex` effect — is
  the common thread, though a testing-tool artifact (synthetic click/scroll
  events not perfectly matching real touch physics) can't be ruled out
  without a real-device pass.
- **A synthetic wheel/scroll gesture on the carousel region** also left it in
  a state where the header/dots reported one slide but the content area was
  blank — again consistent with the scroll-snap settle position and the
  React-side `activeIndex` state disagreeing.
- **`MobileHeader`/`MobileFooter` in isolation rendered and styled
  correctly** — title updates, active-icon styling, the launcher's
  open/pressed state, and the Apps `Drawer`'s scrim/content all matched their
  own doc comments. The instability observed was specifically in the
  _carousel's_ response to externally-driven index changes, not in the header
  or footer components themselves.

**Recommendation**: before relying on `SwipableMobileCarousel` +
`useCarouselRouteSync` for jump-navigation (not just user-swipe) in a shipping
plugin, verify the jump path (tapping a tab/dot to navigate, not swiping) on
a real iOS/Android device or a real browser session, and compare against
sovereign-tasks' existing hand-rolled carousel (which has no jump-navigation
UI to begin with — only swipe and `<Link>`-based list-row taps, which behave
like a full navigation rather than a same-mount jump).
