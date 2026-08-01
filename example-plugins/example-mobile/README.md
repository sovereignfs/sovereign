# Example: Mobile Layout

A reference plugin demonstrating `@sovereignfs/ui`'s PWA/mobile layout
primitives. This is a **testbed and showcase, not a shipped feature** — see
[`example-plugins/README.md`](../README.md) for how examples are composed and
why they live outside `plugins/`.

## What it shows

- **`ResponsiveSurface`** (`@sovereignfs/ui`) — forks the whole page between a
  desktop tree and a mobile tree. Only the active side is ever mounted.
- **`SwipableMobileCarousel`** + **`SwipableMobileCarouselSlide`**/`Header`/
  `Body`/`Footer` — the swipeable mobile layout system: a native
  scroll-snap-driven carousel where each slide's header/footer render
  immediately from known data, independent of the slide body's own loading
  state.

More mobile capabilities (as they ship in `@sovereignfs/ui`) will be added to
this same plugin over time — see `docs/design-system.md`'s "Mobile carousel &
responsive fork" section for the underlying primitives' full API.

## Running it locally

Set `SOVEREIGN_EXAMPLES_ENABLED=1` in your `.env`, then `pnpm dev` — see
[`example-plugins/README.md`](../README.md) for the full explanation. Visit
`/example-mobile`. Resize the browser below 768px (or open on a real device)
to see the swipeable carousel; the desktop view shows a static notice
instead, since this plugin has nothing to show in a wide layout by design.
