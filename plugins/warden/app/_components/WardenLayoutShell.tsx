'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { Button, Icon, ThreeColumnLayout } from '@sovereignfs/ui';
import { NEW_CHAT_PATHNAME } from '../_lib/active-session';
import { LEGACY_SIDEBAR_STORAGE_KEY, sidebarCookieString } from '../_lib/sidebar-preference';
import styles from './warden-layout-shell.module.css';

interface WardenShellContextValue {
  collapsed: boolean;
  toggleCollapse: () => void;
}

const WardenShellContext = createContext<WardenShellContextValue | null>(null);

/**
 * The shell's collapse state and toggle, for whatever renders inside the
 * sidebar slot. A context rather than a prop injected with `cloneElement`:
 * the layout now wraps the sidebar in a `<Suspense>` so its session list
 * can stream in after the shell has painted, and `cloneElement` on a
 * Suspense element would hand the prop to Suspense, not to the sidebar.
 * Returns `null` outside the shell (unit tests render the sidebar alone).
 */
export function useWardenShell(): WardenShellContextValue | null {
  return useContext(WardenShellContext);
}

/**
 * Wraps Warden's chat page in a collapsible two-column layout (RFC 0063
 * §10, epic task 22.10): `sidebar` (session list) + `children` (the chat
 * itself). Collapsed state persists in a cookie (`sidebar-preference.ts`)
 * that the `(chat)` layout reads server-side and passes in as
 * `initialCollapsed`, so the first paint is already in the right state. It
 * used to live in `localStorage`, read in a `useEffect` after hydration —
 * which meant every full load for a user with the sidebar open first drew
 * the chat full-width and then jumped to make room. No browser global is
 * read during render (this repo's hydration-mismatch rule); the one-time
 * migration of a legacy `localStorage` value runs in an effect.
 *
 * The collapse toggle relocates with visibility: collapsed, it lives in the
 * main column (the only place left to put it, since there's no sidebar to
 * hold it); expanded, the sidebar renders its own via `useWardenShell()` so
 * the button that hides the sidebar lives inside the thing it hides,
 * matching the requested Claude-style placement — collapsing must never
 * also hide the only way to bring it back, which is exactly what the
 * main-column fallback guarantees for the collapsed case.
 *
 * Collapsing swaps nothing structural: the same `ThreeColumnLayout` wraps
 * the same `.mainColumn`/`.content` in both states, with the sidebar column
 * hidden via `sidebarHidden` (a `display: none`, which also avoids the 1px
 * `border-right` hairline a zero-width column would still paint).
 *
 * This must stay a single stable tree. An earlier version returned a
 * different wrapper per state (`.collapsedShell` vs. `ThreeColumnLayout`),
 * which changed `children`'s parent element type and so unmounted and
 * remounted `ChatView` on every toggle — discarding an in-flight stream,
 * unsent composer text, and any incognito conversation (which is
 * memory-only and therefore unrecoverable). It also fired once on every
 * page load for anyone with the sidebar expanded, since `collapsed` starts
 * `true` and flips in `useEffect`.
 */
export function WardenLayoutShell({
  sidebar,
  children,
  initialCollapsed = true,
}: {
  sidebar: ReactNode;
  children: ReactNode;
  /** Read from the preference cookie by the server layout. Defaults to
   *  collapsed for a visitor with no stored preference. */
  initialCollapsed?: boolean;
}) {
  const [collapsed, setCollapsed] = useState(initialCollapsed);

  function persist(next: boolean) {
    document.cookie = sidebarCookieString(next, window.location.protocol === 'https:');
  }

  // One-time migration: a user who expanded the sidebar before the
  // preference moved into a cookie has `'0'` in localStorage and no cookie
  // yet. Honour it once, write the cookie, and drop the old key so this
  // never runs again for them.
  useEffect(() => {
    let legacy: string | null = null;
    try {
      legacy = window.localStorage.getItem(LEGACY_SIDEBAR_STORAGE_KEY);
    } catch {
      return;
    }
    if (legacy === null) return;
    window.localStorage.removeItem(LEGACY_SIDEBAR_STORAGE_KEY);
    if (legacy === '0' && initialCollapsed) {
      setCollapsed(false);
      persist(false);
    }
  }, [initialCollapsed]);

  function toggle() {
    setCollapsed((previous) => {
      const next = !previous;
      persist(next);
      return next;
    });
  }

  return (
    <WardenShellContext.Provider value={{ collapsed, toggleCollapse: toggle }}>
      <ThreeColumnLayout sidebarWidth={280} sidebarHidden={collapsed} className={styles.layout}>
        {sidebar}
        <div className={styles.mainColumn}>
          {/* Only rendered while collapsed — expanded, the sidebar holds its
              own copy of this control (via `useWardenShell`). Kept as a
              conditional sibling in a fixed slot so `.content` never changes
              position, and absolutely positioned so it never shrinks
              `.content`'s box. */}
          {collapsed && (
            <div className={styles.toggleBar}>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-label="Show sessions sidebar"
                onClick={toggle}
              >
                <Icon name="panel-left" size="sm" aria-hidden />
              </Button>
              {/* "New chat" is the sidebar's first row, so it disappears with
                  the sidebar. Surfacing it here keeps the one action a
                  collapsed user is most likely to want reachable without
                  reopening the sidebar first — and it goes away again the
                  moment the sidebar (which already has it) comes back. */}
              <Link href={NEW_CHAT_PATHNAME} aria-label="New chat" title="New chat">
                <Button type="button" variant="ghost" size="sm" aria-hidden tabIndex={-1}>
                  <Icon name="plus" size="sm" aria-hidden />
                </Button>
              </Link>
            </div>
          )}
          <div className={styles.content}>{children}</div>
        </div>
      </ThreeColumnLayout>
    </WardenShellContext.Provider>
  );
}
