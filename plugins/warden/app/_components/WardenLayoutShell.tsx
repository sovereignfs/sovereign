'use client';

import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Button, Icon, ThreeColumnLayout } from '@sovereignfs/ui';
import styles from './warden-layout-shell.module.css';

const COLLAPSE_STORAGE_KEY = 'warden:sidebarCollapsed';

/**
 * Wraps Warden's chat page in a collapsible two-column layout (RFC 0063
 * §10, epic task 22.10): `sidebar` (session list) + `children` (the chat
 * itself). Collapsed state persists to `localStorage` — initialized to
 * `false` and read for real in `useEffect`, never in the `useState`
 * initializer or render, per this repo's hydration-mismatch rule for
 * client components reading browser globals.
 *
 * The collapse toggle lives in the *main* column, not inside the sidebar
 * itself — collapsing the sidebar must not also hide the only way to bring
 * it back.
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
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    setCollapsed(window.localStorage.getItem(COLLAPSE_STORAGE_KEY) === '1');
  }, []);

  function toggle() {
    setCollapsed((previous) => {
      const next = !previous;
      window.localStorage.setItem(COLLAPSE_STORAGE_KEY, next ? '1' : '0');
      return next;
    });
  }

  const main = (
    <div className={styles.mainColumn}>
      <div className={styles.toggleBar}>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-label={collapsed ? 'Show sessions sidebar' : 'Hide sessions sidebar'}
          onClick={toggle}
        >
          <Icon name="panel-left" size="sm" aria-hidden />
        </Button>
      </div>
      <div className={styles.content}>{children}</div>
    </div>
  );

  if (collapsed) {
    return <div className={styles.collapsedShell}>{main}</div>;
  }

  return (
    <ThreeColumnLayout sidebarWidth={280} className={styles.layout}>
      {sidebar}
      {main}
    </ThreeColumnLayout>
  );
}
