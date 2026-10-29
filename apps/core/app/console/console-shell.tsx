'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Icon,
  NavList,
  ResponsiveSurface,
  ThreeColumnLayout,
  type NavListGroup,
  type NavListItem,
} from '@sovereignfs/ui';
import { activeSection } from '../../src/console/sections';
import styles from './console.module.css';

type Section = NavListItem & { group?: string };

const renderLink: NonNullable<Parameters<typeof NavList>[0]['renderLink']> = (item, props) => (
  <Link href={item.href} className={props.className} aria-current={props['aria-current']}>
    {props.children}
  </Link>
);

/** Sections as the navigation groups them: those without a heading first, then each heading in the order met. */
function groupsOf(sections: readonly Section[], activeId: string | undefined): NavListGroup[] {
  const groups = new Map<string, NavListGroup>();
  for (const { group, ...item } of sections) {
    const key = group ?? '';
    const found = groups.get(key) ?? { id: key || 'main', label: group, items: [] };
    found.items.push({ ...item, active: item.id === activeId });
    groups.set(key, found);
  }
  return [...groups.values()];
}

/**
 * The Console beside its page: on a wide screen a list of the sections down the side; on a phone the list is
 * the first page (the Console's own page), and every other page has a way back to it, as a settings
 * app does. `sections` are only those the person may open.
 */
export function ConsoleShell({
  sections,
  children,
}: {
  sections: readonly Section[];
  children: ReactNode;
}) {
  const pathname = usePathname();
  const activeId = activeSection(pathname, sections);
  const atOverview = pathname === '/console';
  const others = sections.filter((section) => section.href !== '/console');

  return (
    <ResponsiveSurface
      web={
        <div className={styles.frame}>
          <ThreeColumnLayout sidebarWidth={240}>
            <div className={styles.sidebar}>
              <p className={styles.title}>Console</p>
              <NavList
                groups={groupsOf(sections, activeId)}
                variant="static"
                aria-label="Console sections"
                renderLink={renderLink}
              />
            </div>
            <div className={styles.main}>{children}</div>
          </ThreeColumnLayout>
        </div>
      }
      mobile={
        <div className={styles.mobileFrame}>
          {atOverview ? null : (
            <Link href="/console" className={styles.back}>
              <Icon name="chevron-left" size="sm" aria-hidden />
              Console
            </Link>
          )}
          {children}
          {atOverview && others.length > 0 ? (
            <NavList
              groups={groupsOf(others, undefined)}
              variant="drilldown"
              aria-label="Console sections"
              renderLink={renderLink}
            />
          ) : null}
        </div>
      }
    />
  );
}
