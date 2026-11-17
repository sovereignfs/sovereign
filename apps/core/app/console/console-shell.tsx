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
import { activeSection, parentPage } from '../../src/console/sections';
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
 * the first page (the Console's own page, which lists each section with what it is for). Every other page has one
 * way back, to the page above it, as a settings app does: "Add an app" to Apps, Apps to the Console. On a wide
 * screen the list already leads to each section, so only a page beneath a section has it. The pages draw no way
 * back of their own. `sections` are only those the person may open.
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
  const parent = parentPage(pathname, sections);
  const back = parent ? (
    <Link href={parent.href} className={styles.back}>
      <Icon name="chevron-left" size="sm" aria-hidden />
      {parent.label}
    </Link>
  ) : null;
  // A section's own page is already in the list down the side, so on a wide screen it needs no way back.
  const beneathSection = parent !== undefined && parent.href !== '/console';

  return (
    <ResponsiveSurface
      web={
        <div className={styles.frame}>
          <ThreeColumnLayout sidebarWidth={240} className={styles.fill}>
            <div className={styles.sidebar}>
              <p className={styles.title}>Console</p>
              <NavList
                groups={groupsOf(sections, activeId)}
                variant="static"
                aria-label="Console sections"
                renderLink={renderLink}
              />
            </div>
            <div className={styles.main}>
              {beneathSection ? <div className={styles.backRow}>{back}</div> : null}
              {children}
            </div>
          </ThreeColumnLayout>
        </div>
      }
      mobile={
        <div className={styles.mobileFrame}>
          {back}
          {children}
        </div>
      }
    />
  );
}
