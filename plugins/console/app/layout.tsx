'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Icon,
  NavList,
  OfflineGate,
  PageContainer,
  ResponsiveSurface,
  ThreeColumnLayout,
} from '@sovereignfs/ui';
import { CONSOLE_SECTIONS, activeConsoleSectionId } from './_lib/sections';
import styles from './console.module.css';

/**
 * Console shell layout — the plugin's own sub-navigation, nested inside the
 * platform sidebar (the runtime composes this plugin under the `(platform)`
 * route group, so the shell chrome wraps it automatically).
 *
 * Desktop: a persistent `ThreeColumnLayout` sidebar (`NavList variant="static"`)
 * + main column, `data-plugin-fullbleed` so the two columns each scroll
 * independently instead of the whole page scrolling as one unit (matches
 * `sovereign-tasks`' `DesktopTasksShell`/Warden's own fullbleed pages).
 * Mobile: no persistent sidebar — the bare `/console` route (Overview)
 * renders its own drill-down index (see `page.tsx`); every other section
 * gets a `‹ Console` back link above its content instead.
 */
export default function ConsoleLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const activeId = activeConsoleSectionId(pathname);
  const isOverview = pathname === '/console';

  const sidebarGroups = CONSOLE_SECTIONS.map((group) => ({
    ...group,
    items: group.items.map((item) => ({ ...item, active: item.id === activeId })),
  }));

  return (
    <ResponsiveSurface
      web={
        <div data-plugin-fullbleed className={styles.frame}>
          <ThreeColumnLayout sidebarWidth={240}>
            <div className={styles.sidebar}>
              <h1 className={styles.title}>Console</h1>
              <NavList
                groups={sidebarGroups}
                variant="static"
                aria-label="Console sections"
                renderLink={(item, linkProps) => (
                  <Link
                    href={item.href}
                    className={linkProps.className}
                    aria-current={linkProps['aria-current']}
                  >
                    {linkProps.children}
                  </Link>
                )}
              />
            </div>
            <div className={styles.main}>
              {/* Console is an administrative surface — a cached page here
                  reflects a point-in-time snapshot with no way to signal it
                  may be stale (research 0012, epic task 2.32). Block the
                  main column, not the sidebar, so it's still clear where
                  you are while reconnecting. */}
              <OfflineGate surfaceName="Console">{children}</OfflineGate>
            </div>
          </ThreeColumnLayout>
        </div>
      }
      mobile={
        <PageContainer maxWidth="full" className={styles.mobileFrame}>
          {!isOverview && (
            <Link href="/console" className={styles.backLink}>
              <Icon name="chevron-left" size="sm" aria-hidden />
              Console
            </Link>
          )}
          <OfflineGate surfaceName="Console">{children}</OfflineGate>
        </PageContainer>
      }
    />
  );
}
