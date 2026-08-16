'use client';

import { useLayoutEffect } from 'react';
import type { RefObject } from 'react';

/**
 * Internal implementation detail of `MobileHeader`/`MobileFooter` — not part
 * of the package's public surface (not re-exported from `hooks/index.ts`).
 *
 * Measures `ref`'s own rendered height and publishes it as an inline
 * `var(--sv-shell-header-height|--sv-shell-footer-height)` override on
 * `#sv-app-shell` (the runtime shell's stable root id, `runtime/app/
 * (platform)/layout.tsx`), removing it on unmount. This is what makes a
 * *self-rendered* `MobileHeader`/`MobileFooter` — the sanctioned pattern for
 * a plugin that opts out of the platform's own chrome via
 * `shellConfig.mobileHeader`/`mobileFooter: false` (RFC 0075/0088) — work
 * correctly with `Sheet`/`Drawer`/`Dialog`, which all size themselves against
 * these same two variables so they stop above/below the chrome instead of
 * sliding underneath it.
 *
 * Before this existed, only the *platform's own* header/footer had its
 * height accounted for (a fixed CSS `calc()` in `shell.module.css`, driven by
 * `data-mobile-header-hidden`/`data-mobile-footer-hidden`, which collapses
 * the variable to `0px` whenever a plugin hides that chrome) — a plugin
 * self-rendering its own via this same component instead had no path to tell
 * the shell what its real height was, and silently inherited that `0px`.
 * `Sheet`/`Drawer` then extended full-height, and since the header/footer's
 * own `z-index` (101) beats an overlay's (100), the chrome visibly covered
 * the overlay's last ~60px. First found and fixed ad hoc in `sovereign-tasks`
 * (measuring in the plugin itself, `getBoundingClientRect()` in a
 * `useLayoutEffect`); moved here so every consumer of these two components —
 * present and future, in this repo or externally maintained — gets it for
 * free, without having to know the mechanism exists. See
 * `docs/architecture-rules.md` for the full rule.
 *
 * Deliberately **not** `ResizeObserver`: in live testing (both this repo's
 * own Chromium-based browser-preview tooling and a real WebKit iOS Simulator
 * session) a freshly created `ResizeObserver` never fired its callback even
 * once for an already-rendered, stably-sized, non-zero element — cause not
 * fully root-caused. A synchronous `getBoundingClientRect()` read in
 * `useLayoutEffect`, re-run on `window`'s `resize` event, worked immediately
 * and reliably in both environments instead.
 *
 * No-ops safely wherever `#sv-app-shell` doesn't exist (Storybook, a unit
 * test, or any host other than the platform's own runtime shell) — every CSS
 * consumer reads these variables with a `60px` fallback, so an absent
 * override is harmless.
 */
export function usePublishShellChromeHeight(
  ref: RefObject<HTMLElement | null>,
  cssVariable: '--sv-shell-header-height' | '--sv-shell-footer-height',
) {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    function publish() {
      const shell = document.getElementById('sv-app-shell');
      if (!shell || !el) return;
      shell.style.setProperty(cssVariable, `${el.getBoundingClientRect().height}px`);
    }

    publish();
    window.addEventListener('resize', publish);
    return () => {
      window.removeEventListener('resize', publish);
      document.getElementById('sv-app-shell')?.style.removeProperty(cssVariable);
    };
  }, [ref, cssVariable]);
}
