'use client';

import { cloneElement, isValidElement, useEffect, useState } from 'react';
import type { ReactElement, ReactNode } from 'react';
import { Button, Icon, ThreeColumnLayout } from '@sovereignfs/ui';
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
 * When collapsed, `ThreeColumnLayout` is bypassed entirely rather than
 * rendered with `sidebarWidth={0}`: its `.sidebar` slot always carries a
 * `border-right`, which a zero-width flex item still renders as a visible
 * 1px hairline down the left edge of the screen — not a real "collapsed"
 * look. The bypassed path re-renders the same `.mainColumn`/`.toggleBar`/
 * `.content` structure at full width instead.
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

  if (collapsed) {
    return (
      <div className={styles.collapsedShell}>
        <div className={styles.mainColumn}>
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
          </div>
          <div className={styles.content}>{children}</div>
        </div>
      </div>
    );
  }

  const sidebarWithToggle = isValidElement(sidebar)
    ? cloneElement(sidebar as ReactElement<{ onToggleCollapse?: () => void }>, {
        onToggleCollapse: toggle,
      })
    : sidebar;

  return (
    <ThreeColumnLayout sidebarWidth={280} className={styles.layout}>
      {sidebarWithToggle}
      <div className={styles.mainColumn}>
        <div className={styles.content}>{children}</div>
      </div>
    </ThreeColumnLayout>
  );
}
