'use client';

import { Icon } from '@sovereignfs/ui';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { SECTIONS } from '../_lib/sections';
import styles from './SectionsNav.module.css';

interface Props {
  /** Fired when a section link is tapped — used by the mobile Apps Drawer to
   *  close itself on navigation instead of staying open over the new slide. */
  onNavigate?: () => void;
}

/**
 * Shared section list — the desktop sidebar (app/_components/ExampleMobileShell.tsx)
 * and the mobile carousel's index slide (MobileSectionCarousel.tsx) both
 * render this same nav, mirroring how sovereign-tasks' ListSidebar backs both
 * its desktop sidebar and its mobile Lists-index carousel slide.
 */
export default function SectionsNav({ onNavigate }: Props) {
  const pathname = usePathname();

  return (
    <nav className={styles.nav} aria-label="Sections">
      <span className={styles.heading}>Sections</span>
      <ul className={styles.list}>
        {SECTIONS.map((section) => {
          const href = `/example-mobile-poc/${section.slug}`;
          const active = pathname === href;
          return (
            <li key={section.slug}>
              <Link
                href={href}
                className={[styles.item, active ? styles.itemActive : ''].join(' ')}
                aria-current={active ? 'page' : undefined}
                onClick={onNavigate}
              >
                <Icon name={section.icon} size="md" aria-hidden />
                <span>{section.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
