'use client';

import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Icon,
  NavList,
  OfflineGate,
  PageContainer,
  ResponsiveSurface,
  ThreeColumnLayout,
  useIsMobile,
} from '@sovereignfs/ui';
import { CONSOLE_SECTIONS, activeConsoleSectionId } from './_lib/sections';
import { ConsoleDetailPaneProvider } from './_lib/detail-pane';
import styles from './console.module.css';

/**
 * Below this width (but still above the mobile breakpoint, 768px — see
 * `ResponsiveSurface`'s default), a 3rd detail column has nowhere to go
 * alongside the 240px nav sidebar and the page's own content — collapse to
 * sidebar + content only rather than squeezing all three. Mirrors
 * `sovereign-tasks`' `DesktopTasksShell.DETAIL_COLLAPSE_BREAKPOINT_PX`
 * precedent exactly.
 */
const DETAIL_COLLAPSE_BREAKPOINT_PX = 900;

/**
 * Console shell layout — the plugin's own sub-navigation, nested inside the
 * platform sidebar (the runtime composes this plugin under the `(platform)`
 * route group, so the shell chrome wraps it automatically).
 *
 * Desktop: a persistent `ThreeColumnLayout` sidebar (`NavList variant="static"`)
 * + main column, `data-plugin-fullbleed` so the two columns each scroll
 * independently instead of the whole page scrolling as one unit (matches
 * `sovereign-tasks`' `DesktopTasksShell`/Warden's own fullbleed pages). A
 * page below `children` can register a 3rd "detail" column via
 * `ConsoleDetailSlot`/`useConsoleDetailPane` — this layout owns the column,
 * the page owns what's in it (mirrors `@sovereignfs/ui`'s `Dialog`/
 * `useOverlaySecondRow` pattern).
 * Mobile: no persistent sidebar — the bare `/console` route (Overview)
 * renders its own drill-down index (see `page.tsx`); every other section
 * gets a `‹ Console` back link above its content instead. No detail column
 * on mobile either — pages that register one are simply never rendered
 * through the `web` tree there.
 */
export default function ConsoleLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const activeId = activeConsoleSectionId(pathname);
  const isOverview = pathname === '/console';
  const [detailPane, setDetailPane] = useState<ReactNode | null>(null);
  const isNarrowDesktop = useIsMobile(DETAIL_COLLAPSE_BREAKPOINT_PX);

  const sidebarGroups = CONSOLE_SECTIONS.map((group) => ({
    ...group,
    items: group.items.map((item) => ({ ...item, active: item.id === activeId })),
  }));

  return (
    <ResponsiveSurface
      web={
        <div data-plugin-fullbleed className={styles.frame}>
          <ThreeColumnLayout sidebarWidth={240} detailWidth={360}>
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
              <OfflineGate surfaceName="Console">
                <ConsoleDetailPaneProvider value={setDetailPane}>
                  {children}
                </ConsoleDetailPaneProvider>
              </OfflineGate>
            </div>
            {!isNarrowDesktop && detailPane}
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
