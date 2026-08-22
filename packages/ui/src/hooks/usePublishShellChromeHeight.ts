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
 *
 * For `--sv-shell-header-height` specifically, this also mirrors the same
 * measured height onto `--sv-dialog-inset-top` on `:root` (`document.
 * documentElement`, not `#sv-app-shell`) — `Dialog`'s mobile `.scrim` is
 * `position: fixed` and reads that variable for its own `top` offset, and
 * per `globals.css`'s own comment, iOS Safari has a documented quirk where a
 * `position: fixed` element inherits custom properties from `:root` rather
 * than from its DOM ancestors, so a value set only on `#sv-app-shell` (an
 * ancestor, not `:root`) silently never reaches it there. The platform's own
 * header already keeps `--sv-dialog-inset-top` correct this way, via
 * `ClientShell.tsx`'s own `syncViewport()` — but that function is part of
 * `(platform)/layout.tsx` and never runs for a `shell: minimal` plugin, so a
 * self-rendered `MobileHeader` (this hook's entire reason to exist) had no
 * equivalent, and `--sv-dialog-inset-top` silently kept `globals.css`'s
 * hardcoded platform-header-height fallback (60px) regardless of this
 * header's real height. Found live in `sovereign-plugin-kanban`: its
 * self-rendered header measures 69px, so its card-detail `Dialog` opened
 * with a real, reproducible ~9px misalignment against that header's own
 * bottom edge — confirmed via `getBoundingClientRect()` on both elements,
 * not just visually. */
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
      const height = `${el.getBoundingClientRect().height}px`;
      shell.style.setProperty(cssVariable, height);
      if (cssVariable === '--sv-shell-header-height') {
        document.documentElement.style.setProperty('--sv-dialog-inset-top', height);
      }
    }

    publish();
    window.addEventListener('resize', publish);
    return () => {
      window.removeEventListener('resize', publish);
      document.getElementById('sv-app-shell')?.style.removeProperty(cssVariable);
      if (cssVariable === '--sv-shell-header-height') {
        document.documentElement.style.removeProperty('--sv-dialog-inset-top');
      }
    };
  }, [ref, cssVariable]);
}
