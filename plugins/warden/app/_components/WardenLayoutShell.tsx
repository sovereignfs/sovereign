'use client';

import { cloneElement, isValidElement, useEffect, useState } from 'react';
import type { ReactElement, ReactNode } from 'react';
import Link from 'next/link';
import { Button, Icon, ThreeColumnLayout } from '@sovereignfs/ui';
import { NEW_CHAT_PATHNAME } from '../_lib/active-session';
import styles from './warden-layout-shell.module.css';

const COLLAPSE_STORAGE_KEY = 'warden:sidebarCollapsed';

/**
 * Wraps Warden's chat page in a collapsible two-column layout (RFC 0063
 * §10, epic task 22.10): `sidebar` (session list) + `children` (the chat
 * itself). Collapsed state persists to `localStorage` — initialized to
 * `true` (hidden by default; a first-time visitor gets the full-width chat,
 * not a sidebar they didn't ask for) and read for real in `useEffect`, never
 * in the `useState` initializer or render, per this repo's hydration-mismatch
 * rule for client components reading browser globals. An explicit `'0'`
 * (the user expanded it before) is the only thing that overrides the
 * collapsed default.
 *
 * The collapse toggle relocates with visibility: collapsed, it lives in the
 * main column (the only place left to put it, since there's no sidebar to
 * hold it); expanded, it's injected into `sidebar` itself via `cloneElement`
 * (`onToggleCollapse`) so the button that hides the sidebar lives inside the
 * thing it hides, matching the requested Claude-style placement — collapsing
 * must never also hide the only way to bring it back, which is exactly what
 * the main-column fallback guarantees for the collapsed case.
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
}: {
  sidebar: ReactNode;
  children: ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(true);

  useEffect(() => {
    setCollapsed(window.localStorage.getItem(COLLAPSE_STORAGE_KEY) !== '0');
  }, []);

  function toggle() {
    setCollapsed((previous) => {
      const next = !previous;
      window.localStorage.setItem(COLLAPSE_STORAGE_KEY, next ? '1' : '0');
      return next;
    });
  }

  const sidebarWithToggle = isValidElement(sidebar)
    ? cloneElement(sidebar as ReactElement<{ onToggleCollapse?: () => void }>, {
        onToggleCollapse: toggle,
      })
    : sidebar;

  return (
    <ThreeColumnLayout sidebarWidth={280} sidebarHidden={collapsed} className={styles.layout}>
      {sidebarWithToggle}
      <div className={styles.mainColumn}>
        {/* Only rendered while collapsed — expanded, the sidebar holds its
            own copy of this control (injected above). Kept as a conditional
            sibling in a fixed slot so `.content` never changes position,
            and absolutely positioned so it never shrinks `.content`'s box. */}
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
  );
}
